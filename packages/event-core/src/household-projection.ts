import { compareEventOrder } from "./helpers";
import {
  DomainEventEnvelope,
  HouseholdBaselineConfirmedPayload,
  HouseholdProjection,
} from "./types";

function isApplied(event: DomainEventEnvelope): boolean {
  return event.apply_status === "applied";
}

function buildBaseProjection(
  event: DomainEventEnvelope,
): HouseholdProjection {
  const payload = event.payload as Partial<HouseholdBaselineConfirmedPayload>;
  const enrollmentStatus = payload.enrollment_status ?? "not_enrolled";
  return {
    household_id: payload.household_id ?? event.household_id,
    site_id: event.site_id,
    locality_code: event.locality_code,
    household_number: payload.household_number,
    structure_map_id: payload.structure_map_id,
    baseline_date: payload.baseline_date ?? event.event_date,
    occupancy_status: payload.occupancy_status,
    enrollment_status: enrollmentStatus,
    is_enrolled: enrollmentStatus === "enrolled",
    follow_up_enabled: enrollmentStatus === "enrolled",
    source_event_id: event.event_id,
    source_response_id: event.source_response_id ?? event.form_response_id ?? null,
    rules_version: event.rules_version,
    projection_version: 1,
  };
}

function mergeBaselineProjection(
  current: HouseholdProjection | null,
  event: DomainEventEnvelope,
): HouseholdProjection {
  const payload = event.payload as Partial<HouseholdBaselineConfirmedPayload>;
  const enrollmentStatus = payload.enrollment_status ?? current?.enrollment_status ?? "not_enrolled";
  const base = current
    ? {
        ...current,
        household_id: payload.household_id ?? current.household_id,
        site_id: event.site_id,
        locality_code: event.locality_code,
        household_number: payload.household_number ?? current.household_number,
        structure_map_id: payload.structure_map_id ?? current.structure_map_id,
        baseline_date: payload.baseline_date ?? event.event_date ?? current.baseline_date,
        occupancy_status: payload.occupancy_status ?? current.occupancy_status,
        enrollment_status: enrollmentStatus,
        is_enrolled: enrollmentStatus === "enrolled",
        follow_up_enabled: enrollmentStatus === "enrolled",
        rules_version: event.rules_version,
        source_event_id: event.event_id,
        source_response_id: event.source_response_id ?? event.form_response_id ?? current.source_response_id,
      }
    : buildBaseProjection(event);

  return base;
}

export function reduceHouseholdProjection(
  current: HouseholdProjection | null,
  event: DomainEventEnvelope,
): HouseholdProjection | null {
  if (!isApplied(event)) {
    return current;
  }

  switch (event.event_type) {
    case "household_baseline_confirmed":
      return mergeBaselineProjection(current, event);
    case "household_not_enrolled_at_baseline":
      return current
        ? {
            ...mergeBaselineProjection(
              current,
              event,
            ),
            enrollment_status: "not_enrolled",
            is_enrolled: false,
            follow_up_enabled: false,
          }
        : {
            household_id: event.household_id,
            site_id: event.site_id,
            locality_code: event.locality_code,
            household_number: undefined,
            structure_map_id: undefined,
            baseline_date: event.event_date,
            occupancy_status: undefined,
            enrollment_status: "not_enrolled",
            is_enrolled: false,
            follow_up_enabled: false,
            source_event_id: event.event_id,
            source_response_id: event.source_response_id ?? event.form_response_id ?? null,
            rules_version: event.rules_version,
            projection_version: 1,
          };
    default:
      return current;
  }
}

export function reduceHouseholdProjectionEvents(
  events: DomainEventEnvelope[],
  initial: HouseholdProjection | null = null,
): HouseholdProjection | null {
  return [...events]
    .sort(compareEventOrder)
    .reduce<HouseholdProjection | null>((current, event) => reduceHouseholdProjection(current, event), initial);
}

export { compareEventOrder };
