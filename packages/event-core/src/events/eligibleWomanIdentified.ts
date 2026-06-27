import type { DomainEventEnvelope } from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import { generateEligibleWomanWqTaskDescriptors } from "../task-generation/household";
import { noWorkflowForHeldEvent, type ProtocolConfig, type TaskDescriptor } from "./workflowHelpers";

export const EVENT_TYPE = "eligible_woman_identified";

export interface EligibleWomanIdentifiedPayload {
  household_id: string;
  woman_id: string;
  eligibility_start_date: string;
}

export interface EligibleWomanIdentifiedEventInput extends BaseEventInput {
  woman_id: string;
  eligibility_start_date: string;
}

export function buildEvent(input: EligibleWomanIdentifiedEventInput): DomainEventEnvelope<EligibleWomanIdentifiedPayload> {
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
    event_date: input.event_date ?? input.eligibility_start_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      household_id: input.household_id,
      woman_id: input.woman_id,
      eligibility_start_date: input.eligibility_start_date,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: { event: DomainEventEnvelope<EligibleWomanIdentifiedPayload>; config?: ProtocolConfig }): TaskDescriptor[] {
  if (noWorkflowForHeldEvent(input.event)) return [];
  const payload = input.event.payload;
  return generateEligibleWomanWqTaskDescriptors({
    household_id: payload.household_id,
    woman_id: payload.woman_id,
    eligibility_start_date: payload.eligibility_start_date,
    source_event_id: input.event.event_id,
    config: input.config,
  });
}

export function promoteEvidence(input: EligibleWomanIdentifiedEventInput & { config?: ProtocolConfig }): EventPromotionResult<EligibleWomanIdentifiedPayload> {
  const event = buildEvent(input);
  return { event, projection: reduceEvent(), task_descriptors: planWorkflow({ event, config: input.config }), data_quality_flags: [] };
}
