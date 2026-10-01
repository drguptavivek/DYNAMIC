import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import type { FormAnswers } from "./promotionEventBridge";
import { and, eq, inArray, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { pregnancyDetected } from "@dynamic/event-core";
import { writeTasksFromDescriptors } from "./taskWriter";
import { buildDetectedPregnancyId, nextPregnancySequence } from "@dynamic/shared-domain";

type FormResponseRow = typeof schema.formResponses.$inferSelect;

function integerOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function textOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

export async function promotePregnancySurveillance(
  response: FormResponseRow,
  answers: FormAnswers,
): Promise<void> {
  const now = new Date();
  const values = {
    form_response_id: response.form_response_id,
    woman_id: textOrNull(response.subject_id ?? answers.psf_woman_id),
    household_id: textOrNull(response.household_id ?? answers.psf_household_id),
    site_id: response.site_id,
    locality_code: response.locality_code,
    interview_date: textOrNull(answers.psf_interview_date),
    woman_line_number: textOrNull(answers.psf_woman_line_number),
    woman_name: textOrNull(answers.psf_woman_name),
    husband_name: textOrNull(answers.psf_husband_name),
    displayed_address: textOrNull(answers.psf_current_address),
    address_status: integerOrNull(answers.psf_same_address_status),
    reported_new_address: textOrNull(answers.psf_new_address),
    marital_status: integerOrNull(answers.psf_current_marital_status),
    sterilization_status: integerOrNull(answers.psf_sterilization_status),
    hysterectomy_status: integerOrNull(answers.psf_hysterectomy_status),
    pregnancy_status: integerOrNull(answers.psf_pregnant_now),
    lmp_response_json: answers.psf_last_menstrual_period ?? null,
    tracking_disposition: textOrNull(answers.psf_tracking_disposition),
    stop_reason: textOrNull(answers.psf_stop_reason),
    pregnancy_detected: integerOrNull(answers.psf_pregnancy_detected),
    created_at: response.created_at ?? now,
    updated_at: now,
  };
  const {
    form_response_id: _formResponseId,
    created_at: _createdAt,
    ...updateValues
  } = values;

  await getDb()
    .insert(schema.pregnancySurveillanceRecords)
    .values(values)
    .onConflictDoUpdate({
      target: schema.pregnancySurveillanceRecords.form_response_id,
      set: updateValues,
    });

  const womanId = values.woman_id;
  const householdId = values.household_id;
  const pregnantNow = values.pregnancy_status === 1;

  // A positive PSF pregnancy report starts the separate PEF pathway and ends
  // only the outstanding PSF series. Completed PSF responses remain history.
  if (pregnantNow && womanId && householdId) {
    const [woman] = await getDb()
      .select()
      .from(schema.eligibleWomen)
      .where(eq(schema.eligibleWomen.woman_id, womanId))
      .limit(1);
    const priorPregnancies = await getDb()
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.woman_id, womanId));
    const existingPregnancy = priorPregnancies.find((pregnancy) => pregnancy.pregnancy_status === "active");
    const detectedDate = values.interview_date || (response.created_offline_at ?? now).toISOString().slice(0, 10);
    let pregnancyId = existingPregnancy?.pregnancy_id;
    if (!pregnancyId) {
      pregnancyId = buildDetectedPregnancyId(womanId, response.form_response_id);
      await getDb().insert(schema.pregnancies).values({
        pregnancy_id: pregnancyId,
        woman_id: womanId,
        household_member_id: woman?.household_member_id || womanId,
        household_id: householdId,
        site_id: response.site_id,
        locality_code: response.locality_code,
        pregnancy_sequence: nextPregnancySequence(priorPregnancies.map((pregnancy) => pregnancy.pregnancy_sequence)),
        pregnancy_status: "active",
        detected_date: detectedDate,
        detection_source: "psf",
        source_event_id: response.form_response_id,
        created_at: now,
        updated_at: now,
      });
    }
    const detectedEvent = pregnancyDetected.buildEvent({
      event_id: randomUUID(),
      site_id: response.site_id,
      locality_code: response.locality_code,
      household_id: householdId,
      woman_id: womanId,
      detected_date: detectedDate,
      recorded_at: (response.created_offline_at ?? now).toISOString(),
      task_id: response.task_id,
      form_response_id: response.form_response_id,
      device_id: response.device_id || undefined,
    });
    await getDb().insert(schema.domainEvents).values({
      event_id: detectedEvent.event_id,
      event_type: detectedEvent.event_type,
      site_id: response.site_id,
      locality_code: response.locality_code,
      household_id: householdId,
      subject_type: "woman",
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
    await writeTasksFromDescriptors(pregnancyDetected.planWorkflow({ event: detectedEvent }).map((task) =>
      task.task_type === "PEF" ? { ...task, pregnancy_id: pregnancyId } : task,
    ));
    await getDb()
      .update(schema.followUpTasks)
      .set({ status: "cancelled", closed_at: now, closed_reason: "pregnancy_detected", updated_at: now })
      .where(
        and(
          eq(schema.followUpTasks.woman_id, womanId),
          eq(schema.followUpTasks.task_type, "PSF"),
          inArray(schema.followUpTasks.status, ["planned", "pending", "due", "overdue"]),
        ),
      );
  } else if (womanId && values.tracking_disposition === "stopped") {
    // A permanent stop condition removes the woman from the pregnancy
    // surveillance pathway. Keep the WQ/HRF history intact, but close every
    // outstanding pregnancy-related task (including a future PEF) and mark
    // the eligibility projection as no longer eligible for tracking.
    await getDb()
      .update(schema.eligibleWomen)
      .set({
        tracking_status: "not_tracked",
        current_eligibility_status: "not_eligible",
        updated_at: now,
      })
      .where(eq(schema.eligibleWomen.woman_id, womanId));

    await getDb()
      .update(schema.followUpTasks)
      .set({ status: "cancelled", closed_at: now, closed_reason: values.stop_reason || "psf_ineligible", updated_at: now })
      .where(
        and(
          or(eq(schema.followUpTasks.woman_id, womanId), eq(schema.followUpTasks.subject_id, womanId)),
          inArray(schema.followUpTasks.task_type, ["PSF", "PEF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF"]),
          inArray(schema.followUpTasks.status, ["planned", "pending", "due", "overdue"]),
        ),
      );
  }
}
