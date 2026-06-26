import type { DomainEventEnvelope } from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import type { ProtocolConfig, TaskDescriptor } from "./workflowHelpers";

export const EVENT_TYPE = "verbal_autopsy_completed";

export interface VerbalAutopsyCompletedPayload {
  household_id: string;
  deceased_id: string;
  completed_date: string;
}

export interface VerbalAutopsyCompletedEventInput extends BaseEventInput {
  deceased_id: string;
  completed_date: string;
}

export function buildEvent(input: VerbalAutopsyCompletedEventInput): DomainEventEnvelope<VerbalAutopsyCompletedPayload> {
  return {
    event_id: input.event_id,
    event_type: EVENT_TYPE,
    event_version: 1,
    aggregate_type: "deceased",
    aggregate_id: input.deceased_id,
    site_id: input.site_id,
    locality_code: input.locality_code,
    household_id: input.household_id,
    subject_type: "deceased",
    subject_id: input.deceased_id,
    task_id: input.task_id,
    task_key: input.task_key,
    form_response_id: input.form_response_id,
    source_response_id: input.form_response_id,
    source_task_id: input.task_id,
    event_date: input.event_date ?? input.completed_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      household_id: input.household_id,
      deceased_id: input.deceased_id,
      completed_date: input.completed_date,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(): TaskDescriptor[] {
  return [];
}

export function promoteEvidence(input: VerbalAutopsyCompletedEventInput & { config?: ProtocolConfig }): EventPromotionResult<VerbalAutopsyCompletedPayload> {
  const event = buildEvent(input);
  return { event, projection: reduceEvent(), task_descriptors: planWorkflow(), data_quality_flags: [] };
}
