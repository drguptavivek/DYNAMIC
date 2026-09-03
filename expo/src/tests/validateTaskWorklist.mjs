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
  buildTaskLocalityOptions,
  filterTaskWorklist,
  getTaskStage,
  getTaskUrgencyBucket,
  isFuturePlannedTask,
  listTaskWorklistCandidates,
  normalizeTaskAttemptLimits,
  selectActionableTasks,
  selectTasksForStage,
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
  {
    ...confirmedTask,
    id: "future-planned-hrf",
    task_key: "future-planned-hrf-key",
    task_type: "HRF",
    lifecycle_status: "planned",
    window_start: "2099-01-01",
    target_date: "2099-01-15",
  },
  {
    ...confirmedTask,
    id: "future-planned-hhq",
    task_key: "future-planned-hhq-key",
    task_type: "HHQ",
    lifecycle_status: "planned",
    status: "planned",
    window_start: "2099-01-01",
    target_date: "2099-01-15",
  },
  {
    ...confirmedTask,
    id: "current-planned-wq",
    task_key: "current-planned-wq-key",
    task_type: "WQ",
    lifecycle_status: "planned",
    window_start: "2000-01-01",
    target_date: "2000-01-15",
  },
]);
assert.deepEqual(actionable.map((task) => task.id), [
  "current-planned-wq",
  "disabled-task",
  "server-task-1",
  "future-planned-hhq",
]);

const futurePlannedTask = {
  ...confirmedTask,
  id: "future-planned-hrf-filter",
  task_key: "future-planned-hrf-filter-key",
  task_type: "HRF",
  lifecycle_status: "planned",
  target_date: "2099-01-15",
  window_start: "2099-01-01",
};
assert.equal(isFuturePlannedTask(futurePlannedTask, "2026-08-17"), true);
assert.equal(getTaskStage(futurePlannedTask, "2026-08-17"), "future_planned");
assert.equal(getTaskStage({ ...confirmedTask, has_active_draft: true }, "2026-08-17"), "draft");
assert.equal(
  getTaskUrgencyBucket({ ...confirmedTask, target_date: null, window_start: "2026-08-17" }, "2026-08-17"),
  "today",
);
assert.equal(
  getTaskUrgencyBucket({ ...confirmedTask, target_date: null, window_start: "2026-08-16" }, "2026-08-17"),
  "overdue",
);
const overdueDraftTask = {
  ...confirmedTask,
  id: "overdue-draft-task",
  task_key: "overdue-draft-task-key",
  has_active_draft: true,
  target_date: "2026-08-12",
  window_start: "2026-08-12",
};
assert.equal(getTaskStage(overdueDraftTask, "2026-08-17"), "draft");
assert.deepEqual(
  selectTasksForStage([confirmedTask, futurePlannedTask], "future_planned").map((task) => task.id),
  ["future-planned-hrf-filter"],
);
const futureDatedTask = {
  ...confirmedTask,
  id: "future-dated-task",
  task_key: "future-dated-task-key",
  target_date: "2099-06-01",
};
assert.deepEqual(
  selectTasksForStage([futureDatedTask, overdueDraftTask], "outdated").map((task) => task.id),
  ["overdue-draft-task"],
);
assert.deepEqual(
  selectTasksForStage([futureDatedTask, overdueDraftTask], "draft").map((task) => task.id),
  ["overdue-draft-task"],
);
assert.deepEqual(
  selectTasksForStage([confirmedTask, futurePlannedTask], "").map((task) => task.id),
  ["server-task-1"],
);

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

const identityCalls = [];
const identityBatches = [];
let identityListTasksCalled = false;
const identityRepository = {
  listTasks() {
    identityListTasksCalled = true;
    return [];
  },
  getTasksByIdentities(identities) {
    identityCalls.push(identities);
    return [provisionalTask].filter((task) =>
      identities.includes(task.task_key) || identities.includes(task.id),
    );
  },
  saveTaskBatch(tasks) {
    identityBatches.push(tasks);
  },
};

const identityReconcileResult = reconcilePulledTasks([confirmedTask], identityRepository);
assert.equal(identityListTasksCalled, false);
assert.equal(identityCalls.length, 1);
assert.deepEqual(identityCalls[0], [confirmedTask.task_key]);
assert.equal(identityReconcileResult.saved, 1);
assert.deepEqual(identityReconcileResult.reconciled, [
  {
    task_key: provisionalTask.task_key,
    provisional_task_id: "local-task-1",
    confirmed_task_id: "server-task-1",
    disposition: "confirmed",
  },
]);
assert.equal(identityBatches.length, 1);

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

