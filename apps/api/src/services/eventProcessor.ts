import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { eq, and, inArray, ne } from "drizzle-orm";
import {
  childDeathRecorded,
  promoteFormSubmission,
  wqCompleted,
} from "@dynamic/event-core";
import { writeTasksFromDescriptors } from "./taskWriter";
import { randomUUID } from "crypto";
import {
  FormAnswers,
  toIsoDate,
} from "./promotionEventBridge";
import { promoteHhq } from "./hhqFormPromotion";
import { promotePef } from "./pregnancyEnrollmentPromotion";
import { holdUnsupportedFormForReview } from "./unsupportedFormPromotion";
export {
  rebuildAllProjectionRows,
  rebuildHhqHouseholdProjection,
  rebuildHouseholdProjections,
  rebuildPregnancyProjection,
} from "./projectionReplay";

type FormResponseRow = typeof schema.formResponses.$inferSelect;
type PromotionHandler = (response: FormResponseRow, answers: FormAnswers) => Promise<void>;
const WQ_WOMAN_AVAILABLE_FIELD = "wq_woman_available";
const WQ_CURRENT_MARITAL_STATUS_FIELD = "wq_current_marital_status";
const WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD = "wq_pregnancy_tracking_eligible";
const WQ_MAX_VISITS = 3;
const WQ_REVISIT_DELAY_DAYS = 1;

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function getWqVisitNo(answers: FormAnswers): number {
  const parsed = Number(answers?.wq_visit_no);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(WQ_MAX_VISITS, Math.max(1, Math.trunc(parsed)));
}

function getWqAvailability(answers: FormAnswers): number {
  return Number(answers?.[WQ_WOMAN_AVAILABLE_FIELD]);
}

function isWqRevisitResponse(answers: FormAnswers): boolean {
  const value = getWqAvailability(answers);
  return value === 3 || value === 4;
}

function isWqIncapacitatedResponse(answers: FormAnswers): boolean {
  return getWqAvailability(answers) === 2;
}

function isWqNeverMarriedResponse(answers: FormAnswers): boolean {
  return Number(answers?.[WQ_CURRENT_MARITAL_STATUS_FIELD]) === 7;
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

export async function processFormResponse(formResponseId: string): Promise<void> {
  try {
    // Load form response with task and household context
    const formResponse = await getDb()
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.form_response_id, formResponseId))
      .limit(1);

    if (formResponse.length === 0) {
      throw new Error(`Form response not found: ${formResponseId}`);
    }

    const response = formResponse[0];
    const answers = (response.answers_json || {}) as FormAnswers;
    const handler = FORM_PROMOTION_HANDLERS[response.form_code];

    if (!handler) {
      throw new Error(`Unknown form code, cannot promote: ${response.form_code}`);
    }
    await handler(response, answers);
  } catch (err) {
    console.error(`Error processing form response ${formResponseId}:`, err);
    throw err;
  }
}

const FORM_PROMOTION_HANDLERS: Record<string, PromotionHandler> = {
  HHQ: (response, answers) => promoteHhq(response, answers),
  WQ: (response, answers) =>
    promoteWq(response, response.household_id || "", response.subject_id || "", answers),
  PEF: (response, answers) =>
    promotePef(response, response.household_id || "", response.subject_id || "", answers),
  PFF: (response, answers) =>
    promotePff(response, response.household_id || "", response.subject_id || "", answers),
  UF: async (response, answers) => {
    if (response.subject_id) {
      await promoteUf(response.subject_id, answers);
    }
  },
  POF: (response, answers) =>
    promotePof(response, response.household_id || "", response.subject_id || "", answers),
  BAF: async (response, answers) => {
    if (response.subject_id) {
      await promoteBaf(response, response.subject_id, answers);
    }
  },
  NFF: async (response, answers) => {
    if (response.subject_id) {
      await promoteNff(response.subject_id, answers, response.subject_id);
    }
  },
  CDF: async (response, answers) => {
    if (response.subject_id) {
      await promoteCdf(response, response.subject_id, answers);
    }
  },
  SBF: async (response) => holdUnsupportedFormForReview(response, "SBF"),
};

