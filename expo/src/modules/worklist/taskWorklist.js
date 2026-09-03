import { evaluateTaskLifecycleTransition } from "@dynamic/event-core";
import { DEFAULT_PROTOCOL_CONFIG } from "@dynamic/shared-workflow";
import { getLocalCalendarDate } from "../../lib/localDate.js";

const TERMINAL_STATUSES = new Set([
  "completed",
  "missed",
  "cancelled",
  "superseded",
  "closed",
  "closed_final_reason",
]);
const BASELINE_ATTEMPT_TASK_TYPES = new Set(["HHQ", "WQ"]);
const BASELINE_MAX_FAILED_ATTEMPTS = 3;
const BASELINE_TASK_TYPES = new Set(["HHQ", "WQ"]);

function taskIdentity(task) {
  return task?.task_key || task?.id || null;
}

function isConfirmedTask(task) {
  return (
    task?.sync_status === "synced" ||
    task?.sync_status === "confirmed" ||
    task?.server_commit_sequence != null
  );
}

function isActionableTask(task) {
  const status = task?.status || task?.lifecycle_status || "open";
  const lifecycleStatus = task?.lifecycle_status || status;
  if (isTerminalTask(task)) {
    return false;
  }
  if (BASELINE_TASK_TYPES.has(String(task?.task_type || "").toUpperCase())) {
    return true;
  }
  if (String(lifecycleStatus).toLowerCase() === "planned") {
    const today = getLocalCalendarDate();
    const opensOn = task?.window_start || task?.target_date || "";
    return !opensOn || opensOn <= today;
  }
  return true;
}

function isTerminalTask(task) {
  const status = task?.status || task?.lifecycle_status || "open";
  const lifecycleStatus = task?.lifecycle_status || status;
  return TERMINAL_STATUSES.has(status) || TERMINAL_STATUSES.has(lifecycleStatus);
}

function taskProtocolDate(task) {
  return task?.target_date || task?.window_start || "";
}

function taskOpenDate(task) {
  return task?.window_start || task?.target_date || "";
}

export function isFuturePlannedTask(task, today = getLocalCalendarDate()) {
  if (isTerminalTask(task)) return false;
  const lifecycleStatus = String(task?.lifecycle_status || task?.status || "").toLowerCase();
  if (lifecycleStatus !== "planned") return false;
  if (BASELINE_TASK_TYPES.has(String(task?.task_type || "").toUpperCase())) return false;
  const opensOn = taskOpenDate(task);
  return Boolean(opensOn && opensOn > today);
}

export function getTaskStage(task, today = getLocalCalendarDate()) {
  if (task?.has_active_draft) return "draft";
  if (isFuturePlannedTask(task, today)) return "future_planned";
  const date = taskProtocolDate(task);
  if (date && date < today) return "outdated";
  if (date && date === today) return "current";
  return "upcoming";
}

export function getTaskUrgencyBucket(task, today = getLocalCalendarDate()) {
  const stage = getTaskStage(task, today);
  if (stage === "draft") return "draft";
  if (stage === "future_planned") return "futurePlanned";
  const protocolDate = taskProtocolDate(task);
  if (protocolDate && protocolDate < today) return "overdue";
  if (protocolDate === today) return "today";
  return "upcoming";
}

function isOutdatedTask(task, today = getLocalCalendarDate()) {
  const date = taskProtocolDate(task);
  return Boolean(date && date < today);
}

export function selectTasksForStage(tasks = [], stage = "") {
  const normalizedStage = String(stage || "").trim();
  if (normalizedStage === "future_planned") {
    return tasks.filter((task) => isFuturePlannedTask(task)).sort(sortByProtocolDate);
  }

  const actionableTasks = selectActionableTasks(tasks);
  if (!normalizedStage) return actionableTasks;
  if (normalizedStage === "outdated") {
    return actionableTasks.filter((task) => isOutdatedTask(task)).sort(sortByProtocolDate);
  }
  return actionableTasks
    .filter((task) => getTaskStage(task) === normalizedStage)
    .sort(sortByProtocolDate);
}

function describeReconciledProvisional(existingTask, confirmedTask) {
  if (!existingTask || isConfirmedTask(existingTask)) return null;

  return {
    task_key: confirmedTask.task_key || existingTask.task_key || null,
    provisional_task_id: existingTask.id,
    confirmed_task_id: confirmedTask.id,
    disposition: isTerminalTask(confirmedTask) ? "withdrawn" : "confirmed",
  };
}

