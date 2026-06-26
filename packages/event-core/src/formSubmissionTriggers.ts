import {
  birthAssessmentCompleted,
  childDeathRecorded,
  fieldEventRegistry,
  verbalAutopsyCompleted,
} from "./events";
import type { EventPromotionResult } from "./events/types";
import type { DomainEventEnvelope } from "./types";
import type { ProtocolConfig } from "@dynamic/shared-workflow";

export type FormAnswers = Record<string, unknown>;

export interface FormSubmissionTriggerInput {
  form_code: string;
  event_id: string;
  site_id: number;
  locality_code: string;
  household_id: string;
  subject_id?: string | null;
  task_id?: string | null;
  task_key?: string | null;
  form_response_id?: string | null;
  answers_json?: FormAnswers | null;
  recorded_at: string;
  device_id?: string | null;
  user_id?: string | null;
  apply_status?: DomainEventEnvelope["apply_status"];
  rules_version?: string;
  config?: ProtocolConfig;
  context?: {
    household_number?: string | null;
    structure_map_id?: string | null;
    pregnancy_id?: string | null;
    woman_id?: string | null;
    household_member_id?: string | null;
    child_id?: string | null;
    birth_date?: string | null;
    birth_status?: "live_birth" | "stillbirth" | "fetal_loss_20plus" | null;
    current_vital_status?: "alive" | "deceased" | null;
    death_date?: string | null;
    deceased_id?: string | null;
  };
}

export type FormSubmissionTrigger = (
  input: FormSubmissionTriggerInput,
) => EventPromotionResult<unknown> | null;