async function promoteWq(
  response: FormResponseRow,
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    const isPregnancyTrackingEligible =
      answers[WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD] === "1" ||
      answers[WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD] === 1 ||
      answers[WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD] === true;

    // Get household info
    const household = await getDb()
      .select()
      .from(schema.households)
      .where(eq(schema.households.household_id, householdId))
      .limit(1);

    if (household.length === 0) return;
    const hh = household[0];
    const existingTask = await getTaskForResponse(response);

    // Check if eligible woman already exists
    const existingWoman = await getDb()
      .select()
      .from(schema.eligibleWomen)
      .where(eq(schema.eligibleWomen.household_member_id, subjectId))
      .limit(1);

    let womanId = existingWoman.length > 0 ? existingWoman[0].woman_id : subjectId || randomUUID();
    const now = new Date();
    const completedDate =
      typeof answers.wq_interview_date === "string" && answers.wq_interview_date
        ? answers.wq_interview_date
        : toIsoDate(response.created_offline_at ?? now);

    if (isWqIncapacitatedResponse(answers)) {
      await getDb()
        .update(schema.formResponses)
        .set({ response_status: "incapacitated" })
        .where(eq(schema.formResponses.form_response_id, response.form_response_id));

      await getDb()
        .insert(schema.eligibleWomen)
        .values({
          woman_id: womanId,
          household_member_id: subjectId,
          household_id: householdId,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          eligibility_start_date: existingWoman[0]?.eligibility_start_date ?? completedDate,
          wq_status: "incapacitated",
          tracking_status: existingWoman[0]?.tracking_status ?? "not_tracked",
          current_eligibility_status: "eligible",
          eligibility_basis: existingWoman[0]?.eligibility_basis ?? "baseline_hhq",
          sync_status: "synced",
          created_at: existingWoman[0]?.created_at ?? now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [schema.eligibleWomen.woman_id],
          set: {
            wq_status: "incapacitated",
            updated_at: now,
          },
        });

      await getDb().insert(schema.domainEvents).values({
        event_id: randomUUID(),
        event_type: "wq_incapacitated",
        site_id: hh.site_id,
        locality_code: hh.locality_code,
        household_id: householdId,
        subject_type: "person",
        subject_id: womanId,
        task_id: response.task_id,
        form_response_id: response.form_response_id,
        event_datetime: response.created_offline_at ?? now,
        created_offline_at: response.created_offline_at,
        device_id: response.device_id,
        sync_status: "synced",
        apply_status: "applied",
        created_at: now,
      });
      return;
    }

    if (isWqRevisitResponse(answers)) {
      const visitNo = getWqVisitNo(answers);
      const nextVisitNo = visitNo + 1;
      const isExcluded = visitNo >= WQ_MAX_VISITS;
      const responseStatus = isExcluded ? "excluded_after_revisits" : "revisit_needed";
      const eventType = isExcluded ? "wq_excluded_after_revisits" : "wq_revisit_needed";
      const eventId = randomUUID();

      await getDb()
        .update(schema.formResponses)
        .set({ response_status: "superseded_revisit" })
        .where(
          and(
            eq(schema.formResponses.form_code, "WQ"),
            eq(schema.formResponses.subject_id, womanId),
            ne(schema.formResponses.form_response_id, response.form_response_id),
            inArray(schema.formResponses.response_status, ["revisit_needed", "superseded_revisit"]),
          ),
        );

      await getDb()
        .update(schema.formResponses)
        .set({ response_status: responseStatus })
        .where(eq(schema.formResponses.form_response_id, response.form_response_id));

      await getDb()
        .insert(schema.eligibleWomen)
        .values({
          woman_id: womanId,
          household_member_id: subjectId,
          household_id: householdId,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          eligibility_start_date: existingWoman[0]?.eligibility_start_date ?? completedDate,
          wq_status: isExcluded ? "excluded" : "pending",
          tracking_status: existingWoman[0]?.tracking_status ?? "not_tracked",
          current_eligibility_status: isExcluded ? "excluded" : "eligible",
          eligibility_basis: existingWoman[0]?.eligibility_basis ?? "baseline_hhq",
          sync_status: "synced",
          created_at: existingWoman[0]?.created_at ?? now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [schema.eligibleWomen.woman_id],
          set: {
            wq_status: isExcluded ? "excluded" : "pending",
            current_eligibility_status: isExcluded ? "excluded" : "eligible",
            updated_at: now,
          },
        });

      await getDb().insert(schema.domainEvents).values({
        event_id: eventId,
        event_type: eventType,
        site_id: hh.site_id,
        locality_code: hh.locality_code,
        household_id: householdId,
        subject_type: "person",
        subject_id: womanId,
        task_id: response.task_id,
        form_response_id: response.form_response_id,
        event_datetime: response.created_offline_at ?? now,
        created_offline_at: response.created_offline_at,
        device_id: response.device_id,
        sync_status: "synced",
        apply_status: "applied",
        created_at: now,
      });

      if (isExcluded || nextVisitNo > WQ_MAX_VISITS) return;

      const targetDate = addDaysIso(completedDate, WQ_REVISIT_DELAY_DAYS);
      const protocolVisitLabel = `baseline-visit-${nextVisitNo}`;
      await getDb()
        .insert(schema.followUpTasks)
        .values({
          task_id: randomUUID(),
          task_key: `${householdId}:person:${womanId}:WQ:${protocolVisitLabel}:${targetDate}:v1`,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          household_id: householdId,
          subject_type: "person",
          subject_id: womanId,
          woman_id: womanId,
          task_type: "WQ",
          form_code: "WQ",
          expected_forms: ["WQ"],
          protocol_visit_label: protocolVisitLabel,
          generation_source: "wq_revisit",
          source_event_id: eventId,
          anchor_date: completedDate,
          window_start: targetDate,
          target_date: targetDate,
          deadline_date: addDaysIso(targetDate, 30),
          status: "planned",
          failed_attempt_count: visitNo,
          max_failed_attempts: WQ_MAX_VISITS,
          requires_final_close_reason: false,
          rules_version: "1.0.0",
          form_availability: existingTask?.form_availability || "available",
          action_state: existingTask?.action_state || "enabled",
          created_at: now,
          updated_at: now,
        })
        .onConflictDoNothing();
      return;
    }

    if (isWqNeverMarriedResponse(answers)) {
      await getDb()
        .update(schema.formResponses)
        .set({ response_status: "never_married_terminal" })
        .where(eq(schema.formResponses.form_response_id, response.form_response_id));

      await getDb()
        .insert(schema.eligibleWomen)
        .values({
          woman_id: womanId,
          household_member_id: subjectId,
          household_id: householdId,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          eligibility_start_date: existingWoman[0]?.eligibility_start_date ?? completedDate,
          wq_status: "not_eligible",
          tracking_status: "not_tracked",
          current_eligibility_status: "not_eligible",
          eligibility_basis: existingWoman[0]?.eligibility_basis ?? "baseline_hhq",
          sync_status: "synced",
          created_at: existingWoman[0]?.created_at ?? now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [schema.eligibleWomen.woman_id],
          set: {
            wq_status: "not_eligible",
            tracking_status: "not_tracked",
            current_eligibility_status: "not_eligible",
            updated_at: now,
          },
        });

      await getDb().insert(schema.domainEvents).values({
        event_id: randomUUID(),
        event_type: "wq_never_married_terminal",
        site_id: hh.site_id,
        locality_code: hh.locality_code,
        household_id: householdId,
        subject_type: "person",
        subject_id: womanId,
        task_id: response.task_id,
        form_response_id: response.form_response_id,
        event_datetime: response.created_offline_at ?? now,
        created_offline_at: response.created_offline_at,
        device_id: response.device_id,
        sync_status: "synced",
        apply_status: "applied",
        created_at: now,
      });
      return;
    }

    // Upsert eligible woman
    await getDb()
      .insert(schema.eligibleWomen)
      .values({
        woman_id: womanId,
        household_member_id: subjectId,
        household_id: householdId,
        site_id: hh.site_id,
        locality_code: hh.locality_code,
        eligibility_start_date: existingWoman[0]?.eligibility_start_date ?? completedDate,
        wq_status: "completed",
        tracking_status: isPregnancyTrackingEligible ? "enrolled" : "not_pregnant",
        current_eligibility_status: "eligible",
        created_at: existingWoman[0]?.created_at ?? now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [schema.eligibleWomen.woman_id],
        set: {
          household_member_id: subjectId,
          household_id: householdId,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          wq_status: "completed",
          tracking_status: isPregnancyTrackingEligible ? "enrolled" : "not_pregnant",
          current_eligibility_status: "eligible",
          updated_at: now,
        },
      });

    if (isPregnancyTrackingEligible) {
      // Check if pregnancy already exists
      const existingPregnancy = await getDb()
        .select()
        .from(schema.pregnancies)
        .where(eq(schema.pregnancies.household_member_id, subjectId))
        .limit(1);

      if (existingPregnancy.length === 0) {
        // Create pregnancy record
        const pregnancyId = randomUUID();
        await getDb().insert(schema.pregnancies).values({
          pregnancy_id: pregnancyId,
          woman_id: womanId,
          household_member_id: subjectId,
          household_id: householdId,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          pregnancy_sequence: 1,
          pregnancy_status: "active",
          detected_date: completedDate,
          detection_source: "wq",
          created_at: now,
          updated_at: now,
        });
      }

      // Generate PEF task
      const wqEvent = wqCompleted.buildEvent({
        event_id: randomUUID(),
        site_id: hh.site_id,
        locality_code: hh.locality_code,
        household_id: householdId,
        woman_id: womanId,
        wq_pregnant: true,
        completed_date: completedDate,
        recorded_at: now.toISOString(),
        task_id: response.task_id,
        form_response_id: response.form_response_id,
        device_id: response.device_id || undefined,
      });
      const tasks = wqCompleted.planWorkflow({ event: wqEvent });
      await writeTasksFromDescriptors(tasks);
    }
  } catch (err) {
    console.error(`Error in promoteWq for ${householdId}/${subjectId}:`, err);
    throw err;
  }
}

