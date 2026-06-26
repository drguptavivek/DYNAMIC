import type {
  DomainEventEnvelope,
  HouseholdBaselineConfirmedPayload,
  PregnancyEnrolledPayload,
} from "@dynamic/event-core";
import { schema } from "../db";
import { buildHhqHouseholdPromotionValues } from "./hhqPromotion";

export interface FormAnswers {
  [key: string]: any;
}

type FormResponseRow = typeof schema.formResponses.$inferSelect;
type DomainEventRow = typeof schema.domainEvents.$inferSelect;

export const HHQ_RULES_VERSION = "hhq-backend-1";
export const PREGNANCY_RULES_VERSION = "pregnancy-backend-1";

export function buildHhqBaselinePayload(
  household: ReturnType<typeof buildHhqHouseholdPromotionValues>,
): HouseholdBaselineConfirmedPayload {
  return {
    household_id: household.household_id,
    household_number: household.household_number,
    structure_map_id: household.structure_map_id,
    baseline_date: household.baseline_completed_date,
    occupancy_status: "occupied",
    enrollment_status: "enrolled",
  };
}

export function toHhqProjectionEvent(
  event: DomainEventRow,
  response: FormResponseRow,
): DomainEventEnvelope {
  const household = buildHhqHouseholdPromotionValues(
    response.household_id || event.household_id || "",
    (response.answers_json || {}) as FormAnswers,
    response.created_at ?? new Date(),
  );
  const eventDate = household.baseline_completed_date;
  const eventDateTime = event.event_datetime ?? response.created_offline_at ?? response.created_at ?? new Date();
  const recordedAt = event.created_at ?? response.synced_at ?? response.created_at ?? eventDateTime;

  return {
    event_id: event.event_id,
    event_type: event.event_type,
    event_version: 1,
    aggregate_type: "household",
    aggregate_id: household.household_id,
    site_id: event.site_id,
    locality_code: event.locality_code,
    household_id: household.household_id,
    subject_type: event.subject_type,
    subject_id: event.subject_id,
    task_id: event.task_id,
    form_response_id: event.form_response_id,
    source_response_id: event.form_response_id,
    source_task_id: event.task_id,
    event_date: eventDate,
    recorded_at: recordedAt.toISOString(),
    created_offline_at: event.created_offline_at?.toISOString() ?? undefined,
    device_id: event.device_id,
    rules_version: HHQ_RULES_VERSION,
    payload: buildHhqBaselinePayload(household) as unknown as Record<string, unknown>,
    apply_status: (event.apply_status || "applied") as DomainEventEnvelope["apply_status"],
  };
}

export function toIsoDate(value: Date): string {
  return value.toISOString().split("T")[0];
}

export function isTruthyAnswer(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

export function getPefEnrollmentDate(answers: FormAnswers, fallbackDate: string): string {
  return typeof answers.pef_enrollment_date === "string" && answers.pef_enrollment_date
    ? answers.pef_enrollment_date
    : fallbackDate;
}

export function buildPregnancyEnrolledPayload(
  pregnancy: typeof schema.pregnancies.$inferSelect,
  enrollmentDate: string,
  answers: FormAnswers,
): PregnancyEnrolledPayload {
  return {
    pregnancy_id: pregnancy.pregnancy_id,
    woman_id: pregnancy.woman_id,
    household_member_id: pregnancy.household_member_id,
    household_id: pregnancy.household_id,
    enrollment_date: enrollmentDate,
    pregnancy_status: "enrolled",
    usg_available: isTruthyAnswer(answers.pef_any_time_during_pregnancy_ultrasound),
  };
}

export function toPregnancyProjectionEvent(params: {
  event_id: string;
  response: FormResponseRow;
  pregnancy: typeof schema.pregnancies.$inferSelect;
  enrollment_date: string;
  payload: PregnancyEnrolledPayload;
  now: Date;
  apply_status?: DomainEventEnvelope["apply_status"];
}): DomainEventEnvelope {
  const eventDateTime =
    params.response.created_offline_at ?? params.response.created_at ?? params.now;

  return {
    event_id: params.event_id,
    event_type: "pregnancy_enrolled",
    event_version: 1,
    aggregate_type: "pregnancy",
    aggregate_id: params.pregnancy.pregnancy_id,
    site_id: params.pregnancy.site_id,
    locality_code: params.pregnancy.locality_code,
    household_id: params.pregnancy.household_id,
    subject_type: "pregnancy",
    subject_id: params.pregnancy.pregnancy_id,
    task_id: params.response.task_id,
    form_response_id: params.response.form_response_id,
    source_response_id: params.response.form_response_id,
    source_task_id: params.response.task_id,
    event_date: params.enrollment_date,
    recorded_at: eventDateTime.toISOString(),
    created_offline_at: params.response.created_offline_at?.toISOString() ?? undefined,
    device_id: params.response.device_id,
    rules_version: PREGNANCY_RULES_VERSION,
    payload: params.payload as unknown as Record<string, unknown>,
    apply_status: params.apply_status ?? "applied",
  };
}
