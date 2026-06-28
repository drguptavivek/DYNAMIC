import {
  DEFAULT_PROTOCOL_CONFIG,
} from "@dynamic/shared-workflow";
import type {
  DomainEventEnvelope,
  PregnancyEnrolledPayload,
  PregnancyOutcomeRecordedPayload,
} from "../types";
import { decideEligibleWomanWorkflow, decideHouseholdWorkflow } from "./household";
import {
  decidePregnancyEnrollmentWorkflow,
  decidePregnancyOutcomeWorkflow,
} from "./pregnancy";
import type { WorkflowDecisionInput, WorkflowDecisionResult } from "./types";

export * from "./household";
export * from "./pregnancy";
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
      return decidePregnancyEnrollmentWorkflow({
        event: input.event as unknown as DomainEventEnvelope<PregnancyEnrolledPayload>,
        pregnancy_projection: input.pregnancy_projection,
        config,
      });
    }
    case "pregnancy_outcome_recorded":
      return decidePregnancyOutcomeWorkflow({
        event: input.event as unknown as DomainEventEnvelope<PregnancyOutcomeRecordedPayload>,
        config,
      });
    default:
      return buildResult([], []);
  }
}
