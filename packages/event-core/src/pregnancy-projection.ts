import { compareEventOrder } from "./helpers";
import type {
  DomainEventEnvelope,
  PregnancyEnrolledPayload,
  PregnancyProjection,
} from "./types";

function isApplied(event: DomainEventEnvelope): boolean {
  return event.apply_status === "applied";
}

function mergePregnancyEnrollmentProjection(
  current: PregnancyProjection | null,
  event: DomainEventEnvelope,
): PregnancyProjection {
  if (current?.source_event_id === event.event_id) {
    return current;
  }

  const payload = event.payload as Partial<PregnancyEnrolledPayload>;

  return {
    pregnancy_id: payload.pregnancy_id ?? current?.pregnancy_id ?? event.aggregate_id,
    woman_id: payload.woman_id ?? current?.woman_id ?? event.subject_id ?? "",
    household_member_id:
      payload.household_member_id ?? current?.household_member_id ?? event.subject_id ?? "",
    household_id: payload.household_id ?? current?.household_id ?? event.household_id,
    site_id: event.site_id,
    locality_code: event.locality_code,
    enrollment_date: payload.enrollment_date ?? event.event_date ?? current?.enrollment_date,
    pregnancy_status: payload.pregnancy_status ?? current?.pregnancy_status ?? "enrolled",
    usg_available: payload.usg_available ?? current?.usg_available ?? false,
    source_event_id: event.event_id,
    source_response_id:
      event.source_response_id ?? event.form_response_id ?? current?.source_response_id ?? null,
    source_task_id: event.source_task_id ?? event.task_id ?? current?.source_task_id ?? null,
    rules_version: event.rules_version,
    projection_version: current ? current.projection_version + 1 : 1,
  };
}

export function reducePregnancyProjection(
  current: PregnancyProjection | null,
  event: DomainEventEnvelope,
): PregnancyProjection | null {
  if (!isApplied(event)) {
    return current;
  }

  switch (event.event_type) {
    case "pregnancy_enrolled":
      return mergePregnancyEnrollmentProjection(current, event);
    default:
      return current;
  }
}

export function reducePregnancyProjectionEvents(
  events: DomainEventEnvelope[],
  initial: PregnancyProjection | null = null,
): PregnancyProjection | null {
  return [...events]
    .sort(compareEventOrder)
    .reduce<PregnancyProjection | null>(
      (current, event) => reducePregnancyProjection(current, event),
      initial,
    );
}
