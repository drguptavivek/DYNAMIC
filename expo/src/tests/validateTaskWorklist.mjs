import assert from "node:assert/strict";

const {
  listTaskWorklist,
  listTaskAttempts,
  listTaskFinalCloseReasons,
  mergeTaskWorklist,
  closeTaskWithFinalReason,
  recordFailedTaskAttempt,
  reconcilePulledTasks,
  saveEligibleWomanWorkflow,
  saveProvisionalPregnancyWorkflow,
  saveProvisionalTasks,
  selectActionableTasks,
} = await import("../modules/worklist/taskWorklist.js");

const provisionalTask = {
  id: "local-task-1",
  task_key: "hh-1|person|woman-1|WQ|baseline|2026-09-01|v1",
  household_id: "hh-1",
  subject_type: "person",
  subject_id: "woman-1",
  task_type: "WQ",
  target_date: "2026-09-01",
  status: "open",
  lifecycle_status: "open",
  source_event_id: "evt-local-1",
  sync_status: "local",
};

const confirmedTask = {
  ...provisionalTask,
  id: "server-task-1",
  source_event_id: "evt-server-1",
  sync_status: "synced",
  server_commit_sequence: 42,
};

const merged = mergeTaskWorklist({
  existingTasks: [provisionalTask],
  incomingTasks: [confirmedTask],
});
assert.equal(merged.length, 1);
assert.equal(merged[0].id, "server-task-1");
assert.equal(merged[0].task_key, provisionalTask.task_key);
assert.equal(merged[0].source_event_id, "evt-server-1");

const actionable = selectActionableTasks([
  confirmedTask,
  { ...confirmedTask, id: "completed-task", task_key: "completed-key", status: "completed" },
  { ...confirmedTask, id: "superseded-task", task_key: "superseded-key", lifecycle_status: "superseded" },
  { ...confirmedTask, id: "disabled-task", task_key: "disabled-key", form_availability: "disabled" },
]);
assert.deepEqual(actionable.map((task) => task.id), ["disabled-task", "server-task-1"]);

const savedBatches = [];
const savedTasks = [];
const savedEligibleWomen = [];
const savedPregnancies = [];
const savedAttempts = [];
const savedClosures = [];
const repositoryTasks = new Map([[provisionalTask.id, provisionalTask]]);
const repository = {
  listTasks(filters = {}) {
    if (filters.status === "open") {
      return [provisionalTask];
    }
    return [provisionalTask];
  },
  saveTaskBatch(tasks) {
    savedBatches.push(tasks);
  },
  saveTask(task) {
    savedTasks.push(task);
  },
  saveEligibleWoman(woman) {
    savedEligibleWomen.push(woman);
  },
  savePregnancy(pregnancy) {
    savedPregnancies.push(pregnancy);
  },
  getTaskAttempts(taskId) {
    return savedAttempts.filter((attempt) => attempt.task_id === taskId);
  },
  saveTaskAttempt(attempt, taskState) {
    savedAttempts.push({ ...attempt, task_state: taskState });
    repositoryTasks.set(attempt.task_id, {
      ...repositoryTasks.get(attempt.task_id),
      ...taskState,
    });
  },
  getTask(taskId) {
    return repositoryTasks.get(taskId) || null;
  },
  saveTaskClosure(taskId, taskState) {
    savedClosures.push({ taskId, taskState });
    repositoryTasks.set(taskId, { ...repositoryTasks.get(taskId), ...taskState });
  },
};

const reconcileResult = reconcilePulledTasks([confirmedTask], repository);
assert.equal(reconcileResult.saved, 1);
assert.deepEqual(reconcileResult.reconciled, [
  {
    task_key: provisionalTask.task_key,
    provisional_task_id: "local-task-1",
    confirmed_task_id: "server-task-1",
    disposition: "confirmed",
  },
]);
assert.equal(savedBatches.length, 1);
assert.equal(savedBatches[0].length, 1);
assert.equal(savedBatches[0][0].id, "server-task-1");

