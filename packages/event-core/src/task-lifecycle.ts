export type TaskStatus =
  | "planned"
  | "due"
  | "urgent"
  | "overdue"
  | "in_progress"
  | "completed_on_time"
  | "completed_late"
  | "completed"
  | "closed_final_reason"
  | "closed"
  | "not_reachable_closed"
  | "missed"
  | "cancelled"
  | "superseded"
  | "disabled";

export type TaskLifecycleEventType =
  | "task_generated"
  | "task_disabled"
  | "task_opened"
  | "task_attempt_recorded"
  | "task_completed"
  | "task_closed_final_reason"
  | "task_missed"
  | "task_cancelled"
  | "task_superseded"
  | "task_reopened_by_admin";

export type TaskActorType = "field" | "backend" | "admin";

export type ResponseStatus =
  | "primary"
  | "duplicate_task_completion"
  | "invalid_rejected"
  | "superseded_by_admin"
  | "held_for_review";

export interface TaskLifecycleState {
  task_id: string;
  status: TaskStatus;
  failed_attempt_count?: number;
  max_failed_attempts?: number;
  requires_final_close_reason?: boolean;
  primary_response_id?: string | null;
}

export interface TaskLifecycleCommand {
  event_type: TaskLifecycleEventType | (string & {});
  actor_type: TaskActorType | (string & {});
  response_status?: ResponseStatus | (string & {}) | null;
  response_id?: string | null;
  close_reason?: string | null;
  occurred_late?: boolean;
}

export type TaskLifecycleReason =
  | "generated"
  | "opened"
  | "attempt_recorded"
  | "completed"
  | "closed_final_reason"
  | "missed"
  | "cancelled"
  | "superseded"
  | "reopened_by_admin"
  | "disabled_task"
  | "terminal_task"
  | "invalid_transition"
  | "unsupported_event"
  | "field_task_event_not_allowed"
  | "unsupported_actor"
  | "response_not_primary"
  | "missing_response_id"
  | "missing_close_reason"
  | "duplicate_primary_response";

export interface TaskLifecycleDecision {
  allowed: boolean;
  next_status?: TaskStatus;
  reason: TaskLifecycleReason;
  should_increment_failed_attempts: boolean;
  should_prompt_final_close_reason: boolean;
}

const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "completed_on_time",
  "completed_late",
  "completed",
  "closed_final_reason",
  "closed",
  "not_reachable_closed",
  "missed",
  "cancelled",
  "superseded",
]);

const FIELD_MUTABLE_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "due",
  "urgent",
  "overdue",
  "in_progress",
]);

const OPENABLE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "due",
  "urgent",
  "overdue",
]);

const CLOSE_REASON_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "due",
  "urgent",
  "overdue",
]);

const ATTEMPT_RECORDABLE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "due",
  "urgent",
  "overdue",
  "in_progress",
]);

const DISABLEABLE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "planned",
  "due",
  "urgent",
  "overdue",
  "in_progress",
]);

function isKnownTaskStatus(value: string): value is TaskStatus {
  return [
    "planned",
    "due",
    "urgent",
    "overdue",
    "in_progress",
    "completed_on_time",
    "completed_late",
    "completed",
    "closed_final_reason",
    "closed",
    "not_reachable_closed",
    "missed",
    "cancelled",
    "superseded",
    "disabled",
  ].includes(value as TaskStatus);
}

function normalizeStatus(status: string): TaskStatus | null {
  return isKnownTaskStatus(status) ? status : null;
}

function isFieldOrBackend(actor_type: string): boolean {
  return actor_type === "field" || actor_type === "backend";
}

function isAdmin(actor_type: string): boolean {
  return actor_type === "admin";
}

function buildDecision(
  allowed: boolean,
  reason: TaskLifecycleReason,
  next_status?: TaskStatus,
  should_increment_failed_attempts = false,
  should_prompt_final_close_reason = false,
): TaskLifecycleDecision {
  return {
    allowed,
    reason,
    next_status,
    should_increment_failed_attempts,
    should_prompt_final_close_reason,
  };
}

export function isTerminalTaskLifecycleStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

export function isFieldMutableTaskStatus(status: TaskStatus): boolean {
  return FIELD_MUTABLE_TASK_STATUSES.has(status);
}

export function getFailedAttemptDisposition(
  failed_attempt_count?: number | null,
  max_failed_attempts?: number | null,
  requires_final_close_reason = true,
): {
  next_failed_attempt_count: number;
  should_prompt_final_close_reason: boolean;
} {
  const next_failed_attempt_count = (failed_attempt_count ?? 0) + 1;
  const should_prompt_final_close_reason =
    typeof max_failed_attempts === "number" &&
    Number.isFinite(max_failed_attempts) &&
    next_failed_attempt_count >= max_failed_attempts &&
    requires_final_close_reason;

  return {
    next_failed_attempt_count,
    should_prompt_final_close_reason,
  };
}

