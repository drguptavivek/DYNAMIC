import type {
  DomainEventEnvelope,
  PregnancyOutcomeRecordedPayload,
} from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import { generatePregnancyOutcomeTaskDescriptors } from "../task-generation/pregnancy";
import {
  noWorkflowForHeldEvent,
  type ProtocolConfig,
  type TaskDescriptor,
} from "./workflowHelpers";

export const EVENT_TYPE = "pregnancy_outcome_recorded";

export interface PregnancyOutcomeRecordedEventInput extends BaseEventInput {
  pregnancy_id: string;
  woman_id: string;
  outcome_date: string;
  outcome_type: string;
  live_birth_count: number;
  stillbirth_count: number;
}

export function buildEvent(
  input: PregnancyOutcomeRecordedEventInput,
): DomainEventEnvelope<PregnancyOutcomeRecordedPayload> {
  return {
    event_id: input.event_id,
    event_type: EVENT_TYPE,
    event_version: 1,
    aggregate_type: "pregnancy",
    aggregate_id: input.pregnancy_id,
    site_id: input.site_id,
    locality_code: input.locality_code,
    household_id: input.household_id,
    subject_type: "pregnancy",
    subject_id: input.pregnancy_id,
    task_id: input.task_id,
    task_key: input.task_key,
    form_response_id: input.form_response_id,
    source_response_id: input.form_response_id,
    source_task_id: input.task_id,
    event_date: input.event_date ?? input.outcome_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      pregnancy_id: input.pregnancy_id,
      woman_id: input.woman_id,
      household_id: input.household_id,
      outcome_date: input.outcome_date,
      outcome_type: input.outcome_type,
      live_birth_count: input.live_birth_count,
      stillbirth_count: input.stillbirth_count,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: {
  event: DomainEventEnvelope<PregnancyOutcomeRecordedPayload>;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  if (noWorkflowForHeldEvent(input.event)) return [];
  const payload = input.event.payload;
  return generatePregnancyOutcomeTaskDescriptors({
    household_id: payload.household_id,
    pregnancy_id: payload.pregnancy_id,
    woman_id: payload.woman_id,
    outcome_date: payload.outcome_date,
    live_birth_count: payload.live_birth_count,
    source_event_id: input.event.event_id,
    config: input.config,
  });
}

export function promoteEvidence(
  input: PregnancyOutcomeRecordedEventInput & { config?: ProtocolConfig },
): EventPromotionResult<PregnancyOutcomeRecordedPayload> {
  const event = buildEvent(input);
  return {
    event,
    projection: reduceEvent(),
    task_descriptors: planWorkflow({ event, config: input.config }),
    data_quality_flags: [],
  };
}