function answerString(answers: FormAnswers, keys: string[]): string | null {
  for (const key of keys) {
    const value = answers[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }
  return null;
}

function answerNumber(answers: FormAnswers, keys: string[]): number {
  const value = answerString(answers, keys);
  if (value === null) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function answerTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function dateFrom(input: FormSubmissionTriggerInput, keys: string[]): string {
  return (
    answerString(input.answers_json ?? {}, keys) ??
    input.recorded_at.split("T")[0]
  );
}

function requireValue(value: string | null | undefined, label: string): string {
  if (!value) {
    throw new Error(`Cannot trigger form event without ${label}`);
  }
  return value;
}

function triggerHhq(input: FormSubmissionTriggerInput): EventPromotionResult<unknown> {
  const answers = input.answers_json ?? {};
  return fieldEventRegistry.HHQ.promoteEvidence({
    ...input,
    household_number: requireValue(
      input.context?.household_number ??
        answerString(answers, ["hhq_household_number", "household_number"]),
      "household_number",
    ),
    structure_map_id: requireValue(
      input.context?.structure_map_id ??
        answerString(answers, ["hhq_structure_map_id", "structure_map_id"]),
      "structure_map_id",
    ),
    baseline_date: dateFrom(input, ["hhq_interview_date", "baseline_date"]),
  });
}

function triggerWq(input: FormSubmissionTriggerInput): EventPromotionResult<unknown> {
  const answers = input.answers_json ?? {};
  return fieldEventRegistry.WQ.promoteEvidence({
    ...input,
    woman_id: requireValue(input.context?.woman_id ?? input.subject_id, "woman_id"),
    wq_pregnant: answerTruthy(answers.wq_pregnant),
    completed_date: dateFrom(input, ["wq_interview_date", "wq_completed_date"]),
  });
}

function triggerPef(input: FormSubmissionTriggerInput): EventPromotionResult<unknown> {
  const answers = input.answers_json ?? {};
  const womanId = requireValue(input.context?.woman_id ?? input.subject_id, "woman_id");
  return fieldEventRegistry.PEF.promoteEvidence({
    ...input,
    pregnancy_id: requireValue(input.context?.pregnancy_id, "pregnancy_id"),
    woman_id: womanId,
    household_member_id: requireValue(input.context?.household_member_id ?? womanId, "household_member_id"),
    enrollment_date: dateFrom(input, ["pef_enrollment_date"]),
    usg_available: answerTruthy(answers.pef_any_time_during_pregnancy_ultrasound),
  });
}

function triggerPff(input: FormSubmissionTriggerInput): EventPromotionResult<unknown> {
  return fieldEventRegistry.PFF.promoteEvidence({
    ...input,
    pregnancy_id: requireValue(input.context?.pregnancy_id ?? input.subject_id, "pregnancy_id"),
    woman_id: requireValue(input.context?.woman_id, "woman_id"),
    visit_date: dateFrom(input, ["pff_visit_date"]),
    pregnancy_status: answerString(input.answers_json ?? {}, ["pff_pregnancy_status"]),
  });
}

function triggerPof(input: FormSubmissionTriggerInput): EventPromotionResult<unknown> {
  const answers = input.answers_json ?? {};
  const liveBirthCount = answerNumber(answers, [
    "pof_number_live_born_infants_fill_one_birth_assessment",
    "live_birth_count",
  ]);
  const stillbirthCount = answerNumber(answers, [
    "pof_number_miscarriages_stillbirths_fill_one_birth_assessment_form",
    "stillbirth_count",
  ]);
  return fieldEventRegistry.POF.promoteEvidence({
    ...input,
    pregnancy_id: requireValue(input.context?.pregnancy_id ?? input.subject_id, "pregnancy_id"),
    woman_id: requireValue(input.context?.woman_id, "woman_id"),
    outcome_date: dateFrom(input, ["pof_delivery_date", "outcome_date"]),
    outcome_type: liveBirthCount > 0 ? "live_birth" : "stillbirth",
    live_birth_count: liveBirthCount,
    stillbirth_count: stillbirthCount,
  });
}

function triggerBaf(input: FormSubmissionTriggerInput): EventPromotionResult<unknown> {
  const answers = input.answers_json ?? {};
  const currentVitalStatus =
    input.context?.current_vital_status ??
    (answerString(answers, ["baf_vital_status_infant_birth"]) === "dead" ? "deceased" : "alive");
  return fieldEventRegistry.BAF.promoteEvidence({
    ...input,
    pregnancy_id: requireValue(input.context?.pregnancy_id, "pregnancy_id"),
    woman_id: requireValue(input.context?.woman_id, "woman_id"),
    child_id: requireValue(input.context?.child_id ?? input.subject_id, "child_id"),
    birth_date: requireValue(
      input.context?.birth_date ?? answerString(answers, ["baf_birth_date"]),
      "birth_date",
    ),
    birth_status: input.context?.birth_status ?? "live_birth",
    current_vital_status: currentVitalStatus,
    death_date: input.context?.death_date ?? answerString(answers, ["baf_death_date"]),
  });
}

function triggerCdf(input: FormSubmissionTriggerInput): EventPromotionResult<unknown> {
  return childDeathRecorded.promoteEvidence({
    ...input,
    pregnancy_id: requireValue(input.context?.pregnancy_id, "pregnancy_id"),
    woman_id: requireValue(input.context?.woman_id, "woman_id"),
    child_id: requireValue(input.context?.child_id ?? input.subject_id, "child_id"),
    death_date: dateFrom(input, ["cdf_death_date", "death_date"]),
  });
}

function triggerVa(input: FormSubmissionTriggerInput): EventPromotionResult<unknown> {
  return verbalAutopsyCompleted.promoteEvidence({
    ...input,
    deceased_id: requireValue(input.context?.deceased_id ?? input.subject_id, "deceased_id"),
    completed_date: dateFrom(input, ["va_completed_date", "va_interview_date"]),
  });
}

export const formSubmissionTriggerRegistry: Record<string, FormSubmissionTrigger> = {
  HHQ: triggerHhq,
  WQ: triggerWq,
  PEF: triggerPef,
  PFF: triggerPff,
  POF: triggerPof,
  BAF: triggerBaf,
  CDF: triggerCdf,
  VA: triggerVa,
};

export function promoteFormSubmission(
  input: FormSubmissionTriggerInput,
): EventPromotionResult<unknown> | null {
  const trigger = formSubmissionTriggerRegistry[input.form_code.toUpperCase()];
  return trigger ? trigger(input) : null;
}
