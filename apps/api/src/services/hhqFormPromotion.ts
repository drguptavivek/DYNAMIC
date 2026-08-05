import { eligibleWomanIdentified, promoteFormSubmission } from "@dynamic/event-core";
import { and, eq, inArray, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { buildHhqHouseholdPromotionValues, buildHhqMemberPromotionValues } from "./hhqPromotion";
import { writeTasksFromDescriptors } from "./taskWriter";
import type { FormAnswers } from "./promotionEventBridge";

type FormResponseRow = typeof schema.formResponses.$inferSelect;
const HHQ_COMPETENT_RESPONDENT_FIELD = "hhq_competent_respondent_available";
const HHQ_MAX_VISITS = 3;
const HHQ_REVISIT_DELAY_DAYS = 1;

function toIsoDate(value: Date): string {
  return value.toISOString().split("T")[0];
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function isHhqEarlyStopResponse(answers: FormAnswers): boolean {
  const value = Number(answers?.[HHQ_COMPETENT_RESPONDENT_FIELD]);
  return value === 2 || value === 3;
}

function getHhqVisitNo(answers: FormAnswers): number {
  const parsed = Number(answers?.hhq_visit_no);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(HHQ_MAX_VISITS, Math.max(1, Math.trunc(parsed)));
}

async function getTaskForResponse(response: FormResponseRow) {
  if (!response.task_id) return null;
  const [task] = await getDb()
    .select()
    .from(schema.followUpTasks)
    .where(eq(schema.followUpTasks.task_id, response.task_id))
    .limit(1);
  return task || null;
}

async function promoteHhqEarlyStop(
  response: FormResponseRow,
  answers: FormAnswers,
  household: ReturnType<typeof buildHhqHouseholdPromotionValues>,
): Promise<void> {
  const now = new Date();
  const visitNo = getHhqVisitNo(answers);
  const nextVisitNo = visitNo + 1;
  const isExcluded = visitNo >= HHQ_MAX_VISITS && Number(answers[HHQ_COMPETENT_RESPONDENT_FIELD]) === 2;
  const responseStatus = isExcluded ? "excluded_after_revisits" : "revisit_needed";
  const eventType = isExcluded ? "household_baseline_excluded" : "household_baseline_revisit_needed";
  const eventId = randomUUID();

  await getDb()
    .update(schema.formResponses)
    .set({ response_status: "superseded_revisit" })
    .where(
      and(
        eq(schema.formResponses.form_code, "HHQ"),
        eq(schema.formResponses.household_id, household.household_id),
        ne(schema.formResponses.form_response_id, response.form_response_id),
        inArray(schema.formResponses.response_status, ["revisit_needed", "superseded_revisit"]),
      ),
    );

  await getDb()
    .update(schema.formResponses)
    .set({ response_status: responseStatus })
    .where(eq(schema.formResponses.form_response_id, response.form_response_id));

  await getDb()
    .insert(schema.households)
    .values({
      ...household,
      consent_status: "No",
      baseline_enrollment_status: isExcluded ? "excluded" : "pending",
      baseline_completed_date: null,
      cohort_status: isExcluded ? "excluded" : "listed",
      closed_reason: isExcluded ? "no_competent_respondent_after_3_visits" : null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [schema.households.household_id],
      set: {
        site_id: household.site_id,
        locality_code: household.locality_code,
        structure_map_id: household.structure_map_id,
        household_number: household.household_number,
        address: household.address,
        household_head_name: household.household_head_name,
        consent_status: "No",
        baseline_enrollment_status: isExcluded ? "excluded" : "pending",
        baseline_completed_date: null,
        cohort_status: isExcluded ? "excluded" : "listed",
        closed_reason: isExcluded ? "no_competent_respondent_after_3_visits" : null,
        sync_status: "synced",
        updated_at: now,
      },
    });

  await getDb().insert(schema.domainEvents).values({
    event_id: eventId,
    event_type: eventType,
    site_id: household.site_id,
    locality_code: household.locality_code,
    household_id: household.household_id,
    subject_type: "household",
    subject_id: household.household_id,
    task_id: response.task_id,
    form_response_id: response.form_response_id,
    event_datetime: response.created_offline_at ?? now,
    created_offline_at: response.created_offline_at,
    device_id: response.device_id,
    sync_status: "synced",
    apply_status: "applied",
    created_at: now,
  });

  if (isExcluded || nextVisitNo > HHQ_MAX_VISITS) return;

  const currentTask = await getTaskForResponse(response);
  const visitDate =
    typeof answers.hhq_interview_date === "string" && answers.hhq_interview_date
      ? answers.hhq_interview_date
      : toIsoDate(response.created_offline_at ?? now);
  const targetDate = addDaysIso(visitDate, HHQ_REVISIT_DELAY_DAYS);
  const protocolVisitLabel = `baseline-visit-${nextVisitNo}`;
  await getDb()
    .insert(schema.followUpTasks)
    .values({
      task_id: randomUUID(),
      task_key: `${household.household_id}:household:${household.household_id}:HHQ:${protocolVisitLabel}:${targetDate}:v1`,
      site_id: household.site_id,
      locality_code: household.locality_code,
      household_id: household.household_id,
      subject_type: "household",
      subject_id: household.household_id,
      task_type: "HHQ",
      form_code: "HHQ",
      expected_forms: ["HHQ"],
      protocol_visit_label: protocolVisitLabel,
      generation_source: "hhq_revisit",
      source_event_id: eventId,
      anchor_date: visitDate,
      window_start: targetDate,
      target_date: targetDate,
      deadline_date: addDaysIso(targetDate, 30),
      status: "planned",
      failed_attempt_count: visitNo,
      max_failed_attempts: HHQ_MAX_VISITS,
      requires_final_close_reason: false,
      rules_version: "1.0.0",
      form_availability: currentTask?.form_availability || "available",
      action_state: currentTask?.action_state || "enabled",
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing();
}

export async function promoteHhq(response: FormResponseRow, answers: FormAnswers): Promise<void> {
  const now = new Date();
  const household = buildHhqHouseholdPromotionValues(response.household_id || "", answers, now);
  if (isHhqEarlyStopResponse(answers)) {
    await promoteHhqEarlyStop(response, answers, household);
    return;
  }
  const interviewDate = household.baseline_completed_date;
  const priorResponses = await getDb()
    .select()
    .from(schema.formResponses)
    .where(
      and(
        eq(schema.formResponses.form_code, "HHQ"),
        eq(schema.formResponses.household_id, household.household_id),
      ),
    );
  const primaryResponse = priorResponses.find(
    (candidate) =>
      candidate.form_response_id !== response.form_response_id &&
      !["duplicate", "revisit_needed", "superseded_revisit", "excluded_after_revisits"].includes(
        candidate.response_status || "",
      ),
  );

  if (primaryResponse) {
    await getDb()
      .update(schema.formResponses)
      .set({ response_status: "duplicate" })
      .where(eq(schema.formResponses.form_response_id, response.form_response_id));

    await getDb().insert(schema.domainEvents).values({
      event_id: randomUUID(),
      event_type: "household_baseline_confirmed",
      site_id: household.site_id,
      locality_code: household.locality_code,
      household_id: household.household_id,
      subject_type: "household",
      subject_id: household.household_id,
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      event_datetime: response.created_offline_at ?? now,
      created_offline_at: response.created_offline_at,
      device_id: response.device_id,
      sync_status: "synced",
      apply_status: "held_duplicate",
      created_at: now,
    });

    await getDb().insert(schema.dataQualityFlags).values({
      flag_id: `duplicate:${primaryResponse.form_response_id}:${response.form_response_id}`,
      site_id: household.site_id,
      flag_type: "duplicate_task_completion",
      subject_type: "household",
      subject_id: household.household_id,
      task_id: response.task_id,
      primary_response_id: primaryResponse.form_response_id,
      duplicate_response_id: response.form_response_id,
      severity: "warning",
      status: "open",
      created_at: now,
    });
    return;
  }

  await getDb()
    .insert(schema.households)
    .values(household)
    .onConflictDoUpdate({
      target: [schema.households.household_id],
      set: {
        site_id: household.site_id,
        locality_code: household.locality_code,
        structure_map_id: household.structure_map_id,
        household_number: household.household_number,
        residence_area_type: household.residence_area_type,
        address: household.address,
        household_head_name: household.household_head_name,
        contact_mobile: household.contact_mobile,
        consent_status: household.consent_status,
        result_interview: household.result_interview,
        language_questionnaire: household.language_questionnaire,
        baseline_enrollment_status: household.baseline_enrollment_status,
        baseline_completed_date: household.baseline_completed_date,
        sync_status: household.sync_status,
        updated_at: now,
      },
    });

  const membersPanel = (answers.hhq_household_members || []) as any[];
  const wqTasks = [];
  for (const [index, member] of membersPanel.entries()) {
    const promotedMember = buildHhqMemberPromotionValues(
      household,
      member,
      index,
      interviewDate,
      now,
    );

    await getDb()
      .insert(schema.householdMembers)
      .values(promotedMember)
      .onConflictDoUpdate({
        target: [schema.householdMembers.household_id, schema.householdMembers.member_number],
        set: {
          site_id: promotedMember.site_id,
          locality_code: promotedMember.locality_code,
          name: promotedMember.name,
          relationship_to_head: promotedMember.relationship_to_head,
          sex: promotedMember.sex,
          last_residence_place: promotedMember.last_residence_place,
          residence_months: promotedMember.residence_months,
          residence_years: promotedMember.residence_years,
          date_of_birth: promotedMember.date_of_birth,
          date_of_birth_precision: promotedMember.date_of_birth_precision,
          reported_age_years: promotedMember.reported_age_years,
          reported_age_as_of_date: interviewDate,
          dob_inference_rule_version: promotedMember.dob_inference_rule_version,
          marital_status: promotedMember.marital_status,
          woman_questionnaire_eligible: promotedMember.woman_questionnaire_eligible,
          birth_registration_status: promotedMember.birth_registration_status,
          ever_attended_school: promotedMember.ever_attended_school,
          highest_grade_completed: promotedMember.highest_grade_completed,
          member_status: promotedMember.member_status,
          usual_resident: promotedMember.usual_resident,
          member_source: promotedMember.member_source,
          sync_status: promotedMember.sync_status,
          updated_at: now,
        },
      });

    if (promotedMember.woman_questionnaire_eligible) {
      await getDb()
        .insert(schema.eligibleWomen)
        .values({
          woman_id: promotedMember.household_member_id,
          household_member_id: promotedMember.household_member_id,
          household_id: household.household_id,
          site_id: household.site_id,
          locality_code: household.locality_code,
          eligibility_start_date: interviewDate,
          eligibility_source_event_id: undefined,
          wq_status: "pending",
          tracking_status: "not_tracked",
          current_eligibility_status: "eligible",
          eligibility_basis: "baseline_hhq",
          sync_status: "synced",
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [schema.eligibleWomen.woman_id],
          set: {
            household_member_id: promotedMember.household_member_id,
            household_id: household.household_id,
            site_id: household.site_id,
            locality_code: household.locality_code,
            eligibility_start_date: interviewDate,
            current_eligibility_status: "eligible",
            eligibility_basis: "baseline_hhq",
            sync_status: "synced",
            updated_at: now,
          },
        });

      const eligibleWomanEvent = eligibleWomanIdentified.buildEvent({
        event_id: `hhq:${household.household_id}:${promotedMember.household_member_id}`,
        site_id: household.site_id,
        locality_code: household.locality_code,
        household_id: household.household_id,
        woman_id: promotedMember.household_member_id,
        eligibility_start_date: interviewDate,
        recorded_at: (response.created_offline_at ?? now).toISOString(),
        task_id: response.task_id,
        form_response_id: response.form_response_id,
        device_id: response.device_id,
      });
      wqTasks.push(...eligibleWomanIdentified.planWorkflow({ event: eligibleWomanEvent }));
    }
  }

  const householdBaselineEventId = randomUUID();
  const householdBaselinePromotion = promoteFormSubmission({
    form_code: response.form_code,
    event_id: householdBaselineEventId,
    site_id: household.site_id,
    locality_code: household.locality_code,
    household_id: household.household_id,
    answers_json: answers,
    recorded_at: (response.created_offline_at ?? now).toISOString(),
    task_id: response.task_id,
    form_response_id: response.form_response_id,
    device_id: response.device_id,
    context: {
      household_number: household.household_number,
      structure_map_id: household.structure_map_id,
    },
  });
  if (!householdBaselinePromotion) {
    throw new Error(`No form submission trigger registered for ${response.form_code}`);
  }
  const tasks = householdBaselinePromotion.task_descriptors;
  await writeTasksFromDescriptors([...tasks, ...wqTasks]);

  await getDb().insert(schema.domainEvents).values({
    event_id: householdBaselineEventId,
    event_type: "household_baseline_confirmed",
    site_id: household.site_id,
    locality_code: household.locality_code,
    household_id: household.household_id,
    subject_type: "household",
    subject_id: household.household_id,
    task_id: response.task_id,
    form_response_id: response.form_response_id,
    event_datetime: response.created_offline_at ?? now,
    created_offline_at: response.created_offline_at,
    device_id: response.device_id,
    sync_status: "synced",
    apply_status: "applied",
    created_at: now,
  });
}
