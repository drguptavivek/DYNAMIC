import {
  generatePregnancySurveillanceTaskDescriptors,
  promoteFormSubmission,
  type PregnancyProjection,
} from "@dynamic/event-core";
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { buildDetectedPregnancyId, nextPregnancySequence } from "@dynamic/shared-domain";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { writeTasksFromDescriptors } from "./taskWriter";
import { FormAnswers } from "./promotionEventBridge";

type FormResponseRow = typeof schema.formResponses.$inferSelect;
const PEF_NEGATIVE_UPT_VALUE = 2;

function isNegativeUpt(answers: FormAnswers): boolean {
  return Number(answers.pef_on_spot_upt_result) === PEF_NEGATIVE_UPT_VALUE;
}

export async function restorePregnancySurveillanceAfterNeverPregnantPff(input: {
  womanId: string;
  householdId: string;
  detectedDate: string | null;
  visitDate: string;
  responseId: string;
}): Promise<void> {
  const now = new Date();
  await getDb()
    .update(schema.followUpTasks)
    .set({ status: "planned", closed_at: null, closed_reason: null, updated_at: now })
    .where(and(
      eq(schema.followUpTasks.woman_id, input.womanId),
      eq(schema.followUpTasks.task_type, "PSF"),
      inArray(schema.followUpTasks.status, ["cancelled", "superseded"]),
      inArray(schema.followUpTasks.closed_reason, ["pregnancy_detected", "pregnancy_enrolled"]),
      or(isNull(schema.followUpTasks.deadline_date), gte(schema.followUpTasks.deadline_date, input.visitDate)),
    ));

  const psfTasks = await getDb()
    .select({ status: schema.followUpTasks.status })
    .from(schema.followUpTasks)
    .where(and(
      eq(schema.followUpTasks.woman_id, input.womanId),
      eq(schema.followUpTasks.task_type, "PSF"),
    ));
  const hasActionablePsf = psfTasks.some((task) =>
    ["open", "planned", "pending", "due", "overdue", "in_progress"].includes(task.status || ""),
  );
  if (!hasActionablePsf) {
    const anchorDate = psfTasks.length > 0 ? input.visitDate : input.detectedDate || input.visitDate;
    await writeTasksFromDescriptors(generatePregnancySurveillanceTaskDescriptors({
      household_id: input.householdId,
      woman_id: input.womanId,
      eligibility_date: anchorDate,
      source_event_id: input.responseId,
    }));
  }
  await getDb()
    .update(schema.eligibleWomen)
    .set({ tracking_status: "not_pregnant", updated_at: now })
    .where(eq(schema.eligibleWomen.woman_id, input.womanId));
}

async function restorePregnancySurveillanceAfterNegativeUpt(
  response: FormResponseRow,
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  const now = new Date();
  const [activePregnancy] = await getDb()
    .select()
    .from(schema.pregnancies)
    .where(
      and(
        eq(schema.pregnancies.woman_id, subjectId),
        eq(schema.pregnancies.pregnancy_status, "active"),
      ),
    )
    .limit(1);
  const anchorDate =
    activePregnancy?.detected_date ||
    (typeof answers.pef_enrollment_date === "string" && answers.pef_enrollment_date
      ? answers.pef_enrollment_date
      : (response.created_offline_at ?? now).toISOString().slice(0, 10));

  // A positive PSF report closes its remaining PSF series while PEF is
  // pending. A negative confirmatory UPT must reopen only those provisional
  // closures; completed or independently closed PSF history stays untouched.
  const restoredPsfTasks = await getDb()
    .update(schema.followUpTasks)
    .set({ status: "planned", closed_at: null, closed_reason: null, updated_at: now })
    .where(
      and(
        eq(schema.followUpTasks.woman_id, subjectId),
        eq(schema.followUpTasks.task_type, "PSF"),
        eq(schema.followUpTasks.status, "cancelled"),
        eq(schema.followUpTasks.closed_reason, "pregnancy_detected"),
      ),
    )
    .returning({ task_id: schema.followUpTasks.task_id });

  if (restoredPsfTasks.length === 0) {
    const existingPsfTasks = await getDb()
      .select({ task_id: schema.followUpTasks.task_id })
      .from(schema.followUpTasks)
      .where(
        and(
          eq(schema.followUpTasks.woman_id, subjectId),
          eq(schema.followUpTasks.task_type, "PSF"),
        ),
      )
      .limit(1);
    if (existingPsfTasks.length === 0) {
      await writeTasksFromDescriptors(
        generatePregnancySurveillanceTaskDescriptors({
          household_id: householdId,
          woman_id: subjectId,
          eligibility_date: anchorDate,
          source_event_id: response.form_response_id,
        }),
      );
    }
  }

  await getDb()
    .update(schema.pregnancies)
    .set({ pregnancy_status: "closed", updated_at: now })
    .where(
      and(
        eq(schema.pregnancies.woman_id, subjectId),
        eq(schema.pregnancies.pregnancy_status, "active"),
      ),
    );

  await getDb()
    .update(schema.eligibleWomen)
    .set({ tracking_status: "not_pregnant", updated_at: now })
    .where(eq(schema.eligibleWomen.woman_id, subjectId));
}

