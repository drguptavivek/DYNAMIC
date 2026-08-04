import assert from "node:assert/strict";

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

console.log("Web SQLite task storage validation passed");
