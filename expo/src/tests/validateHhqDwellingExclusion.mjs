import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";
const store = new Map();
globalThis.window = { localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) } };
const { saveQuestionnaireSubmission, getHhqGeneratedTaskKeys } = await import("../modules/questionnaires/questionnaireSubmissionRepository.js");
const householdId = "2-11-0001-01", key = "dynamic_web_sqlite_v2";
const task = { id: "current", task_key: "current", household_id: householdId, subject_type: "household", subject_id: householdId, task_type: "HHQ", status: "open" };
const staleRoster = [{ member_line_number: 1, member_name: "stale", member_sex: 2, member_age_years: 25, member_marital_status: 2, woman_questionnaire_eligible: true }];
function seed() {
  store.clear();
  store.set(key, JSON.stringify({ follow_up_tasks: [task, { ...task, id: "next", task_key: "next", task_type: "HRF" },
    { ...task, id: "history", task_key: "history", status: "completed" },
    { ...task, id: "other", task_key: "other", household_id: "2-11-0002-01" }], form_responses: [] }));
}
for (const outcome of [7, 8, 9, 11, 12]) {
  seed();
  const response = await saveQuestionnaireSubmission({ formCode: "HHQ", formVersion: "test", taskId: "current", taskContext: task,
    payload: { hhq_competent_respondent_available: outcome, hhq_result_interview: 1,
      hhq_competent_respondent_other_specify: outcome === 12 ? "  Exact offline reason  " : undefined,
      hhq_consent_study_provide_pis_explain_study_adult_member: 1, hhq_household_members: staleRoster } });
  const state = JSON.parse(store.get(key));
  assert.equal(response.server_response_status, "household_excluded");
  assert.equal(state.follow_up_tasks.find(row => row.id === "current").status, "completed");
  assert.equal(state.follow_up_tasks.find(row => row.id === "next").status, "cancelled");
  assert.equal(state.follow_up_tasks.find(row => row.id === "history").status, "completed");
  assert.equal(state.follow_up_tasks.find(row => row.id === "other").status, "open");
  assert.equal((state.eligible_women || []).length, 0);
  assert.equal((state.domain_events_outbox || []).length, 1);
  assert.equal(JSON.parse(state.domain_events_outbox[0].payload).payload.enrollment_status, "not_enrolled");
  assert.deepEqual(getHhqGeneratedTaskKeys(response), []);
  const households = JSON.parse(store.get("dynamic_households_v4"));
  assert.equal(households[0].household_id, householdId, "task identity survives missing question IDs");
  assert.equal(households[0].result_interview, outcome);
  assert.equal(households[0].consent_status, "No");
  if (outcome === 12) {
    assert.equal(response.answers_json.hhq_competent_respondent_other_specify, "  Exact offline reason  ");
    assert.equal(households[0].closed_reason, "  Exact offline reason  ");
    assert.equal(state.follow_up_tasks.find(row => row.id === "next").closed_reason, "  Exact offline reason  ");
  }
  assert.deepEqual(JSON.parse(store.get("dynamic_household_members_v4")), []);
  const duplicate = await saveQuestionnaireSubmission({ formCode: "HHQ", formVersion: "test", taskContext: task,
    payload: { hhq_competent_respondent_available: 1, hhq_result_interview: 1, hhq_household_members: staleRoster } });
  assert.equal(duplicate.server_response_status, "duplicate");
  assert.equal(JSON.parse(store.get("dynamic_households_v4"))[0].result_interview, outcome);
}
for (const reason of [undefined, "", "  ", "a".repeat(121)]) {
  seed();
  const before = store.get(key);
  await assert.rejects(saveQuestionnaireSubmission({ formCode: "HHQ", formVersion: "test", taskContext: task,
    payload: { hhq_competent_respondent_available: 12, hhq_competent_respondent_other_specify: reason,
      hhq_result_interview_other_specify: "legacy other10reason" } }), /Specify the other dwelling reason/);
  assert.equal(store.get(key), before, "invalid reason cannot write immutable evidence or change any tasks");
}
seed();
const initial = JSON.parse(store.get(key));
initial.form_responses = [{ id: "accepted", form_code: "HHQ", household_id: householdId, server_response_status: "primary", answers_json: JSON.stringify({ hhq_competent_respondent_available: 1, hhq_result_interview: 1 }) }];
store.set(key, JSON.stringify(initial));
const duplicate = await saveQuestionnaireSubmission({ formCode: "HHQ", formVersion: "test", taskContext: task,
  payload: { hhq_competent_respondent_available: 8 } });