async function promoteUf(pregnancyId: string, answers: FormAnswers): Promise<void> {
  try {
    // Ultrasound may refine EDD
    const eddDate = answers.uf_edd;
    if (eddDate) {
      await getDb()
        .update(schema.pregnancies)
        .set({
          edd_date: eddDate,
          updated_at: new Date(),
        })
        .where(eq(schema.pregnancies.pregnancy_id, pregnancyId));
    }
  } catch (err) {
    console.error(`Error in promoteUf for ${pregnancyId}:`, err);
    throw err;
  }
}

async function findPregnancyForResponse(
  response: FormResponseRow,
  subjectId: string,
): Promise<typeof schema.pregnancies.$inferSelect | null> {
  if (response.subject_type === "pregnancy" && subjectId) {
    const [pregnancy] = await getDb()
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.pregnancy_id, subjectId))
      .limit(1);
    if (pregnancy) {
      return pregnancy;
    }
  }

  const [pregnancy] = await getDb()
    .select()
    .from(schema.pregnancies)
    .where(eq(schema.pregnancies.household_member_id, subjectId))
    .limit(1);
  return pregnancy ?? null;
}

async function promotePff(
  response: FormResponseRow,
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    const pregnancy = await findPregnancyForResponse(response, subjectId);
    if (!pregnancy) {
      throw new Error(`No pregnancy found for PFF subject ${subjectId}`);
    }

    const now = new Date();
    const visitDate =
      typeof answers.pff_visit_date === "string" && answers.pff_visit_date
        ? answers.pff_visit_date
        : toIsoDate(response.created_offline_at ?? response.created_at ?? now);
    const priorResponses = await getDb()
      .select()
      .from(schema.formResponses)
      .where(
        response.task_id
          ? and(
              eq(schema.formResponses.form_code, "PFF"),
              eq(schema.formResponses.task_id, response.task_id),
            )
          : and(
              eq(schema.formResponses.form_code, "PFF"),
              eq(schema.formResponses.subject_id, subjectId),
            ),
      );
    const primaryResponse = priorResponses.find(
      (candidate) =>
        candidate.form_response_id !== response.form_response_id &&
        candidate.response_status !== "duplicate",
    );
    const applyStatus = primaryResponse ? "held_duplicate" : "applied";
    const eventId = randomUUID();

    if (primaryResponse) {
      await getDb()
        .update(schema.formResponses)
        .set({ response_status: "duplicate" })
        .where(eq(schema.formResponses.form_response_id, response.form_response_id));
    }

    await getDb().insert(schema.domainEvents).values({
      event_id: eventId,
      event_type: "pregnancy_followup_completed",
      site_id: pregnancy.site_id,
      locality_code: pregnancy.locality_code,
      household_id: pregnancy.household_id || householdId,
      subject_type: "pregnancy",
      subject_id: pregnancy.pregnancy_id,
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      event_datetime: response.created_offline_at ?? now,
      created_offline_at: response.created_offline_at,
      device_id: response.device_id,
      sync_status: "synced",
      apply_status: applyStatus,
      created_at: now,
    });

    if (primaryResponse) {
      await getDb().insert(schema.dataQualityFlags).values({
        flag_id: `duplicate:${primaryResponse.form_response_id}:${response.form_response_id}`,
        site_id: pregnancy.site_id,
        flag_type: "duplicate_task_completion",
        subject_type: "pregnancy",
        subject_id: pregnancy.pregnancy_id,
        task_id: response.task_id,
        primary_response_id: primaryResponse.form_response_id,
        duplicate_response_id: response.form_response_id,
        severity: "warning",
        status: "open",
        created_at: now,
      });
      return;
    }

    if (answers.pff_pregnancy_status === 2 || answers.pff_pregnancy_status === "2") {
      await getDb()
        .update(schema.pregnancies)
        .set({
          outcome_recorded_date: visitDate,
          updated_at: now,
        })
        .where(eq(schema.pregnancies.pregnancy_id, pregnancy.pregnancy_id));
    }
  } catch (err) {
    console.error(`Error in promotePff for ${householdId}/${subjectId}:`, err);
    throw err;
  }
}

