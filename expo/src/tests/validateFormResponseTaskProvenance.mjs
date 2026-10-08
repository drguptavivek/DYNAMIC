import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE form_responses (
  id TEXT PRIMARY KEY, task_id TEXT, form_code TEXT NOT NULL, form_version TEXT,
  answers_json TEXT NOT NULL, submitted_at TEXT, sync_status TEXT, device_id TEXT, created_at TEXT
)`);
let activeDb = {
  runSync(sql, params = []) { return sqlite.prepare(sql).run(...params.map((value) => value ?? null)); },
  getAllSync(sql, params = []) { return sqlite.prepare(sql).all(...params.map((value) => value ?? null)); },
  getFirstSync(sql, params = []) { return sqlite.prepare(sql).get(...params.map((value) => value ?? null)) || null; },
};
const db = {
  runSync: (...args) => activeDb.runSync(...args),
  getAllSync: (...args) => activeDb.getAllSync(...args),
  getFirstSync: (...args) => activeDb.getFirstSync(...args),
};
const require = stubOfflineDatabase(db, import.meta.url);
const { saveTask, saveFormResponse, getFormResponseById, getTask, getGeneratedTaskKeys,
  recoverFormResponseTaskKey, retryMissingHhqResponses, retryHhqTaskPlanErrors, saveSyncedFormResponsesBatch } =
  require("../modules/tasks/taskRepository.js");

function exercise() {
  const task = { id: "old-local-id", task_key: "household|woman|WQ|baseline",
    household_id: "household", subject_type: "person", subject_id: "woman", task_type: "WQ",
    source_form_response_id: "baseline-response" };
  saveTask(task);
  saveFormResponse({ id: "wq-response", task_id: task.id, task_key: task.task_key,
    form_code: "WQ", form_version: "test", answers_json: { consent: 1 }, device_id: "device" });
  assert.equal(getTask(task.id).status, "completed");
  assert.equal(getTask(task.id).source_form_response_id, "baseline-response");
  assert.deepEqual(getGeneratedTaskKeys("baseline-response"), [task.task_key]);
  // Pull replaces the provisional task ID with the authoritative server ID.
  saveTask({ ...task, id: "server-id", sync_status: "synced" });
  assert.equal(getTask(task.id), null);
  const response = getFormResponseById("wq-response");
  assert.equal(response.task_key, task.task_key);
  assert.equal(recoverFormResponseTaskKey(response), task.task_key);
  assert.deepEqual(response.answers_json, { consent: 1 });
  saveSyncedFormResponsesBatch([{ ...response, task_id: "server-id", task_key: null }]);
  assert.equal(getFormResponseById(response.id).task_key, task.task_key,
    "a pulled server response without a task key must retain the original finalized key");

  db.runSync("INSERT INTO domain_events_outbox (id, event_type, payload, created_at, sync_status) VALUES (?, ?, ?, ?, ?)",
    ["event-legacy", "woman_baseline_recorded", JSON.stringify({ form_response_id: "legacy-response",
      task_key: task.task_key }), "2026-10-08", "upload_error"]);
  assert.equal(recoverFormResponseTaskKey({ id: "legacy-response" }), task.task_key);
  assert.equal(recoverFormResponseTaskKey({ id: "different-response" }), null,
    "an unrelated task must never be guessed for a finalized response");

  const waitingMessage = "BWQ is waiting for its household baseline to sync; sync the BHQ first and retry";
  for (const [id, form_code, sync_error] of [
    ["waiting-wq", "WQ", waitingMessage],
    ["invalid-wq", "WQ", "Server classified this form as invalid_rejected"],
    ["plan-hhq", "HHQ", "Generated task keys do not match server workflow"],
    ["invalid-hhq", "HHQ", "Invalid answers"],
  ]) {
    saveFormResponse({ id, form_code, form_version: "test", sync_status: "upload_error", sync_error,
      answers_json: { retained: id } });
  }
  assert.equal(retryMissingHhqResponses(), 1);
  assert.equal(retryHhqTaskPlanErrors(), 1);
  assert.equal(retryMissingHhqResponses(), 0);
  assert.equal(retryHhqTaskPlanErrors(), 0);
  for (const id of ["waiting-wq", "plan-hhq"]) {
    assert.equal(getFormResponseById(id).sync_status, "pending");
    assert.deepEqual(getFormResponseById(id).answers_json, { retained: id });
  }
  for (const id of ["invalid-wq", "invalid-hhq"]) assert.equal(getFormResponseById(id).sync_status, "upload_error");
}

exercise();
assert.ok(sqlite.prepare("PRAGMA table_info(form_responses)").all().some((column) => column.name === "task_key"),
  "the old native database receives the additive task_key column");
sqlite.close();

const storage = new Map();
globalThis.window = { localStorage: {
  getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
} };
const { openDatabaseSync } = await import("../shims/expo-sqlite.web.js");
activeDb = openDatabaseSync();
exercise();
window.localStorage.setItem("dynamic_questionnaire_submissions_v1", JSON.stringify([
  { submission_id: "browser-legacy", task_key: "original-browser-task" },
]));
assert.equal(recoverFormResponseTaskKey({ id: "browser-legacy" }), "original-browser-task");
console.log("Validated native/web finalized task provenance and targeted recovery.");
