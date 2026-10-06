import assert from "node:assert/strict";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const store = new Map();
globalThis.window = { localStorage: {
  getItem: (key) => store.get(key) || null,
  setItem: (key, value) => store.set(key, value),
} };
const { saveQuestionnaireSubmission } = await import("../modules/questionnaires/questionnaireSubmissionRepository.js");
const key = "dynamic_web_sqlite_v2";
const womanId = "1-02-0042-03-02", householdId = "1-02-0042-03", pregnancyId = "pregnancy-1";
const base = { household_id: householdId, task_type: "PFF", subject_type: "pregnancy",
  subject_id: pregnancyId, pregnancy_id: pregnancyId, woman_id: womanId,
  status: "open", lifecycle_status: "planned" };
const ownTasks = [
  { ...base, id: "current", task_key: "current" },
  { ...base, id: "next", task_key: "next" },
  { ...base, id: "legacy", task_key: "legacy", woman_id: null, pregnancy_id: null },
  { ...base, id: "person", task_key: "person", subject_type: "person", subject_id: womanId, woman_id: null, pregnancy_id: null, task_type: "PSF" },
];
const independentTasks = [
  { ...base, id: "child", task_key: "child", child_id: "child-1", subject_type: "child", task_type: "NFF" },
  { ...base, id: "hhq", task_key: "hhq", subject_type: "household", subject_id: householdId, task_type: "HHQ" },
  { ...base, id: "other", task_key: "other", woman_id: "another-woman", pregnancy_id: "another-pregnancy", subject_id: "another-pregnancy" },
  { ...base, id: "history", task_key: "history", status: "completed", lifecycle_status: "completed" },
];
function seed() {
  window.localStorage.setItem(key, JSON.stringify({ follow_up_tasks: [...ownTasks, ...independentTasks],
    eligible_women: [{ woman_id: womanId, household_id: householdId, current_eligibility_status: "eligible", tracking_status: "pregnant" }],
    pregnancies: [{ pregnancy_id: pregnancyId, woman_id: womanId, household_id: householdId, pregnancy_status: "active" },
      { pregnancy_id: "pregnancy-2", woman_id: womanId, household_id: householdId, pregnancy_status: "enrolled" },
      { pregnancy_id: "pregnancy-3", woman_id: womanId, household_id: householdId, pregnancy_status: "detected" }],
  }));
}
function assertTerminated(state) {
  assert.equal(state.eligible_women.find((row) => row.woman_id === womanId).tracking_status, "terminated");
  assert.equal(state.eligible_women.find((row) => row.woman_id === womanId).current_eligibility_status, "deceased");
  assert.ok(state.pregnancies.every((row) => row.pregnancy_status === "closed"));
  for (const id of ["next", "legacy", "person"]) assert.equal(state.follow_up_tasks.find((row) => row.id === id).status, "cancelled");
  for (const task of independentTasks) assert.equal(state.follow_up_tasks.find((row) => row.id === task.id).status, task.status);
}
// Exercise the plain Node/browser fallback final submission in both contact modes.
for (const mode of [1, 2]) {
  seed();
  await saveQuestionnaireSubmission({ formCode: "PFF", formVersion: "test", taskId: "current", taskContext: ownTasks[0],
    payload: { pff_visit_date: "2026-10-06", pff_visit_type: mode, pff_vital_migration_status_woman: 2, pff_pregnancy_status: 2 }, deviceId: "test" });
  const state = JSON.parse(store.get(key));
  assertTerminated(state);
  assert.equal(state.follow_up_tasks.find((row) => row.id === "current").status, "completed");
  assert.equal(state.follow_up_tasks.length, ownTasks.length + independentTasks.length);
}

// Exercise the real repository with an isolated web SQLite adapter, including stale pulls.
seed();
const { openDatabaseSync } = await import("../shims/expo-sqlite.web.js");
const db = openDatabaseSync();
const require = stubOfflineDatabase(db, import.meta.url);
const repository = require("../modules/tasks/taskRepository.js");
repository.terminateLocalWoman({ womanId, pregnancyId, householdId });
assertTerminated(db.state);
repository.saveEligibleWoman({ woman_id: womanId, household_id: householdId, current_eligibility_status: "eligible" });
repository.savePregnancy({ pregnancy_id: pregnancyId, woman_id: womanId, household_id: householdId, pregnancy_status: "active" });
repository.saveTaskBatch([ownTasks[1], ownTasks[2], { ...base, id: "new", task_key: "new" }, independentTasks[0]]);
assertTerminated(db.state);
assert.equal(db.state.follow_up_tasks.find((row) => row.id === "new").status, "cancelled");
assert.equal(repository.isLocalWomanTerminated(womanId), true);
const { getDirectPefEligibility } = require("../modules/pregnancy/directPef.js");
assert.equal((await getDirectPefEligibility({ member: { individual_id: womanId, woman_questionnaire_eligible: 1 }, householdId })).eligible, false);
const originalRun = db.runSync.bind(db);
db.runSync = (sql, params) => {
  if (/INSERT OR REPLACE INTO eligible_women/i.test(sql)) throw new Error("disk full");
  return originalRun(sql, params);
};
assert.throws(() => repository.terminateLocalWoman({ womanId, pregnancyId, householdId }), /disk full/);
console.log("PFF woman termination validation passed");