function sortByProtocolDate(left, right) {
  const leftDate = left.target_date || "";
  const rightDate = right.target_date || "";
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return (left.task_key || left.id || "").localeCompare(right.task_key || right.id || "");
}

export function normalizeTaskAttemptLimits(task) {
  if (!task || !BASELINE_ATTEMPT_TASK_TYPES.has(String(task.task_type || "").toUpperCase())) {
    return task;
  }
  return {
    ...task,
    max_failed_attempts: BASELINE_MAX_FAILED_ATTEMPTS,
  };
}

export function mergeTaskWorklist({ existingTasks = [], incomingTasks = [] } = {}) {
  const byIdentity = new Map();

  for (const task of existingTasks) {
    const identity = taskIdentity(task);
    if (!identity) continue;
    byIdentity.set(identity, task);
  }

  for (const task of incomingTasks) {
    const identity = taskIdentity(task);
    if (!identity) continue;
    const current = byIdentity.get(identity);
    if (!current || isConfirmedTask(task) || !isConfirmedTask(current)) {
      byIdentity.set(identity, task);
    }
  }

  return [...byIdentity.values()].sort(sortByProtocolDate);
}

export function selectActionableTasks(tasks = []) {
  return tasks.filter(isActionableTask).sort(sortByProtocolDate);
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function taskSearchText(task) {
  return [
    task?.id,
    task?.task_key,
    task?.task_type,
    task?.household_id,
    task?.subject_id,
    task?.subject_name,
    task?.subject_type,
    task?.household_head_name,
    task?.household_address,
    task?.address,
    task?.target_date,
    task?.assigned_site_id,
    task?.assigned_locality_code,
  ]
    .filter((value) => value != null && value !== "")
    .join(" ")
    .toLowerCase();
}

export function filterTaskWorklist(tasks = [], filters = {}) {
  const search = normalizeSearchValue(filters.search);
  const localityCode = String(filters.locality_code || "").trim();
  const stage = String(filters.stage || "").trim();

  return selectTasksForStage(tasks, stage).filter((task) => {
    if (localityCode && String(task?.assigned_locality_code || "").trim() !== localityCode) {
      return false;
    }

    if (search && !taskSearchText(task).includes(search)) {
      return false;
    }

    return true;
  });
}

export function buildTaskLocalityOptions(tasks = [], localities = []) {
  const taskSiteIdsByLocality = new Map();

  for (const task of tasks || []) {
    const code = String(task?.assigned_locality_code || "").trim();
    if (!code) continue;

    const siteId = String(task?.assigned_site_id ?? task?.site_id ?? "").trim();
    if (!taskSiteIdsByLocality.has(code)) {
      taskSiteIdsByLocality.set(code, new Set());
    }
    taskSiteIdsByLocality.get(code).add(siteId);
  }

  const optionsByCode = new Map();

  for (const locality of localities || []) {
    const code = String(locality?.locality_code || "").trim();
    if (!code) continue;

    const name = String(locality?.locality_name || "").trim();
    optionsByCode.set(code, {
      code,
      label: name ? `${name} (${code})` : `Locality ${code}`,
    });
  }

  for (const [code] of taskSiteIdsByLocality) {
    if (!optionsByCode.has(code)) {
      optionsByCode.set(code, {
        code,
        label: `Locality ${code}`,
      });
    }
  }

  return [...optionsByCode.values()].sort((left, right) => left.code.localeCompare(right.code));
}

export function listTaskWorklist(filters = {}, repository) {
  if (!repository || typeof repository.listTasks !== "function") {
    throw new Error("Task Worklist repository adapter must provide listTasks");
  }
  const tasks = repository.listTasks({
    status: filters.status || "open",
    locality_code: filters.locality_code,
    task_type: filters.task_type,
  });
  return filterTaskWorklist(tasks, { search: filters.search, stage: filters.stage });
}

export function listTaskWorklistCandidates(filters = {}, repository) {
  if (!repository || typeof repository.listTasks !== "function") {
    throw new Error("Task Worklist repository adapter must provide listTasks");
  }
  return repository
    .listTasks({
      status: filters.status,
      locality_code: filters.locality_code,
      task_type: filters.task_type,
    })
    .filter((task) => !isTerminalTask(task))
    .sort(sortByProtocolDate);
}

/**
 * Database-backed worklist page. The repository owns SQL predicates and the
 * count so callers never infer a total from a truncated task array.
 */
export async function listTaskWorklistPage(filters = {}, repository) {
  if (!repository || typeof repository.listTasksPage !== "function") {
    throw new Error("Task Worklist repository adapter must provide listTasksPage");
  }
  return repository.listTasksPage({
    status: filters.status,
    locality_code: filters.locality_code,
    task_type: filters.task_type,
    stage: filters.stage,
    search: filters.search,
    activeDrafts: filters.activeDrafts || [],
    today: filters.today,
    limit: filters.limit,
    offset: filters.offset,
  });
}

export function listTaskAttempts(taskId, repository) {
  if (!taskId) return [];
  if (!repository || typeof repository.getTaskAttempts !== "function") {
    throw new Error("Task Worklist repository adapter must provide getTaskAttempts");
  }
  return repository.getTaskAttempts(taskId);
}

export function listTaskFinalCloseReasons(task, config = DEFAULT_PROTOCOL_CONFIG) {
  if (!task?.task_type) return [];
  const rule = config.attempt_disposition_rules.find(
    (candidate) => candidate.task_type === task.task_type,
  );
  if (!rule?.requires_final_close_reason) return [];
  return [...rule.close_reason_options];
}

export function closeTaskWithFinalReason({ taskId, closeReason } = {}, repository) {
  if (!taskId || !closeReason) {
    throw new Error("Task and final close reason are required");
  }
  if (
    !repository ||
    typeof repository.getTask !== "function" ||
    typeof repository.saveTaskClosure !== "function"
  ) {
    throw new Error("Task Worklist repository adapter must provide getTask and saveTaskClosure");
  }

  const task = repository.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} was not found`);
  const closeReasons = listTaskFinalCloseReasons(task);
  if (!closeReasons.includes(closeReason)) {
    throw new Error(`Final close reason is not allowed for task type ${task.task_type}`);
  }

  const lifecycleStatus = task.lifecycle_status || task.status;
  const decision = evaluateTaskLifecycleTransition(
    {
      task_id: task.id,
      status: lifecycleStatus === "open" ? "due" : lifecycleStatus,
      failed_attempt_count: task.failed_attempt_count,
      max_failed_attempts: task.max_failed_attempts,
      requires_final_close_reason: Boolean(task.requires_final_close_reason),
      primary_response_id: task.primary_response_id,
    },
    {
      event_type: "task_closed_final_reason",
      actor_type: "field",
      close_reason: closeReason,
    },
  );

  if (!decision.allowed) {
    throw new Error(`Task lifecycle transition rejected: ${decision.reason}`);
  }

  const closedAt = new Date().toISOString();
  repository.saveTaskClosure(task.id, {
    status: "closed",
    lifecycle_status: decision.next_status,
    closed_reason: closeReason,
    closed_at: closedAt,
    sync_status: "pending",
  });

  return { decision, closed_at: closedAt };
}

export function recordFailedTaskAttempt({ task, attempt } = {}, repository) {
  if (!task?.id || !attempt?.id || attempt.task_id !== task.id) {
    throw new Error("Task and matching attempt identifiers are required");
  }
  if (
    !repository ||
    typeof repository.getTaskAttempts !== "function" ||
    typeof repository.saveTaskAttempt !== "function"
  ) {
    throw new Error(
      "Task Worklist repository adapter must provide getTaskAttempts and saveTaskAttempt",
    );
  }

  const storedTask =
    typeof repository.getTask === "function" ? repository.getTask(task.id) || task : task;
  const existingAttempts = repository.getTaskAttempts(task.id);
  const storedFailedAttemptCount = Number(storedTask.failed_attempt_count);
  const failedAttemptCount =
    storedTask.failed_attempt_count != null && Number.isFinite(storedFailedAttemptCount)
      ? storedFailedAttemptCount
      : existingAttempts.length;
  const lifecycleStatus = storedTask.lifecycle_status || storedTask.status;
  const decision = evaluateTaskLifecycleTransition(
    {
      task_id: task.id,
      status: lifecycleStatus === "open" ? "due" : lifecycleStatus,
      failed_attempt_count: failedAttemptCount,
      max_failed_attempts: storedTask.max_failed_attempts,
      requires_final_close_reason:
        storedTask.requires_final_close_reason == null
          ? undefined
          : Boolean(storedTask.requires_final_close_reason),
      primary_response_id: storedTask.primary_response_id,
    },
    {
      event_type: "task_attempt_recorded",
      actor_type: "field",
    },
  );

  if (!decision.allowed) {
    throw new Error(`Task lifecycle transition rejected: ${decision.reason}`);
  }

  const nextFailedAttemptCount = decision.should_increment_failed_attempts
    ? failedAttemptCount + 1
    : failedAttemptCount;
  const persistedAttempt = {
    ...attempt,
    attempt_number: nextFailedAttemptCount,
  };

  repository.saveTaskAttempt(persistedAttempt, {
    failed_attempt_count: nextFailedAttemptCount,
    lifecycle_status: decision.next_status,
  });

  return {
    attempt: persistedAttempt,
    decision,
    failed_attempt_count: nextFailedAttemptCount,
  };
}

export function reconcilePulledTasks(tasks = [], repository) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { saved: 0, merged: [], reconciled: [] };
  }
  if (
    !repository ||
    typeof repository.listTasks !== "function" ||
    typeof repository.saveTaskBatch !== "function"
  ) {
    throw new Error("Task Worklist repository adapter must provide listTasks and saveTaskBatch");
  }

  const incomingTasks = tasks.map((task) =>
    normalizeTaskAttemptLimits({
      ...task,
      sync_status: task.sync_status || "synced",
    })
  );
  const incomingIdentities = incomingTasks
    .map(taskIdentity)
    .filter((identity) => identity != null);
  const existingTasks =
    typeof repository.getTasksByIdentities === "function"
      ? repository.getTasksByIdentities(incomingIdentities)
      : repository.listTasks({});
  const existingByIdentity = new Map(
    existingTasks
      .map((task) => [taskIdentity(task), task])
      .filter(([identity]) => identity != null),
  );
  const reconciled = incomingTasks
    .map((task) => describeReconciledProvisional(existingByIdentity.get(taskIdentity(task)), task))
    .filter(Boolean);
  const merged = mergeTaskWorklist({ existingTasks, incomingTasks });

  repository.saveTaskBatch(incomingTasks);

  return {
    saved: incomingTasks.length,
    merged,
    reconciled,
  };
}

export function saveProvisionalTasks(tasks = [], repository) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { saved: 0 };
  }
  if (!repository || typeof repository.saveTask !== "function") {
    throw new Error("Task Worklist repository adapter must provide saveTask");
  }

  for (const task of tasks) {
    repository.saveTask(
      normalizeTaskAttemptLimits({
        ...task,
        sync_status: task.sync_status || "pending",
      })
    );
  }

  return { saved: tasks.length };
}

export function saveEligibleWomanWorkflow(derivedRows = [], repository) {
  if (!Array.isArray(derivedRows) || derivedRows.length === 0) {
    return { eligibleWomen: 0, tasks: 0 };
  }
  if (
    !repository ||
    typeof repository.saveEligibleWoman !== "function" ||
    typeof repository.saveTask !== "function"
  ) {
    throw new Error("Task Worklist repository adapter must provide saveEligibleWoman and saveTask");
  }

  let taskCount = 0;
  for (const row of derivedRows) {
    repository.saveEligibleWoman(row.eligibleWoman);
    if (row.wqTask) {
      repository.saveTask(
        normalizeTaskAttemptLimits({
          ...row.wqTask,
          sync_status: row.wqTask.sync_status || "pending",
        })
      );
      taskCount += 1;
    }
  }

  return { eligibleWomen: derivedRows.length, tasks: taskCount };
}

export function saveProvisionalPregnancyWorkflow({ pregnancy, tasks = [] } = {}, repository) {
  if (!pregnancy && (!Array.isArray(tasks) || tasks.length === 0)) {
    return { pregnancies: 0, tasks: 0 };
  }
  if (
    !repository ||
    typeof repository.savePregnancy !== "function" ||
    typeof repository.saveTask !== "function"
  ) {
    throw new Error("Task Worklist repository adapter must provide savePregnancy and saveTask");
  }

  if (pregnancy) {
    repository.savePregnancy(pregnancy);
  }
  const taskResult = saveProvisionalTasks(tasks, repository);

  return {
    pregnancies: pregnancy ? 1 : 0,
    tasks: taskResult.saved,
  };
}
