import type { ProtocolConfig } from "@dynamic/shared-workflow";
import type { DomainEventEnvelope, HouseholdProjection } from "../types";
import {
  generateEligibleWomanWqTaskDescriptors,
  generateHouseholdBaselineTaskDescriptors,
} from "../task-generation/household";
import type { WorkflowDecisionResult } from "./types";

interface EligibleWomanIdentifiedPayload {
  household_id: string;
  woman_id: string;
  eligibility_start_date: string;
}

function buildResult(
  decisions: WorkflowDecisionResult["decisions"],
  data_quality_flags: WorkflowDecisionResult["data_quality_flags"],
): WorkflowDecisionResult {
  return { decisions, data_quality_flags };
}

export function decideHouseholdWorkflow(input: {
  event: DomainEventEnvelope;
  household_projection?: HouseholdProjection | null;
  config?: ProtocolConfig;
}): WorkflowDecisionResult {
  if (input.event.apply_status !== "applied") {
    return buildResult(
      [
        {
          kind: "tasks_suppressed",
          source_event_id: input.event.event_id,
          task_descriptors: [],
          reason: input.event.apply_status,
        },
      ],
      [],
    );
  }

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
        task_descriptors: generateHouseholdBaselineTaskDescriptors({
          household_id: projection.household_id,
          baseline_date: projection.baseline_date,
          source_event_id: input.event.event_id,
          config: input.config,
        }),
      },
    ],
    [],
  );
}

export function decideEligibleWomanWorkflow(input: {
  event: DomainEventEnvelope<EligibleWomanIdentifiedPayload>;
  config?: ProtocolConfig;
}): WorkflowDecisionResult {
  if (input.event.apply_status !== "applied") {
    return buildResult(
      [
        {
          kind: "tasks_suppressed",
          source_event_id: input.event.event_id,
          task_descriptors: [],
          reason: input.event.apply_status,
        },
      ],
      [],
    );
  }

  const payload = input.event.payload;
  return buildResult(
    [
      {
        kind: "tasks_generated",
        source_event_id: input.event.event_id,
        task_descriptors: generateEligibleWomanWqTaskDescriptors({
          household_id: payload.household_id,
          woman_id: payload.woman_id,
          eligibility_start_date: payload.eligibility_start_date,
          source_event_id: input.event.event_id,
          config: input.config,
        }),
      },
    ],
    [],
  );
}