function buildPefPromotion(params: {
  event_id: string;
  response: FormResponseRow;
  pregnancy: typeof schema.pregnancies.$inferSelect;
  answers: FormAnswers;
  now: Date;
  apply_status?: "applied" | "held_duplicate";
}) {
  const promotion = promoteFormSubmission({
    form_code: params.response.form_code,
    event_id: params.event_id,
    site_id: params.pregnancy.site_id,
    locality_code: params.pregnancy.locality_code,
    household_id: params.pregnancy.household_id,
    subject_id: params.response.subject_id,
    answers_json: params.answers,
    recorded_at: (params.response.created_offline_at ?? params.now).toISOString(),
    task_id: params.response.task_id,
    form_response_id: params.response.form_response_id,
    device_id: params.response.device_id,
    apply_status: params.apply_status,
    context: {
      pregnancy_id: params.pregnancy.pregnancy_id,
      woman_id: params.pregnancy.woman_id,
      household_member_id: params.pregnancy.household_member_id,
    },
  });
  if (!promotion) {
    throw new Error(`No form submission trigger registered for ${params.response.form_code}`);
  }
  return promotion;
}

export async function promotePef(
  response: FormResponseRow,
  householdId: string,
  subjectId: string,
  answers: FormAnswers,
): Promise<void> {
  try {
    if (isNegativeUpt(answers)) {
      await restorePregnancySurveillanceAfterNegativeUpt(
        response,
        householdId,
        subjectId,
        answers,
      );
      return;
    }

    const pregnancies = await getDb()
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.household_member_id, subjectId));

    let activePregnancy =
      pregnancies.find((candidate) => candidate.pregnancy_status === "active") ?? null;
    let pregnancy = activePregnancy;
    if (!pregnancy) {
      const now = new Date();
      const enrollmentDate =
        typeof answers.pef_enrollment_date === "string" && answers.pef_enrollment_date
          ? answers.pef_enrollment_date
          : (response.created_offline_at ?? now).toISOString().slice(0, 10);
      const submittedPregnancyId = String(answers.pef_pregnancy_id || "");
      const pregnancyId = submittedPregnancyId.startsWith(`${subjectId}-`) &&
        /^[1-9]$/.test(submittedPregnancyId.slice(subjectId.length + 1))
        ? submittedPregnancyId
        : buildDetectedPregnancyId(subjectId, response.form_response_id);
      const [createdPregnancy] = await getDb()
        .insert(schema.pregnancies)
        .values({
          pregnancy_id: pregnancyId,
          woman_id: subjectId,
          household_member_id: subjectId,
          household_id: householdId,
          site_id: response.site_id,
          locality_code: response.locality_code,
          pregnancy_sequence: nextPregnancySequence(pregnancies.map((prior) => prior.pregnancy_sequence)),
          pregnancy_status: "active",
          detected_date: enrollmentDate,
          detection_source: "pef_direct_contextual_action",
          created_at: now,
          updated_at: now,
        })
        .returning();
      pregnancy = createdPregnancy;
      activePregnancy = createdPregnancy;
    }

    const now = new Date();
    const priorResponses = await getDb()
      .select()
      .from(schema.formResponses)
      .where(
        and(
          eq(schema.formResponses.form_code, "PEF"),
          eq(schema.formResponses.household_id, pregnancy.household_id),
          eq(schema.formResponses.subject_id, subjectId),
        ),
      );
    const primaryResponse = priorResponses.find(
      (candidate) =>
        candidate.form_response_id !== response.form_response_id &&
        candidate.response_status !== "duplicate",
    );

    if (primaryResponse) {
      const duplicateEventId = randomUUID();
      const duplicatePromotion = buildPefPromotion({
        event_id: duplicateEventId,
        response,
        pregnancy,
        now,
        answers,
        apply_status: "held_duplicate",
      });

      await getDb()
        .update(schema.formResponses)
        .set({ response_status: "duplicate" })
        .where(eq(schema.formResponses.form_response_id, response.form_response_id));

      await getDb().insert(schema.domainEvents).values({
        event_id: duplicatePromotion.event.event_id,
        event_type: duplicatePromotion.event.event_type,
        site_id: pregnancy.site_id,
        locality_code: pregnancy.locality_code,
        household_id: pregnancy.household_id,
        subject_type: "pregnancy",
        subject_id: pregnancy.pregnancy_id,
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

    if (!activePregnancy) {
      throw new Error(`No active pregnancy found for woman ${subjectId}`);
    }

    const eventId = randomUUID();
    const promotion = buildPefPromotion({
      event_id: eventId,
      response,
      pregnancy,
      now,
      answers,
    });
    const projection = promotion.projection as PregnancyProjection | null;

    if (!projection) {
      throw new Error(`Pregnancy projection not generated for ${pregnancy.pregnancy_id}`);
    }

    await getDb().insert(schema.domainEvents).values({
      event_id: eventId,
      event_type: promotion.event.event_type,
      site_id: pregnancy.site_id,
      locality_code: pregnancy.locality_code,
      household_id: pregnancy.household_id,
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

    await getDb()
      .update(schema.pregnancies)
      .set({
        enrollment_date: projection.enrollment_date,
        pregnancy_status: projection.pregnancy_status,
        source_event_id: projection.source_event_id,
        updated_at: now,
      })
      .where(eq(schema.pregnancies.pregnancy_id, projection.pregnancy_id));

    await writeTasksFromDescriptors(promotion.task_descriptors);

    // PEF enrollment moves the woman into the active pregnancy pathway; retain
    // completed PSF evidence but cancel every pending/future PSF task.
    await getDb()
      .update(schema.followUpTasks)
      .set({ status: "cancelled", closed_at: now, closed_reason: "pregnancy_enrolled", updated_at: now })
      .where(
        and(
          eq(schema.followUpTasks.woman_id, pregnancy.woman_id),
          eq(schema.followUpTasks.task_type, "PSF"),
          inArray(schema.followUpTasks.status, ["planned", "pending", "due", "overdue"]),
        ),
      );
  } catch (err) {
    console.error(`Error in promotePef for ${householdId}/${subjectId}:`, err);
    throw err;
  }
}
