import { eligibleWomanIdentified, promoteFormSubmission } from "@dynamic/event-core";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { buildHhqHouseholdPromotionValues, buildHhqMemberPromotionValues } from "./hhqPromotion";
import { writeTasksFromDescriptors } from "./taskWriter";
import type { FormAnswers } from "./promotionEventBridge";

type FormResponseRow = typeof schema.formResponses.$inferSelect;

export async function promoteHhq(response: FormResponseRow, answers: FormAnswers): Promise<void> {
  const now = new Date();
  const household = buildHhqHouseholdPromotionValues(response.household_id || "", answers, now);
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
      candidate.response_status !== "duplicate",
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