async function promotePof(
  response: FormResponseRow,
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    const pregnancy = await findPregnancyForResponse(response, subjectId);
    if (!pregnancy) {
      throw new Error(`No pregnancy found for woman ${subjectId}`);
    }

    const eventId = randomUUID();
    const now = new Date();
    const promotion = promoteFormSubmission({
      form_code: response.form_code,
      event_id: eventId,
      site_id: pregnancy.site_id,
      locality_code: pregnancy.locality_code,
      household_id: pregnancy.household_id || householdId,
      subject_id: pregnancy.pregnancy_id,
      answers_json: answers,
      recorded_at: (response.created_offline_at ?? now).toISOString(),
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      device_id: response.device_id,
      context: {
        pregnancy_id: pregnancy.pregnancy_id,
        woman_id: pregnancy.woman_id,
      },
    });
    if (!promotion) {
      throw new Error(`No form submission trigger registered for ${response.form_code}`);
    }
    const payload = promotion.event.payload as {
      outcome_date: string;
      outcome_type: string;
      live_birth_count: number;
      stillbirth_count: number;
    };
    const deliveryDate = payload.outcome_date;
    const livebirths = payload.live_birth_count;
    const stillbirths = payload.stillbirth_count;

    await getDb().insert(schema.domainEvents).values({
      event_id: eventId,
      event_type: promotion.event.event_type,
      site_id: pregnancy.site_id,
      locality_code: pregnancy.locality_code,
      household_id: pregnancy.household_id || householdId,
      subject_type: "pregnancy",
      subject_id: pregnancy.pregnancy_id,
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      event_datetime: response.created_offline_at ?? now,
      created_offline_at: response.created_offline_at,
      device_id: response.device_id,
      sync_status: "synced",
      apply_status: "applied",
      created_at: now,
    });

    await getDb().insert(schema.pregnancyOutcomes).values({
      pregnancy_outcome_id: randomUUID(),
      pregnancy_id: pregnancy.pregnancy_id,
      outcome_date: deliveryDate,
      outcome_type: livebirths > 0 ? "live_birth" : "stillbirth",
      live_birth_count: livebirths,
      fetal_loss_count: stillbirths,
      source_form_response_id: response.form_response_id,
      created_at: now,
    });

    // Update pregnancy outcome
    await getDb()
      .update(schema.pregnancies)
      .set({
        pregnancy_status: "closed",
        outcome_recorded_date: deliveryDate,
        updated_at: now,
      })
      .where(eq(schema.pregnancies.pregnancy_id, pregnancy.pregnancy_id));

    // Create child records for live births and stillbirths
    for (let i = 0; i < livebirths; i++) {
      const childId = randomUUID();
      const birthId = randomUUID();
      await getDb().insert(schema.children).values({
        child_id: childId,
        birth_id: birthId,
        pregnancy_id: pregnancy.pregnancy_id,
        woman_id: pregnancy.woman_id,
        household_id: householdId,
        site_id: pregnancy.site_id,
        birth_rank: i + 1,
        birth_date: deliveryDate,
        birth_status: "live_birth",
        live_birth_status: true,
        current_vital_status: "alive",
        source_event_id: eventId,
        created_at: now,
        updated_at: now,
      });
    }

    for (let i = 0; i < stillbirths; i++) {
      const childId = randomUUID();
      const birthId = randomUUID();
      await getDb().insert(schema.children).values({
        child_id: childId,
        birth_id: birthId,
        pregnancy_id: pregnancy.pregnancy_id,
        woman_id: pregnancy.woman_id,
        household_id: householdId,
        site_id: pregnancy.site_id,
        birth_rank: livebirths + i + 1,
        birth_date: deliveryDate,
        birth_status: "stillbirth",
        live_birth_status: false,
        current_vital_status: "stillbirth",
        source_event_id: eventId,
        created_at: now,
        updated_at: now,
      });
    }

    await writeTasksFromDescriptors(promotion.task_descriptors);
  } catch (err) {
    console.error(`Error in promotePof for ${householdId}/${subjectId}:`, err);
    throw err;
  }
}

