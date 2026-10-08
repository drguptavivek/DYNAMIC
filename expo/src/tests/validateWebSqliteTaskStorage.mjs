import assert from "node:assert/strict";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
  },
};

const { openDatabaseSync } = await import("../shims/expo-sqlite.web.js");

const db = openDatabaseSync();
const insertSql = `INSERT OR REPLACE INTO follow_up_tasks
  (id, task_key, household_id, subject_type, subject_id, subject_name, task_type,
   protocol_visit_label, target_date, window_start, window_end, status,
   lifecycle_status, failed_attempt_count, max_failed_attempts, requires_final_close_reason,
   closed_reason, closed_at,
   form_availability, disabled_reason, assigned_locality_code, rules_version,
   generation_source, source_event_id, source_form_response_id, sync_status, server_commit_sequence,
   created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function taskParams(index, overrides = {}) {
  const household = `2-02-000${index}-0${index}`;
  const task = {
    id: `task-${index}`,
    task_key: `${household}:household:${household}:HHQ:baseline:2026-09-01:v1`,
    household_id: household,
    subject_type: "household",
    subject_id: household,
    subject_name: household,
    task_type: "HHQ",
    protocol_visit_label: "baseline",
    target_date: "2026-09-01",
    window_start: "2026-09-01",
    window_end: "2026-09-30",
    status: "open",
    lifecycle_status: "planned",
    failed_attempt_count: 0,
    max_failed_attempts: 3,
    requires_final_close_reason: 0,
    closed_reason: null,
    closed_at: null,
    form_availability: "available",
    disabled_reason: null,
    assigned_locality_code: "02",
    rules_version: "v1",
    generation_source: "field_worker_household_assignment",
    source_event_id: null,
    source_form_response_id: null,
    sync_status: "synced",
    server_commit_sequence: index,
    created_at: "2026-08-04T00:00:00.000Z",
    updated_at: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };

  return [
    task.id,
    task.task_key,
    task.household_id,
    task.subject_type,
    task.subject_id,
    task.subject_name,
    task.task_type,
    task.protocol_visit_label,
    task.target_date,
    task.window_start,
    task.window_end,
    task.status,
    task.lifecycle_status,
    task.failed_attempt_count,
    task.max_failed_attempts,
    task.requires_final_close_reason,
    task.closed_reason,
    task.closed_at,
    task.form_availability,
    task.disabled_reason,
    task.assigned_locality_code,
    task.rules_version,
    task.generation_source,
    task.source_event_id,
    task.source_form_response_id,
    task.sync_status,
    task.server_commit_sequence,
    task.created_at,
    task.updated_at,
  ];
}

for (let index = 2; index <= 5; index += 1) {
  db.runSync(insertSql, taskParams(index));
}

const syncedRows = db.getAllSync("SELECT * FROM follow_up_tasks WHERE 1=1 AND status = ? ORDER BY target_date ASC", [
  "open",
]);
assert.equal(syncedRows.length, 4);
assert.deepEqual(
  syncedRows.map((task) => task.household_id).sort(),
  ["2-02-0002-02", "2-02-0003-03", "2-02-0004-04", "2-02-0005-05"],
);

for (let index = 6; index <= 7; index += 1) {
  db.runSync(insertSql, taskParams(index, { task_key: null }));
}

const rowsAfterMissingKeys = db.getAllSync(
  "SELECT * FROM follow_up_tasks WHERE 1=1 AND status = ? ORDER BY target_date ASC",
  ["open"],
);
assert.equal(rowsAfterMissingKeys.length, 6);

// Exercise both production persistence paths with the real web storage shim.
const taskWrites = [];
const schemaStatements = [];
const runSync = db.runSync.bind(db);
db.runSync = (sql, params = []) => {
  schemaStatements.push(sql);
  if (/INSERT OR REPLACE INTO follow_up_tasks/i.test(sql)) {
    const columns = sql.match(/follow_up_tasks\s*\(([^)]+)\)/i)[1].split(",").map((column) => column.trim());
    assert.equal(columns.length, params.length, "native task columns and bindings must match");
    assert.equal((sql.match(/\?/g) || []).length, params.length, "native task placeholders must match bindings");
    taskWrites.push(Object.fromEntries(columns.map((column, index) => [column, params[index]])));
  }
  return runSync(sql, params);
};
const require = stubOfflineDatabase(db, import.meta.url);
const { saveTask, saveTaskBatch, getTask, saveFormResponse, getGeneratedTaskKeys,
  retryHhqTaskPlanErrors } = require("../modules/tasks/taskRepository.js");
const plannedPff = {
  id: "pff-round-1",
  task_key: "pregnancy-1|PFF|M1",
  household_id: "2-02-0002-02",
  subject_type: "pregnancy",
  subject_id: "pregnancy-1",
  woman_id: "woman-1",
  pregnancy_id: "pregnancy-1",
  task_type: "PFF",
  protocol_visit_label: "PFF-M1",
  default_expected_mode: "face_to_face",
  target_date: "2026-10-01",
  pff_pef_snapshot_json: JSON.stringify({ pef_woman_hh_member_id: "woman-1" }),
};
saveTask(plannedPff);
saveTaskBatch([{ ...plannedPff, id: "pff-round-2", task_key: "pregnancy-1|PFF|M2",
  protocol_visit_label: "PFF-M2", default_expected_mode: "telephonic" }]);
assert.deepEqual(taskWrites.map((task) => task.default_expected_mode), ["face_to_face", "telephonic"]);
assert.ok(schemaStatements.some((sql) => /CREATE TABLE IF NOT EXISTS follow_up_tasks/.test(sql)
  && /default_expected_mode TEXT/.test(sql)), "new native databases store the planned mode");
assert.ok(schemaStatements.includes("ALTER TABLE follow_up_tasks ADD COLUMN default_expected_mode TEXT"),
  "existing native databases get an additive planned mode column");
for (const [id, mode] of [["pff-round-1", "face_to_face"], ["pff-round-2", "telephonic"]]) {
  const storedTask = getTask(id);
  assert.equal(storedTask.default_expected_mode, mode);
  assert.equal(storedTask.task_type, "PFF");
  assert.equal(storedTask.woman_id, plannedPff.woman_id);
  assert.equal(storedTask.pregnancy_id, plannedPff.pregnancy_id);
  assert.equal(storedTask.pff_pef_snapshot_json, plannedPff.pff_pef_snapshot_json);
}
const reloadedDb = openDatabaseSync();
assert.equal(reloadedDb.getFirstSync("SELECT * FROM follow_up_tasks WHERE id = ?", ["pff-round-2"])
  .default_expected_mode, "telephonic");

saveTask({ ...plannedPff, id: "generated-wq", task_key: "hhq-generated-wq", task_type: "WQ",
  source_form_response_id: "finalized-hhq" });
saveFormResponse({ id: "finalized-wq", task_id: "generated-wq", form_code: "WQ", form_version: "test",
  answers_json: { wq_pregnant: 2 } });
assert.equal(getTask("generated-wq").status, "completed");
assert.equal(getTask("generated-wq").source_form_response_id, "finalized-hhq");
assert.deepEqual(getGeneratedTaskKeys("finalized-hhq"), ["hhq-generated-wq"]);
assert.deepEqual(getGeneratedTaskKeys("finalized-wq", "generated-wq", "hhq-generated-wq"), []);

for (const [id, form_code, sync_status, sync_error] of [
  ["retry-hhq", "HHQ", "upload_error", "Generated task keys do not match server workflow"],
  ["invalid-wq", "WQ", "upload_error", "Server classified this form as invalid_rejected"],
  ["other-hhq", "HHQ", "upload_error", "Invalid answers"],
  ["synced-hhq", "HHQ", "synced", "Generated task keys do not match server workflow"],
]) {
  saveFormResponse({ id, form_code, form_version: "test", sync_status, sync_error,
    answers_json: { retained: id }, server_response_status: "invalid_rejected" });
}
assert.equal(retryHhqTaskPlanErrors(), 1);
assert.equal(retryHhqTaskPlanErrors(), 0, "a recovered form is queued only once");
assert.equal(db.getFirstSync("SELECT * FROM form_responses WHERE id = ?", ["retry-hhq"]).sync_status, "pending");
assert.equal(db.getFirstSync("SELECT * FROM form_responses WHERE id = ?", ["retry-hhq"]).answers_json,
  JSON.stringify({ retained: "retry-hhq" }));
for (const id of ["invalid-wq", "other-hhq"]) {
  assert.equal(db.getFirstSync("SELECT * FROM form_responses WHERE id = ?", [id]).sync_status, "upload_error");
}
assert.equal(db.getFirstSync("SELECT * FROM form_responses WHERE id = ?", ["synced-hhq"]).sync_status, "synced");

console.log("Web SQLite task storage validation passed");