const withdrawnTask = {
  ...confirmedTask,
  id: "server-task-withdrawn",
  status: "superseded",
  lifecycle_status: "superseded",
};
const withdrawnResult = reconcilePulledTasks([withdrawnTask], repository);
assert.equal(withdrawnResult.reconciled[0].disposition, "withdrawn");

const worklist = listTaskWorklist({ locality_code: "02" }, repository);
assert.deepEqual(worklist.map((task) => task.id), ["local-task-1"]);

assert.deepEqual(saveProvisionalTasks([provisionalTask], repository), { saved: 1 });
assert.equal(savedTasks[0].sync_status, "local");

assert.deepEqual(
  saveEligibleWomanWorkflow(
    [{ eligibleWoman: { woman_id: "woman-1" }, wqTask: { ...provisionalTask, sync_status: undefined } }],
    repository,
  ),
  { eligibleWomen: 1, tasks: 1 },
);
assert.equal(savedEligibleWomen[0].woman_id, "woman-1");
assert.equal(savedTasks[1].sync_status, "pending");

assert.deepEqual(
  saveProvisionalPregnancyWorkflow(
    { pregnancy: { pregnancy_id: "pregnancy-1" }, tasks: [{ ...provisionalTask, id: "pff-1" }] },
    repository,
  ),
  { pregnancies: 1, tasks: 1 },
);
assert.equal(savedPregnancies[0].pregnancy_id, "pregnancy-1");
assert.equal(savedTasks[2].sync_status, "local");

const attemptTask = {
  ...provisionalTask,
  lifecycle_status: "due",
  failed_attempt_count: 1,
  max_failed_attempts: 2,
  requires_final_close_reason: true,
};
repositoryTasks.set(attemptTask.id, attemptTask);
assert.throws(
  () =>
    closeTaskWithFinalReason(
      { taskId: attemptTask.id, closeReason: "not_reachable" },
      repository,
    ),
  /failed_attempt_limit_not_reached/,
);
const attempt = {
  id: "attempt-2",
  task_id: attemptTask.id,
  attempt_number: 2,
  outcome: "not_found",
};
const attemptResult = recordFailedTaskAttempt({ task: attemptTask, attempt }, repository);
assert.equal(attemptResult.decision.allowed, true);
assert.equal(attemptResult.decision.should_prompt_final_close_reason, true);
assert.equal(attemptResult.failed_attempt_count, 2);
assert.equal(savedAttempts[0].task_state.failed_attempt_count, 2);
assert.deepEqual(listTaskAttempts(attemptTask.id, repository), savedAttempts);
assert.deepEqual(listTaskFinalCloseReasons(attemptTask), [
  "not_reachable",
  "refused",
  "moved_out",
  "deceased",
  "not_applicable",
]);

const closeResult = closeTaskWithFinalReason(
  { taskId: attemptTask.id, closeReason: "not_reachable" },
  repository,
);
assert.equal(closeResult.decision.allowed, true);
assert.equal(savedClosures[0].taskState.status, "closed");
assert.equal(savedClosures[0].taskState.lifecycle_status, "closed_final_reason");
assert.equal(savedClosures[0].taskState.closed_reason, "not_reachable");

const noCloseReasonResult = recordFailedTaskAttempt(
  {
    task: {
      ...attemptTask,
      id: "no-close-reason-task",
      requires_final_close_reason: false,
    },
    attempt: {
      ...attempt,
      id: "no-close-reason-attempt",
      task_id: "no-close-reason-task",
    },
  },
  repository,
);
assert.equal(noCloseReasonResult.decision.should_prompt_final_close_reason, false);

assert.throws(
  () =>
    recordFailedTaskAttempt(
      {
        task: { ...attemptTask, lifecycle_status: "completed" },
        attempt: { ...attempt, id: "attempt-terminal" },
      },
      repository,
    ),
  /terminal_task/,
);
assert.equal(savedAttempts.length, 2);

console.log("Task worklist validation passed");