async function promoteBaf(
  response: FormResponseRow,
  childId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    const birthWeight = parseInt(answers.baf_weight_birth_grams);

    // Get child record to fetch related info
    const children = await getDb()
      .select()
      .from(schema.children)
      .where(eq(schema.children.child_id, childId))
      .limit(1);

    if (children.length === 0) {
      throw new Error(`Child not found: ${childId}`);
    }

    const child = children[0];
    const localityCode = child.household_id.split("-")[1] || "";
    const promotion = promoteFormSubmission({
      form_code: response.form_code,
      event_id: randomUUID(),
      site_id: child.site_id,
      locality_code: localityCode,
      household_id: child.household_id,
      subject_id: childId,
      answers_json: answers,
      recorded_at: new Date().toISOString(),
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      device_id: response.device_id,
      context: {
        pregnancy_id: child.pregnancy_id,
        woman_id: child.woman_id,
        child_id: childId,
        birth_date: child.birth_date || new Date().toISOString().split("T")[0],
        birth_status:
          (child.birth_status as "live_birth" | "stillbirth" | "fetal_loss_20plus") ||
          "live_birth",
      },
    });
    if (!promotion) {
      throw new Error(`No form submission trigger registered for ${response.form_code}`);
    }
    const payload = promotion.event.payload as { current_vital_status?: string };

    await getDb()
      .update(schema.children)
      .set({
        birth_weight_grams: isNaN(birthWeight) ? null : birthWeight,
        current_vital_status: payload.current_vital_status || "alive",
        updated_at: new Date(),
      })
      .where(eq(schema.children.child_id, childId));

    await getDb().insert(schema.domainEvents).values({
      event_id: promotion.event.event_id,
      event_type: promotion.event.event_type,
      site_id: child.site_id,
      locality_code: localityCode,
      household_id: child.household_id,
      subject_type: "child",
      subject_id: childId,
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      event_datetime: response.created_offline_at ?? new Date(),
      created_offline_at: response.created_offline_at,
      device_id: response.device_id,
      sync_status: "synced",
      apply_status: "applied",
      created_at: new Date(),
    });

    await writeTasksFromDescriptors(promotion.task_descriptors);
  } catch (err) {
    console.error(`Error in promoteBaf for ${childId}:`, err);
    throw err;
  }
}

