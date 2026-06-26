import {
  DEFAULT_PROTOCOL_CONFIG,
  type ProtocolConfig,
  type TaskDescriptor,
} from "@dynamic/shared-workflow";

import type {
  DomainEventEnvelope,
  HouseholdBaselineConfirmedPayload,
  HouseholdProjection,
  PregnancyProjection,
} from "./types";
import {
  householdBaselineConfirmed,
  pregnancyEnrolled,
} from "./events";

export type WorkflowDecisionKind =
  | "tasks_generated"
  | "tasks_suppressed"
  | "tasks_cancelled"
  | "tasks_superseded";

export interface WorkflowOrchestrationInput {
  event: DomainEventEnvelope;
  household_projection?: HouseholdProjection | null;
  pregnancy_projection?: PregnancyProjection | null;
  config?: ProtocolConfig;
  rules_version?: string;
}

export interface WorkflowOrchestrationResult {
  decisions: Array<{
    kind: WorkflowDecisionKind;
    source_event_id: string;
    task_descriptors: TaskDescriptor[];
    reason?: string;
  }>;
  data_quality_flags: Array<{
    flag_type: string;
    source_event_id: string;
    message: string;
  }>;
}

function buildResult(
  decisions: WorkflowOrchestrationResult["decisions"],
  data_quality_flags: WorkflowOrchestrationResult["data_quality_flags"],
): WorkflowOrchestrationResult {
  return { decisions, data_quality_flags };
}

export function orchestrateWorkflowForEvent(
  input: WorkflowOrchestrationInput,
): WorkflowOrchestrationResult {
  const config = input.config ?? DEFAULT_PROTOCOL_CONFIG;
  const expectedRulesVersion = input.rules_version ?? config.rules_version;

  if (expectedRulesVersion !== config.rules_version) {
    return buildResult([], [
      {
        flag_type: "workflow_rules_version_mismatch",
        source_event_id: input.event.event_id,
        message: `workflow rules_version ${expectedRulesVersion} does not match config rules_version ${config.rules_version}`,
      },
    ]);
  }

  switch (input.event.event_type) {
    case "household_baseline_confirmed": {
      const projection = input.household_projection ?? null;
      if (!projection?.household_id || !projection.baseline_date) {
        return buildResult([], [
          {
            flag_type: "workflow_projection_missing",
            source_event_id: input.event.event_id,
            message: "household projection required for household_baseline_confirmed workflow generation",
          },
        ]);
      }

      return buildResult(
        [
          {
            kind: "tasks_generated",
            source_event_id: input.event.event_id,
            task_descriptors: householdBaselineConfirmed.planWorkflow({
              event: input.event as unknown as DomainEventEnvelope<HouseholdBaselineConfirmedPayload>,
              config,
            }),
          },
        ],
        [],
      );
    }
    case "pregnancy_enrolled": {
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
            task_descriptors: pregnancyEnrolled.planWorkflow({
              event: {
                ...input.event,
                event_type: "pregnancy_enrolled",
                payload: {
                  pregnancy_id: projection.pregnancy_id,
                  woman_id: projection.woman_id,
                  household_member_id: projection.household_member_id,
                  household_id: projection.household_id,
                  enrollment_date: projection.enrollment_date,
                  pregnancy_status: projection.pregnancy_status,
                  usg_available: projection.usg_available,
                },
              },
              config,
            }),
          },
        ],
        [],
      );
    }
    default:
      return buildResult([], []);
  }
}
