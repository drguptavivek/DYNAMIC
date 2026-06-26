import { reduceHouseholdProjectionEvents } from "../household-projection";
import type {
  DomainEventEnvelope,
  HouseholdBaselineConfirmedPayload,
  HouseholdProjection,
} from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import {
  buildTaskKey,
  generateHrfSchedule,
  getAttemptDisposition,
  getConfig,
  getFormAvailability,
  getModeRule,
  noWorkflowForHeldEvent,
  type ProtocolConfig,
  type TaskDescriptor,
} from "./workflowHelpers";

export const EVENT_TYPE = "household_baseline_confirmed";

export interface HouseholdBaselineConfirmedEventInput extends BaseEventInput {
  household_number: string;
  structure_map_id: string;
  baseline_date: string;
  occupancy_status?: HouseholdBaselineConfirmedPayload["occupancy_status"];
  enrollment_status?: HouseholdBaselineConfirmedPayload["enrollment_status"];
}

export function buildEvent(
  input: HouseholdBaselineConfirmedEventInput,
): DomainEventEnvelope<HouseholdBaselineConfirmedPayload> {
  return {
    event_id: input.event_id,
    event_type: EVENT_TYPE,
    event_version: 1,
    aggregate_type: "household",
    aggregate_id: input.household_id,
    site_id: input.site_id,
    locality_code: input.locality_code,
    household_id: input.household_id,
    subject_type: "household",
    subject_id: input.household_id,
    task_id: input.task_id,
    task_key: input.task_key,
    form_response_id: input.form_response_id,
    source_response_id: input.form_response_id,
    source_task_id: input.task_id,
    event_date: input.event_date ?? input.baseline_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      household_id: input.household_id,
      household_number: input.household_number,
      structure_map_id: input.structure_map_id,
      baseline_date: input.baseline_date,
      occupancy_status: input.occupancy_status ?? "occupied",
      enrollment_status: input.enrollment_status ?? "enrolled",
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(input: {
  event: DomainEventEnvelope<HouseholdBaselineConfirmedPayload>;
  current?: HouseholdProjection | null;
}): HouseholdProjection | null {
  return reduceHouseholdProjectionEvents(
    [input.event as unknown as DomainEventEnvelope],
    input.current ?? null,
  );
}

export function planWorkflow(input: {
  event: DomainEventEnvelope<HouseholdBaselineConfirmedPayload>;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  if (noWorkflowForHeldEvent(input.event)) return [];
  const config = getConfig(input.config);
  const payload = input.event.payload;
  const modeRule = getModeRule(config, "HRF");
  const disposition = getAttemptDisposition(config, "HRF");
  const availability = getFormAvailability(config, "HRF");

  return generateHrfSchedule({
    baseline_completed_date: payload.baseline_date,
    study_end_date: config.study_end_date,
    rules_version: config.rules_version,
  }).map((schedule) => ({
    task_key: buildTaskKey(
      payload.household_id,
      "household",
      payload.household_id,
      "HRF",
      schedule.label,
      schedule.target_date,
      config.rules_version,
    ),
    household_id: payload.household_id,
    subject_type: "household",
    subject_id: payload.household_id,
    task_type: "HRF",
    form_code: "HRF",
    protocol_visit_label: schedule.label,
    generation_source: "scheduled",
    source_event_id: input.event.event_id,
    anchor_date: payload.baseline_date,
    window_start: schedule.window_start,
    target_date: schedule.target_date,
    deadline_date: schedule.deadline,
    default_expected_mode: modeRule.default_mode,
    allowed_modes: modeRule.allowed_modes,
    mode_rule_strength: modeRule.strength,
    max_failed_attempts: disposition.max_failed_attempts,
    requires_final_close_reason: disposition.requires_final_close_reason,
    rules_version: config.rules_version,
    form_availability: availability.availability,
    action_state: "pending",
    disabled_reason: availability.disabled_reason,
  }));
}

export function promoteEvidence(
  input: HouseholdBaselineConfirmedEventInput & { config?: ProtocolConfig },
): EventPromotionResult<HouseholdBaselineConfirmedPayload> {
  const event = buildEvent(input);
  return {
    event,
    projection: reduceEvent({ event }),
    task_descriptors: planWorkflow({ event, config: input.config }),
    data_quality_flags: [],
  };
}
