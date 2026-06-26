import {
  orchestrateWorkflowForEvent,
  reducePregnancyProjectionEvents,
  type PregnancyProjection,
} from "@dynamic/event-core";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { writeTasksFromDescriptors } from "./taskWriter";
import {
  buildPregnancyEnrolledPayload,
  FormAnswers,
  getPefEnrollmentDate,
  toIsoDate,
  toPregnancyProjectionEvent,
} from "./promotionEventBridge";

type FormResponseRow = typeof schema.formResponses.$inferSelect;

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
    const enrollmentDate = getPefEnrollmentDate(
      answers,
      toIsoDate(response.created_offline_at ?? response.created_at ?? now),
    );
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
      const duplicatePayload = buildPregnancyEnrolledPayload(
        pregnancy,
        pregnancy.enrollment_date ?? enrollmentDate,
        answers,
      );
      const duplicateEnvelope = toPregnancyProjectionEvent({
        event_id: duplicateEventId,
        response,
        pregnancy,
        enrollment_date: pregnancy.enrollment_date ?? enrollmentDate,
        payload: duplicatePayload,
        now,
        apply_status: "held_duplicate",
      });

      await getDb()
        .update(schema.formResponses)
        .set({ response_status: "duplicate" })
        .where(eq(schema.formResponses.form_response_id, response.form_response_id));

      await getDb().insert(schema.domainEvents).values({
        event_id: duplicateEnvelope.event_id,
        event_type: duplicateEnvelope.event_type,
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
    const payload = buildPregnancyEnrolledPayload(pregnancy, enrollmentDate, answers);
    const envelope = toPregnancyProjectionEvent({
      event_id: eventId,
      response,
      pregnancy,
      enrollment_date: enrollmentDate,
      payload,
      now,
    });
    const projection = reducePregnancyProjectionEvents([envelope]);

    if (!projection) {
      throw new Error(`Pregnancy projection not generated for ${pregnancy.pregnancy_id}`);
    }

    await getDb().insert(schema.domainEvents).values({
      event_id: eventId,
      event_type: "pregnancy_enrolled",
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

    const orchestration = orchestrateWorkflowForEvent({
      event: envelope,
      pregnancy_projection: projection as PregnancyProjection,
      rules_version: "v1",
    });
    await writeTasksFromDescriptors(
      orchestration.decisions.flatMap((decision) => decision.task_descriptors),
    );
  } catch (err) {
    console.error(`Error in promotePef for ${householdId}/${subjectId}:`, err);
    throw err;
  }
}
