import assert from "node:assert/strict";

const {
  listTaskWorklist,
  mergeTaskWorklist,
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
};

const reconcileResult = reconcilePulledTasks([confirmedTask], repository);
assert.equal(reconcileResult.saved, 1);
assert.equal(savedBatches.length, 1);
assert.equal(savedBatches[0].length, 1);
assert.equal(savedBatches[0][0].id, "server-task-1");

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

console.log("Task worklist validation passed");
