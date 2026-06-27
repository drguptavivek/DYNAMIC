import type { ProtocolConfig, TaskDescriptor } from "@dynamic/shared-workflow";
import type {
  DomainEventEnvelope,
  HouseholdProjection,
  PregnancyProjection,
} from "../types";

export type WorkflowDecisionKind =
  | "tasks_generated"
  | "tasks_suppressed"
  | "tasks_cancelled"
  | "tasks_superseded";

export interface WorkflowDecisionInput {
  event: DomainEventEnvelope;
  household_projection?: HouseholdProjection | null;
  pregnancy_projection?: PregnancyProjection | null;
  config?: ProtocolConfig;
  rules_version?: string;
}

export interface WorkflowDecisionResult {
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
