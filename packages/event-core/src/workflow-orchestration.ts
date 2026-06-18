import {
  DEFAULT_PROTOCOL_CONFIG,
  onHouseholdEnrolled,
  type ProtocolConfig,
  type TaskDescriptor,
} from "@dynamic/shared-workflow";

import type { DomainEventEnvelope, HouseholdProjection } from "./types";

export type WorkflowDecisionKind =
  | "tasks_generated"
  | "tasks_suppressed"
  | "tasks_cancelled"
  | "tasks_superseded";

export interface WorkflowOrchestrationInput {
  event: DomainEventEnvelope;
  household_projection?: HouseholdProjection | null;
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
    case "household_enrolled": {
      const projection = input.household_projection ?? null;
      if (!projection?.household_id || !projection.baseline_date) {
        return buildResult([], [
          {
            flag_type: "workflow_projection_missing",
            source_event_id: input.event.event_id,
            message: "household projection required for household_enrolled workflow generation",
          },
        ]);
      }

      return buildResult(
        [
          {
            kind: "tasks_generated",
            source_event_id: input.event.event_id,
            task_descriptors: onHouseholdEnrolled({
              event_id: input.event.event_id,
              household_id: projection.household_id,
              baseline_completed_date: projection.baseline_date,
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
