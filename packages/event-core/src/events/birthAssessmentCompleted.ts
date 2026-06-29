import type {
  BirthAssessmentCompletedPayload,
  DomainEventEnvelope,
} from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import { generateBirthAssessmentTaskDescriptors } from "../task-generation/birth";
import {
  noWorkflowForHeldEvent,
  type ProtocolConfig,
  type TaskDescriptor,
} from "./workflowHelpers";

export const EVENT_TYPE = "birth_assessment_completed";

export interface BirthAssessmentCompletedEventInput extends BaseEventInput {
  pregnancy_id: string;
  woman_id: string;
  child_id: string;
  birth_date: string;
  birth_status: "live_birth" | "stillbirth" | "fetal_loss_20plus";
  current_vital_status: "alive" | "deceased";
  death_date?: string | null;
}

export function buildEvent(
  input: BirthAssessmentCompletedEventInput,
): DomainEventEnvelope<BirthAssessmentCompletedPayload> {
  return {
    event_id: input.event_id,
    event_type: EVENT_TYPE,
    event_version: 1,
    aggregate_type: "child",
    aggregate_id: input.child_id,
    site_id: input.site_id,
    locality_code: input.locality_code,
    household_id: input.household_id,
    subject_type: "child",
    subject_id: input.child_id,
    task_id: input.task_id,
    task_key: input.task_key,
    form_response_id: input.form_response_id,
    source_response_id: input.form_response_id,
    source_task_id: input.task_id,
    event_date: input.event_date ?? input.birth_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      pregnancy_id: input.pregnancy_id,
      woman_id: input.woman_id,
      child_id: input.child_id,
      household_id: input.household_id,
      birth_date: input.birth_date,
      birth_status: input.birth_status,
      current_vital_status: input.current_vital_status,
      death_date: input.death_date,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: {
  event: DomainEventEnvelope<BirthAssessmentCompletedPayload>;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  if (noWorkflowForHeldEvent(input.event)) return [];
  const payload = input.event.payload;
  return generateBirthAssessmentTaskDescriptors({
    household_id: payload.household_id,
    woman_id: payload.woman_id,
    child_id: payload.child_id,
    birth_date: payload.birth_date,
    birth_status: payload.birth_status,
    current_vital_status: payload.current_vital_status,
    death_date: payload.death_date,
    source_event_id: input.event.event_id,
    config: input.config,
  });
}

export function promoteEvidence(
  input: BirthAssessmentCompletedEventInput & { config?: ProtocolConfig },
): EventPromotionResult<BirthAssessmentCompletedPayload> {
  const event = buildEvent(input);
  return {
    event,
    projection: reduceEvent(),
    task_descriptors: planWorkflow({ event, config: input.config }),
    data_quality_flags: [],
  };
}