assert.deepEqual(
  buildTaskLocalityOptions([], [
    { site_id: 1, locality_code: "01", locality_name: "North" },
    { site_id: 1, locality_code: "02", locality_name: "South" },
  ]),
  [
    { code: "01", label: "North (01)" },
    { code: "02", label: "South (02)" },
  ],
  "assigned locality masters must remain available even when no task currently uses them",
);

let candidateFilters = null;
const candidates = listTaskWorklistCandidates({}, {
  listTasks(filters = {}) {
    candidateFilters = filters;
    return [
      confirmedTask,
      { ...confirmedTask, id: "completed-candidate", task_key: "completed-candidate-key", status: "completed" },
      {
        ...confirmedTask,
        id: "planned-draft-candidate",
        task_key: "planned-draft-candidate-key",
        status: "planned",
        lifecycle_status: "planned",
        task_type: "WQ",
        target_date: "2026-08-12",
      },
    ];
  },
});
assert.equal(candidateFilters.status, undefined);
assert.deepEqual(candidates.map((task) => task.id), [
  "planned-draft-candidate",
  "server-task-1",
]);

const searchableTasks = [
  {
    ...provisionalTask,
    id: "alpha-task",
    task_key: "alpha-key",
    household_id: "2-02-0002-02",
    subject_name: "",
    household_head_name: "Existing Duplicate Head",
    household_address: "Existing duplicate address",
    assigned_locality_code: "02",
  },
  {
    ...provisionalTask,
    id: "beta-task",
    task_key: "beta-key",
    household_id: "1-01-0001-01",
    subject_name: "Dev Household",
    assigned_locality_code: "01",
  },
];
assert.deepEqual(
  filterTaskWorklist(searchableTasks, { search: "duplicate" }).map((task) => task.id),
  ["alpha-task"],
);
assert.deepEqual(
  filterTaskWorklist(searchableTasks, { search: "address" }).map((task) => task.id),
  ["alpha-task"],
);
assert.deepEqual(
  filterTaskWorklist(searchableTasks, { locality_code: "01" }).map((task) => task.id),
  ["beta-task"],
);
assert.deepEqual(
  filterTaskWorklist(searchableTasks, { search: "0002", locality_code: "02" }).map(
    (task) => task.id,
  ),
  ["alpha-task"],
);
assert.deepEqual(
  filterTaskWorklist(
    [
      ...searchableTasks,
      {
        ...searchableTasks[0],
        id: "draft-alpha-task",
        task_key: "draft-alpha-key",
        has_active_draft: true,
      },
    ],
    { stage: "draft" },
  ).map((task) => task.id),
  ["draft-alpha-task"],
);
assert.deepEqual(
  buildTaskLocalityOptions(
    [{ ...searchableTasks[0], assigned_site_id: 2 }],
    [
      { site_id: 1, locality_code: "01", locality_name: "Sunped" },
      { site_id: 2, locality_code: "02", locality_name: "02" },
    ],
  ).map((option) => option.code),
  ["01", "02"],
);
assert.deepEqual(
  buildTaskLocalityOptions(
    [{ ...searchableTasks[0], assigned_site_id: 2 }],
    [
      { site_id: 1, locality_code: "02", locality_name: "Wrong site duplicate" },
      { site_id: 2, locality_code: "02", locality_name: "02" },
    ],
  ),
  [{ code: "02", label: "02 (02)" }],
);

assert.deepEqual(saveProvisionalTasks([provisionalTask], repository), { saved: 1 });
assert.equal(savedTasks[0].sync_status, "local");
assert.equal(
  normalizeTaskAttemptLimits({ task_type: "HHQ", max_failed_attempts: 5 }).max_failed_attempts,
  3,
);
assert.equal(
  normalizeTaskAttemptLimits({ task_type: "WQ", max_failed_attempts: 5 }).max_failed_attempts,
  3,
);

assert.deepEqual(
  saveEligibleWomanWorkflow(
    [{ eligibleWoman: { woman_id: "woman-1" }, wqTask: { ...provisionalTask, sync_status: undefined } }],
    repository,
  ),
  { eligibleWomen: 1, tasks: 1 },
);
assert.equal(savedEligibleWomen[0].woman_id, "woman-1");
assert.equal(savedTasks[1].sync_status, "pending");
assert.equal(savedTasks[1].max_failed_attempts, 3);

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
  id: "hrf-attempt-task",
  task_key: "hh-1|household|hh-1|HRF|round-1|2026-09-01|v1",
  subject_type: "household",
  subject_id: "hh-1",
  task_type: "HRF",
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
]);
assert.deepEqual(listTaskFinalCloseReasons({ ...provisionalTask, task_type: "WQ" }), []);

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
