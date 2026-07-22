const TERMINAL_STATUSES = new Set([
  "completed",
  "missed",
  "cancelled",
  "superseded",
  "closed",
  "closed_final_reason",
]);

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
  return !TERMINAL_STATUSES.has(status) && !TERMINAL_STATUSES.has(lifecycleStatus);
}

function sortByProtocolDate(left, right) {
  const leftDate = left.target_date || "";
  const rightDate = right.target_date || "";
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return (left.task_key || left.id || "").localeCompare(right.task_key || right.id || "");
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

export function listTaskWorklist(filters = {}, repository) {
  if (!repository || typeof repository.listTasks !== "function") {
    throw new Error("Task Worklist repository adapter must provide listTasks");
  }
  const tasks = repository.listTasks({
    status: filters.status || "open",
    locality_code: filters.locality_code,
    task_type: filters.task_type,
  });
  return selectActionableTasks(tasks);
}

export function reconcilePulledTasks(tasks = [], repository) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { saved: 0, merged: [] };
  }
  if (
    !repository ||
    typeof repository.listTasks !== "function" ||
    typeof repository.saveTaskBatch !== "function"
  ) {
    throw new Error("Task Worklist repository adapter must provide listTasks and saveTaskBatch");
  }

  const existingTasks = repository.listTasks({});
  const incomingTasks = tasks.map((task) => ({
    ...task,
    sync_status: task.sync_status || "synced",
  }));
  const merged = mergeTaskWorklist({ existingTasks, incomingTasks });

  repository.saveTaskBatch(merged);

  return {
    saved: incomingTasks.length,
    merged,
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
    repository.saveTask({
      ...task,
      sync_status: task.sync_status || "pending",
    });
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
      repository.saveTask({
        ...row.wqTask,
        sync_status: row.wqTask.sync_status || "pending",
      });
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
