import { buildEvent as buildBirthEvent, planWorkflow as planBirthWorkflow } from "./birthAssessmentCompleted";
import type { BirthAssessmentCompletedEventInput } from "./birthAssessmentCompleted";
import type { EventPromotionResult } from "./types";
import type { BirthAssessmentCompletedPayload, DomainEventEnvelope } from "../types";
import type { ProtocolConfig, TaskDescriptor } from "./workflowHelpers";

export const EVENT_TYPE = "child_death_recorded";

export interface ChildDeathRecordedEventInput
  extends Omit<
    BirthAssessmentCompletedEventInput,
    "birth_status" | "current_vital_status" | "birth_date"
  > {
  death_date: string;
}

export function buildEvent(
  input: ChildDeathRecordedEventInput,
): DomainEventEnvelope<BirthAssessmentCompletedPayload> {
  return {
    ...buildBirthEvent({
      ...input,
      birth_date: input.death_date,
      birth_status: "live_birth",
      current_vital_status: "deceased",
    }),
    event_type: EVENT_TYPE,
    event_date: input.death_date,
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: {
  event: DomainEventEnvelope<BirthAssessmentCompletedPayload>;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  return planBirthWorkflow(input);
}

export function promoteEvidence(
  input: ChildDeathRecordedEventInput & { config?: ProtocolConfig },
): EventPromotionResult<BirthAssessmentCompletedPayload> {
  const event = buildEvent(input);
  return {
    event,
    projection: reduceEvent(),
    task_descriptors: planWorkflow({ event, config: input.config }),
    data_quality_flags: [],
  };
}
