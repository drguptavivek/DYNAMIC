import {
  DEFAULT_PROTOCOL_CONFIG,
} from "@dynamic/shared-workflow";
import type {
  DomainEventEnvelope,
  PregnancyEnrolledPayload,
} from "../types";
import {
  pregnancyEnrolled,
} from "../events";
import { decideEligibleWomanWorkflow, decideHouseholdWorkflow } from "./household";
import type { WorkflowDecisionInput, WorkflowDecisionResult } from "./types";

export * from "./household";
export * from "./types";

function buildResult(
  decisions: WorkflowDecisionResult["decisions"],
  data_quality_flags: WorkflowDecisionResult["data_quality_flags"],
): WorkflowDecisionResult {
  return { decisions, data_quality_flags };
}

export function decideWorkflowForEvent(
  input: WorkflowDecisionInput,
): WorkflowDecisionResult {
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
    case "household_baseline_confirmed":
      return decideHouseholdWorkflow({
        event: input.event,
        household_projection: input.household_projection,
        config,
      });
    case "eligible_woman_identified":
      return decideEligibleWomanWorkflow({
        event: input.event as DomainEventEnvelope<{
          household_id: string;
          woman_id: string;
          eligibility_start_date: string;
        }>,
        config,
      });
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
              } as DomainEventEnvelope<PregnancyEnrolledPayload>,
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
