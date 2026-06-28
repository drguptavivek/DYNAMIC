import type { ProtocolConfig } from "@dynamic/shared-workflow";
import type {
  DomainEventEnvelope,
  PregnancyEnrolledPayload,
  PregnancyOutcomeRecordedPayload,
  PregnancyProjection,
} from "../types";
import {
  generatePregnancyEnrollmentTaskDescriptors,
  generatePregnancyOutcomeTaskDescriptors,
} from "../task-generation/pregnancy";
import type { WorkflowDecisionResult } from "./types";

function buildResult(
  decisions: WorkflowDecisionResult["decisions"],
  data_quality_flags: WorkflowDecisionResult["data_quality_flags"],
): WorkflowDecisionResult {
  return { decisions, data_quality_flags };
}

function suppressHeldEvent(event: { event_id: string; apply_status: string }): WorkflowDecisionResult | null {
  if (event.apply_status === "applied") return null;
  return buildResult(
    [
      {
        kind: "tasks_suppressed",
        source_event_id: event.event_id,
        task_descriptors: [],
        reason: event.apply_status,
      },
    ],
    [],
  );
}

export function decidePregnancyEnrollmentWorkflow(input: {
  event: DomainEventEnvelope<PregnancyEnrolledPayload>;
  pregnancy_projection?: PregnancyProjection | null;
  config?: ProtocolConfig;
}): WorkflowDecisionResult {
  const suppressed = suppressHeldEvent(input.event);
  if (suppressed) return suppressed;

  const projection = input.pregnancy_projection ?? null;
  if (!projection?.pregnancy_id || !projection.enrollment_date) {
    return buildResult([], [
      {
        flag_type: "workflow_projection_missing",
        source_event_id: input.event.event_id,
        message: "pregnancy projection required for pregnancy_enrolled workflow generation",
      },
    ]);
  }

  return buildResult(
    [
      {
        kind: "tasks_generated",
        source_event_id: input.event.event_id,
        task_descriptors: generatePregnancyEnrollmentTaskDescriptors({
          household_id: projection.household_id,
          pregnancy_id: projection.pregnancy_id,
          woman_id: projection.woman_id,
          enrollment_date: projection.enrollment_date,
          usg_available: projection.usg_available,
          source_event_id: input.event.event_id,
          config: input.config,
        }),
      },
    ],
    [],
  );
}

export function decidePregnancyOutcomeWorkflow(input: {
  event: DomainEventEnvelope<PregnancyOutcomeRecordedPayload>;
  config?: ProtocolConfig;
}): WorkflowDecisionResult {
  const suppressed = suppressHeldEvent(input.event);
  if (suppressed) return suppressed;

  const payload = input.event.payload;
  return buildResult(
    [
      {
        kind: "tasks_generated",
        source_event_id: input.event.event_id,
        task_descriptors: generatePregnancyOutcomeTaskDescriptors({
          household_id: payload.household_id,
          pregnancy_id: payload.pregnancy_id,
          woman_id: payload.woman_id,
          outcome_date: payload.outcome_date,
          live_birth_count: payload.live_birth_count,
          source_event_id: input.event.event_id,
          config: input.config,
        }),
      },
    ],
    [],
  );
}
