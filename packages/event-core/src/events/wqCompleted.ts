import type { DomainEventEnvelope } from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import * as pregnancyDetected from "./pregnancyDetected";
import type { ProtocolConfig, TaskDescriptor } from "./workflowHelpers";

export const EVENT_TYPE = "wq_completed";

export interface WqCompletedPayload {
  household_id: string;
  woman_id: string;
  wq_pregnant: boolean;
  completed_date: string;
}

export interface WqCompletedEventInput extends BaseEventInput {
  woman_id: string;
  wq_pregnant: boolean;
  completed_date: string;
}

export function buildEvent(input: WqCompletedEventInput): DomainEventEnvelope<WqCompletedPayload> {
  return {
    event_id: input.event_id,
    event_type: EVENT_TYPE,
    event_version: 1,
    aggregate_type: "woman",
    aggregate_id: input.woman_id,
    site_id: input.site_id,
    locality_code: input.locality_code,
    household_id: input.household_id,
    subject_type: "woman",
    subject_id: input.woman_id,
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
      woman_id: input.woman_id,
      wq_pregnant: input.wq_pregnant,
      completed_date: input.completed_date,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: { event: DomainEventEnvelope<WqCompletedPayload>; config?: ProtocolConfig }): TaskDescriptor[] {
  if (input.event.apply_status !== "applied" || !input.event.payload.wq_pregnant) return [];
  const detectedEvent = pregnancyDetected.buildEvent({
    event_id: input.event.event_id,
    site_id: input.event.site_id,
    locality_code: input.event.locality_code,
    household_id: input.event.household_id,
    woman_id: input.event.payload.woman_id,
    detected_date: input.event.payload.completed_date,
    recorded_at: input.event.recorded_at,
    task_id: input.event.task_id,
    task_key: input.event.task_key,
    form_response_id: input.event.form_response_id,
    apply_status: input.event.apply_status,
  });
  return pregnancyDetected.planWorkflow({ event: detectedEvent, config: input.config });
}

export function promoteEvidence(input: WqCompletedEventInput & { config?: ProtocolConfig }): EventPromotionResult<WqCompletedPayload> {
  const event = buildEvent(input);
  return { event, projection: reduceEvent(), task_descriptors: planWorkflow({ event, config: input.config }), data_quality_flags: [] };
}