async function promoteNff(
  childId: string,
  answers: FormAnswers,
  protocolVisitLabel: string,
): Promise<void> {
  try {
    const vitalStatus = answers.nff_vital_status;

    // Get child record
    const children = await getDb()
      .select()
      .from(schema.children)
      .where(eq(schema.children.child_id, childId))
      .limit(1);

    if (children.length === 0) {
      throw new Error(`Child not found: ${childId}`);
    }

    const child = children[0];
    const localityCode = child.household_id.split("-")[1] || "";

    if (vitalStatus) {
      await getDb()
        .update(schema.children)
        .set({
          current_vital_status: vitalStatus,
          updated_at: new Date(),
        })
        .where(eq(schema.children.child_id, childId));
    }

    // Check if child death
    if (vitalStatus === "dead") {
      // Generate VA task
      const deathEvent = childDeathRecorded.buildEvent({
        event_id: randomUUID(),
        site_id: child.site_id,
        locality_code: localityCode,
        household_id: child.household_id,
        woman_id: child.woman_id,
        child_id: childId,
        pregnancy_id: child.pregnancy_id,
        death_date: new Date().toISOString().split("T")[0],
        recorded_at: new Date().toISOString(),
      });
      const tasks = childDeathRecorded.planWorkflow({ event: deathEvent });
      await writeTasksFromDescriptors(tasks);
    }
  } catch (err) {
    console.error(`Error in promoteNff for ${childId}:`, err);
    throw err;
  }
}

