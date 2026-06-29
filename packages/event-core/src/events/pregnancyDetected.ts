import type { DomainEventEnvelope } from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import { generatePregnancyDetectedTaskDescriptors } from "../task-generation/pregnancy";
import type { ProtocolConfig, TaskDescriptor } from "./workflowHelpers";

export const EVENT_TYPE = "pregnancy_detected";

export interface PregnancyDetectedPayload {
  household_id: string;
  woman_id: string;
  detected_date: string;
}

export interface PregnancyDetectedEventInput extends BaseEventInput {
  woman_id: string;
  detected_date: string;
}

export function buildEvent(input: PregnancyDetectedEventInput): DomainEventEnvelope<PregnancyDetectedPayload> {
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
    event_date: input.event_date ?? input.detected_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      household_id: input.household_id,
      woman_id: input.woman_id,
      detected_date: input.detected_date,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: { event: DomainEventEnvelope<PregnancyDetectedPayload>; config?: ProtocolConfig }): TaskDescriptor[] {
  if (input.event.apply_status !== "applied") return [];
  const payload = input.event.payload;
  return generatePregnancyDetectedTaskDescriptors({
    household_id: payload.household_id,
    woman_id: payload.woman_id,
    detected_date: payload.detected_date,
    source_event_id: input.event.event_id,
    config: input.config,
  });
}

export function promoteEvidence(input: PregnancyDetectedEventInput & { config?: ProtocolConfig }): EventPromotionResult<PregnancyDetectedPayload> {
  const event = buildEvent(input);
  return { event, projection: reduceEvent(), task_descriptors: planWorkflow({ event, config: input.config }), data_quality_flags: [] };
}
