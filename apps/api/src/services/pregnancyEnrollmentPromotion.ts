import { promoteFormSubmission, type PregnancyProjection } from "@dynamic/event-core";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { writeTasksFromDescriptors } from "./taskWriter";
import { FormAnswers } from "./promotionEventBridge";

type FormResponseRow = typeof schema.formResponses.$inferSelect;

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
    const pregnancies = await getDb()
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.household_member_id, subjectId));

    if (pregnancies.length === 0) {
      throw new Error(`No active pregnancy found for woman ${subjectId}`);
    }

    const activePregnancy =
      pregnancies.find((candidate) => candidate.pregnancy_status === "active") ?? null;
    const pregnancy = activePregnancy ?? pregnancies[0];

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
  } catch (err) {
    console.error(`Error in promotePef for ${householdId}/${subjectId}:`, err);
    throw err;
  }
}
