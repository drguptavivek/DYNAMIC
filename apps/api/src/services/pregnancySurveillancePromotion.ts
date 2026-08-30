import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import type { FormAnswers } from "./promotionEventBridge";

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
}
