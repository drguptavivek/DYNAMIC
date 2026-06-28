import { reducePregnancyProjectionEvents } from "../pregnancy-projection";
import type {
  DomainEventEnvelope,
  PregnancyEnrolledPayload,
  PregnancyProjection,
} from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import { generatePregnancyEnrollmentTaskDescriptors } from "../task-generation/pregnancy";
import {
  noWorkflowForHeldEvent,
  type ProtocolConfig,
  type TaskDescriptor,
} from "./workflowHelpers";

export const EVENT_TYPE = "pregnancy_enrolled";

export interface PregnancyEnrolledEventInput extends BaseEventInput {
  pregnancy_id: string;
  woman_id: string;
  household_member_id: string;
  enrollment_date: string;
  usg_available: boolean;
}

export function buildEvent(
  input: PregnancyEnrolledEventInput,
): DomainEventEnvelope<PregnancyEnrolledPayload> {
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
    event_date: input.event_date ?? input.enrollment_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      pregnancy_id: input.pregnancy_id,
      woman_id: input.woman_id,
      household_member_id: input.household_member_id,
      household_id: input.household_id,
      enrollment_date: input.enrollment_date,
      pregnancy_status: "enrolled",
      usg_available: input.usg_available,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(input: {
  event: DomainEventEnvelope<PregnancyEnrolledPayload>;
  current?: PregnancyProjection | null;
}): PregnancyProjection | null {
  return reducePregnancyProjectionEvents(
    [input.event as unknown as DomainEventEnvelope],
    input.current ?? null,
  );
}

export function planWorkflow(input: {
  event: DomainEventEnvelope<PregnancyEnrolledPayload>;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  if (noWorkflowForHeldEvent(input.event)) return [];
  const payload = input.event.payload;
  return generatePregnancyEnrollmentTaskDescriptors({
    household_id: payload.household_id,
    pregnancy_id: payload.pregnancy_id,
    woman_id: payload.woman_id,
    enrollment_date: payload.enrollment_date,
    usg_available: payload.usg_available,
    source_event_id: input.event.event_id,
    config: input.config,
  });
}

export function promoteEvidence(
  input: PregnancyEnrolledEventInput & { config?: ProtocolConfig },
): EventPromotionResult<PregnancyEnrolledPayload> {
  const event = buildEvent(input);
  return {
    event,
    projection: reduceEvent({ event }),
    task_descriptors: planWorkflow({ event, config: input.config }),
    data_quality_flags: [],
  };
}