assert.equal(duplicate.server_response_status, "duplicate");
assert.equal(JSON.parse(store.get(key)).follow_up_tasks.find(row => row.id === "next").status, "open");
assert.equal(store.has("dynamic_households_v4"), false);

// Exercise the native repository SQL against a fresh in-memory SQLite database.
const sqlite = new DatabaseSync(":memory:");
const db = {
  runSync(sql, params = []) {
    if (/UPDATE follow_up_tasks SET status = 'cancelled'/.test(sql)) assert.ok(params.every(value => value !== undefined));
    return params.length ? sqlite.prepare(sql).run(...params.map(value => value ?? null)) : sqlite.exec(sql);
  },
  getFirstSync(sql, params = []) { return sqlite.prepare(sql).get(...params); },
  getAllSync(sql, params = []) { return sqlite.prepare(sql).all(...params); },
};
const require = stubOfflineDatabase(db, import.meta.url);
const repository = require("../modules/tasks/taskRepository.js");
const nativeTask = id => ({ ...task, id, task_key: id, status: id === "history" ? "completed" : "open" });
repository.saveTaskBatch([nativeTask("current"), nativeTask("next"), nativeTask("history")]);
repository.saveFormResponse({ id: "excluded", form_code: "HHQ", form_version: "test", household_id: householdId, task_id: "current",
  server_response_status: "household_excluded", answers_json: { hhq_competent_respondent_available: 12, hhq_competent_respondent_other_specify: "  Stored exact reason  " }, submitted_at: new Date().toISOString() });
repository.excludeLocalHousehold({ householdId, currentTaskId: "current", reason: "  Stored exact reason  ", timestamp: new Date().toISOString() });
assert.equal(db.getFirstSync("SELECT status FROM follow_up_tasks WHERE id = ?", ["next"]).status, "cancelled");
assert.equal(db.getFirstSync("SELECT status FROM follow_up_tasks WHERE id = ?", ["history"]).status, "completed");
repository.saveTask(nativeTask("next"));
repository.saveTaskBatch([nativeTask("new-task")]);
assert.equal(db.getFirstSync("SELECT status FROM follow_up_tasks WHERE id = ?", ["next"]).status, "cancelled");
assert.equal(db.getFirstSync("SELECT status FROM follow_up_tasks WHERE id = ?", ["new-task"]).status, "cancelled");
assert.equal(db.getFirstSync("SELECT closed_reason FROM follow_up_tasks WHERE id = ?", ["new-task"]).closed_reason, "  Stored exact reason  ");
repository.excludeLocalHousehold({ householdId, reason: "  Stored exact reason  ", timestamp: new Date().toISOString() });
assert.equal(db.getFirstSync("SELECT status FROM follow_up_tasks WHERE id = ?", ["current"]).status, "completed");
sqlite.close();
const { openDatabaseSync } = await import("../shims/expo-sqlite.web.js");
seed();
const webDb = openDatabaseSync();
for (const method of ["runSync", "getFirstSync", "getAllSync"]) db[method] = webDb[method].bind(webDb);
repository.saveFormResponse({ id: "excluded-web", form_code: "HHQ", form_version: "test", household_id: householdId, task_id: "current",
  server_response_status: "household_excluded", answers_json: { hhq_competent_respondent_available: 12, hhq_competent_respondent_other_specify: "  Stored exact reason  " } });
repository.excludeLocalHousehold({ householdId, currentTaskId: "current", reason: "  Stored exact reason  ", timestamp: new Date().toISOString() });
assert.equal(webDb.state.follow_up_tasks.find(row => row.id === "next").status, "cancelled");
repository.saveTask(nativeTask("next"));
repository.saveTaskBatch([nativeTask("new-web-task")]);
assert.equal(webDb.state.follow_up_tasks.find(row => row.id === "next").status, "cancelled");
assert.equal(webDb.state.follow_up_tasks.find(row => row.id === "new-web-task").status, "cancelled");
assert.equal(webDb.state.follow_up_tasks.find(row => row.id === "new-web-task").closed_reason, "  Stored exact reason  ");
assert.equal(webDb.state.follow_up_tasks.find(row => row.id === "current").status, "completed");
assert.equal(webDb.state.follow_up_tasks.find(row => row.id === "history").status, "completed");
console.log("Validated all terminal HHQ outcomes, offline evidence, native SQL cancellation, duplicate protection and task resurrection guards.");
