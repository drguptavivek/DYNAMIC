import { reduceHouseholdProjectionEvents } from "../household-projection";
import type {
  DomainEventEnvelope,
  HouseholdBaselineConfirmedPayload,
  HouseholdProjection,
} from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import { generateHouseholdBaselineTaskDescriptors } from "../task-generation/household";
import {
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
  const payload = input.event.payload;
  return generateHouseholdBaselineTaskDescriptors({
    household_id: payload.household_id,
    source_event_id: input.event.event_id,
    baseline_date: payload.baseline_date,
    config: input.config,
  });
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