async function promoteCdf(
  response: FormResponseRow,
  childId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    // Get child record
    const children = await getDb()
      .select()
      .from(schema.children)
      .where(eq(schema.children.child_id, childId))
      .limit(1);

    if (children.length === 0) {
      throw new Error(`Child not found: ${childId}`);
    }

    const child = children[0];
    const localityCode = child.household_id.split("-")[1] || "";
    const promotion = promoteFormSubmission({
      form_code: response.form_code,
      event_id: randomUUID(),
      site_id: child.site_id,
      locality_code: localityCode,
      household_id: child.household_id,
      subject_id: childId,
      answers_json: answers,
      recorded_at: (response.created_offline_at ?? new Date()).toISOString(),
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      device_id: response.device_id,
      context: {
        pregnancy_id: child.pregnancy_id,
        woman_id: child.woman_id,
        child_id: childId,
      },
    });
    if (!promotion) {
      throw new Error(`No form submission trigger registered for ${response.form_code}`);
    }
    const payload = promotion.event.payload as { death_date?: string };
    const deathDate = payload.death_date || new Date().toISOString().split("T")[0];

    await getDb()
      .update(schema.children)
      .set({
        current_vital_status: "dead",
        death_date: deathDate,
        updated_at: new Date(),
      })
      .where(eq(schema.children.child_id, childId));

    await getDb().insert(schema.domainEvents).values({
      event_id: promotion.event.event_id,
      event_type: promotion.event.event_type,
      site_id: child.site_id,
      locality_code: localityCode,
      household_id: child.household_id,
      subject_type: "child",
      subject_id: childId,
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      event_datetime: response.created_offline_at ?? new Date(),
      created_offline_at: response.created_offline_at,
      device_id: response.device_id,
      sync_status: "synced",
      apply_status: "applied",
      created_at: new Date(),
    });

    await writeTasksFromDescriptors(promotion.task_descriptors);
  } catch (err) {
    console.error(`Error in promoteCdf for ${childId}:`, err);
    throw err;
  }
}
