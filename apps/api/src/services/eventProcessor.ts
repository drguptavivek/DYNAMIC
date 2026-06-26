import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { eq, and } from "drizzle-orm";
import {
  onWqCompleted,
  onPregnancyOutcomeRecorded,
  onBirthAssessmentCompleted,
  onChildDeath,
} from "@dynamic/shared-workflow";
import { writeTasksFromDescriptors } from "./taskWriter";
import { randomUUID } from "crypto";
import {
  FormAnswers,
  toIsoDate,
} from "./promotionEventBridge";
import { promoteHhq } from "./hhqFormPromotion";
import { promotePef } from "./pregnancyEnrollmentPromotion";
import { holdUnsupportedFormForReview } from "./unsupportedFormPromotion";
export { rebuildHhqHouseholdProjection } from "./projectionReplay";

type FormResponseRow = typeof schema.formResponses.$inferSelect;
type PromotionHandler = (response: FormResponseRow, answers: FormAnswers) => Promise<void>;

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
    promoteWq(response.household_id || "", response.subject_id || "", answers),
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
      await promoteBaf(response.subject_id, answers);
    }
  },
  NFF: async (response, answers) => {
    if (response.subject_id) {
      await promoteNff(response.subject_id, answers, response.subject_id);
    }
  },
  CDF: async (response, answers) => {
    if (response.subject_id) {
      await promoteCdf(response.subject_id, answers);
    }
  },
  SBF: async (response) => holdUnsupportedFormForReview(response, "SBF"),
};

async function promoteWq(
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    const isPregnant =
      answers.wq_pregnant === "1" || answers.wq_pregnant === 1 || answers.wq_pregnant === true;

    // Get household info
    const household = await getDb()
      .select()
      .from(schema.households)
      .where(eq(schema.households.household_id, householdId))
      .limit(1);

    if (household.length === 0) return;
    const hh = household[0];

    // Check if eligible woman already exists
    const existingWoman = await getDb()
      .select()
      .from(schema.eligibleWomen)
      .where(eq(schema.eligibleWomen.household_member_id, subjectId))
      .limit(1);

    let womanId = existingWoman.length > 0 ? existingWoman[0].woman_id : subjectId || randomUUID();

    // Upsert eligible woman
    await getDb()
      .insert(schema.eligibleWomen)
      .values({
        woman_id: womanId,
        household_member_id: subjectId,
        household_id: householdId,
        site_id: hh.site_id,
        locality_code: hh.locality_code,
        eligibility_start_date: new Date().toISOString().split("T")[0],
        wq_status: "completed",
        tracking_status: isPregnant ? "enrolled" : "not_pregnant",
        current_eligibility_status: "eligible",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.eligibleWomen.woman_id],
        set: {
          household_member_id: subjectId,
          household_id: householdId,
          site_id: hh.site_id,
          locality_code: hh.locality_code,
          wq_status: "completed",
          tracking_status: isPregnant ? "enrolled" : "not_pregnant",
          current_eligibility_status: "eligible",
          updated_at: new Date(),
        },
      });

    if (isPregnant) {
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
          detected_date: new Date().toISOString().split("T")[0],
          detection_source: "wq",
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      // Generate PEF task
      const tasks = onWqCompleted({
        event_id: randomUUID(),
        household_id: householdId,
        woman_id: womanId,
        wq_pregnant: true,
      });
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

    const deliveryDate = answers.pof_delivery_date || new Date().toISOString().split("T")[0];
    const livebirths =
      parseInt(answers.pof_number_live_born_infants_fill_one_birth_assessment) || 0;
    const stillbirths =
      parseInt(answers.pof_number_miscarriages_stillbirths_fill_one_birth_assessment_form) || 0;
    const eventId = randomUUID();
    const now = new Date();

    await getDb().insert(schema.domainEvents).values({
      event_id: eventId,
      event_type: "pregnancy_outcome_recorded",
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

    // Generate tasks for outcome
    const tasks = onPregnancyOutcomeRecorded({
      event_id: eventId,
      household_id: householdId,
      woman_id: pregnancy.woman_id,
      pregnancy_id: pregnancy.pregnancy_id,
      outcome_type: livebirths > 0 ? "live_birth" : "stillbirth",
      outcome_date: deliveryDate,
      live_birth_count: livebirths,
      stillbirth_count: stillbirths,
    });
    await writeTasksFromDescriptors(tasks);
  } catch (err) {
    console.error(`Error in promotePof for ${householdId}/${subjectId}:`, err);
    throw err;
  }
}

async function promoteBaf(childId: string, answers: FormAnswers): Promise<void> {
  try {
    const birthWeight = parseInt(answers.baf_weight_birth_grams);
    const vitalStatus = answers.baf_vital_status_infant_birth;

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

    await getDb()
      .update(schema.children)
      .set({
        birth_weight_grams: isNaN(birthWeight) ? null : birthWeight,
        current_vital_status: vitalStatus || "alive",
        updated_at: new Date(),
      })
      .where(eq(schema.children.child_id, childId));

    // Generate task completion event
    const tasks = onBirthAssessmentCompleted({
      event_id: randomUUID(),
      household_id: child.household_id,
      pregnancy_id: child.pregnancy_id,
      woman_id: child.woman_id,
      child_id: childId,
      birth_date: child.birth_date || new Date().toISOString().split("T")[0],
      birth_status:
        (child.birth_status as "live_birth" | "stillbirth" | "fetal_loss_20plus") || "live_birth",
      current_vital_status: (vitalStatus === "dead" ? "deceased" : "alive") as "alive" | "deceased",
    });
    await writeTasksFromDescriptors(tasks);
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
      const tasks = onChildDeath({
        event_id: randomUUID(),
        household_id: child.household_id,
        woman_id: child.woman_id,
        child_id: childId,
        death_date: new Date().toISOString().split("T")[0],
      });
      await writeTasksFromDescriptors(tasks);
    }
  } catch (err) {
    console.error(`Error in promoteNff for ${childId}:`, err);
    throw err;
  }
}

async function promoteCdf(childId: string, answers: FormAnswers): Promise<void> {
  try {
    const deathDate = answers.cdf_death_date || new Date().toISOString().split("T")[0];

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

    await getDb()
      .update(schema.children)
      .set({
        current_vital_status: "dead",
        death_date: deathDate,
        updated_at: new Date(),
      })
      .where(eq(schema.children.child_id, childId));

    // Generate VA task
    const tasks = onChildDeath({
      event_id: randomUUID(),
      household_id: child.household_id,
      woman_id: child.woman_id,
      child_id: childId,
      death_date: deathDate,
    });
    await writeTasksFromDescriptors(tasks);
  } catch (err) {
    console.error(`Error in promoteCdf for ${childId}:`, err);
    throw err;
  }
}
