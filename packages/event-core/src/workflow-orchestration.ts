import { decideWorkflowForEvent } from "./workflow-decision";
import type {
  WorkflowDecisionInput,
  WorkflowDecisionKind,
  WorkflowDecisionResult,
} from "./workflow-decision";

export type { WorkflowDecisionKind };
export type WorkflowOrchestrationInput = WorkflowDecisionInput;
export type WorkflowOrchestrationResult = WorkflowDecisionResult;

export function orchestrateWorkflowForEvent(
  input: WorkflowOrchestrationInput,
): WorkflowOrchestrationResult {
  return decideWorkflowForEvent(input);
}