export function evaluateTaskLifecycleTransition(
  state: TaskLifecycleState,
  command: TaskLifecycleCommand,
): TaskLifecycleDecision {
  const status = normalizeStatus(state.status);
  if (!status) {
    return buildDecision(false, "invalid_transition");
  }

  const event_type = command.event_type;
  const actor_type = command.actor_type;
  const isFieldActor = actor_type === "field";
  const isBackendActor = actor_type === "backend";
  const isAdminActor = isAdmin(actor_type);
  const isNonAdminActor = !isAdminActor;
  const currentFailedAttemptCount = state.failed_attempt_count ?? 0;

  if (!isAdminActor && (status === "disabled" || isTerminalTaskLifecycleStatus(status))) {
    return buildDecision(false, status === "disabled" ? "disabled_task" : "terminal_task");
  }

  switch (event_type) {
    case "task_generated":
      if (!isBackendActor && !isAdminActor) {
        return buildDecision(false, "unsupported_actor");
      }
      if (status !== "planned") {
        return buildDecision(false, "invalid_transition");
      }
      return buildDecision(true, "generated", "planned");

    case "task_opened":
      if (!isFieldOrBackend(actor_type)) {
        return buildDecision(false, "unsupported_actor");
      }
      if (!OPENABLE_STATUSES.has(status)) {
        return buildDecision(false, "invalid_transition");
      }
      return buildDecision(true, "opened", "in_progress");

    case "task_completed": {
      if (!isFieldOrBackend(actor_type) && !isAdminActor) {
        return buildDecision(false, "unsupported_actor");
      }
      if (status !== "in_progress") {
        return buildDecision(false, "invalid_transition");
      }
      if (state.primary_response_id) {
        return buildDecision(false, "duplicate_primary_response");
      }
      if (command.response_status !== "primary") {
        return buildDecision(false, "response_not_primary");
      }
      if (!command.response_id) {
        return buildDecision(false, "missing_response_id");
      }
      return buildDecision(
        true,
        "completed",
        command.occurred_late ? "completed_late" : "completed_on_time",
      );
    }

    case "task_closed_final_reason":
      if (!isFieldOrBackend(actor_type)) {
        return buildDecision(false, "unsupported_actor");
      }
      if (!CLOSE_REASON_STATUSES.has(status)) {
        return buildDecision(false, "invalid_transition");
      }
      if (!command.close_reason) {
        return buildDecision(false, "missing_close_reason");
      }
      return buildDecision(true, "closed_final_reason", "closed_final_reason");

    case "task_attempt_recorded": {
      if (!isFieldOrBackend(actor_type)) {
        return buildDecision(false, "field_task_event_not_allowed");
      }
      if (!ATTEMPT_RECORDABLE_STATUSES.has(status)) {
        return buildDecision(false, "invalid_transition");
      }
      const disposition = getFailedAttemptDisposition(
        currentFailedAttemptCount,
        state.max_failed_attempts,
        state.requires_final_close_reason,
      );
      return buildDecision(
        true,
        "attempt_recorded",
        status,
        true,
        disposition.should_prompt_final_close_reason,
      );
    }

    case "task_missed":
    case "task_cancelled":
    case "task_superseded": {
      if (isFieldActor) {
        return buildDecision(false, "field_task_event_not_allowed");
      }
      if (!isBackendActor && !isAdminActor) {
        return buildDecision(false, "unsupported_actor");
      }
      if (!["planned", "due", "urgent", "overdue"].includes(status)) {
        return buildDecision(false, "invalid_transition");
      }
      if (event_type === "task_missed") {
        return buildDecision(true, "missed", "missed");
      }
      if (event_type === "task_cancelled") {
        return buildDecision(true, "cancelled", "cancelled");
      }
      return buildDecision(true, "superseded", "superseded");
    }

    case "task_disabled":
      if (!isBackendActor && !isAdminActor) {
        return buildDecision(false, "field_task_event_not_allowed");
      }
      if (!DISABLEABLE_STATUSES.has(status)) {
        return buildDecision(false, "invalid_transition");
      }
      return buildDecision(true, "disabled_task", "disabled");

    case "task_reopened_by_admin":
      if (!isAdminActor) {
        return buildDecision(false, "unsupported_actor");
      }
      if (!status || (!isTerminalTaskLifecycleStatus(status) && status !== "disabled")) {
        return buildDecision(false, "invalid_transition");
      }
      return buildDecision(true, "reopened_by_admin", "due");

    default:
      return buildDecision(false, "unsupported_event");
  }
}
