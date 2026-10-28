import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const sqlite = new DatabaseSync(":memory:");
const db = {
  runSync(sql, params = []) { return sqlite.prepare(sql).run(...params); },
  getAllSync(sql, params = []) { return sqlite.prepare(sql).all(...params); },
  getFirstSync(sql, params = []) { return sqlite.prepare(sql).get(...params); },
  async getAllAsync(sql, params = []) { return this.getAllSync(sql, params); },
  async getFirstAsync(sql, params = []) { return this.getFirstSync(sql, params); },
};
const require = stubOfflineDatabase(db, import.meta.url);
const { listTasksPage } = require("../modules/tasks/taskRepository.js");
require("../modules/tasks/taskSchema.js").initTaskDb();
sqlite.exec("CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT)");
const today = "2026-10-29";
const assignment = {
  task_type: "HHQ", protocol_visit_label: "baseline",
  generation_source: "field_worker_household_assignment",
  window_start: "2026-10-28", target_date: "2027-04-26", window_end: "2027-04-26",
  status: "planned", lifecycle_status: "planned",
};
const rows = [
  { ...assignment, id: "assigned" },
  { ...assignment, id: "reconciled", generation_source: "field_worker_assignment_sync_reconciliation" },
  { ...assignment, id: "draft" },
  { ...assignment, id: "last-day", window_end: today },
  { ...assignment, id: "expired", window_end: "2026-10-28" },
  { ...assignment, id: "not-started", window_start: "2026-10-30" },
  { ...assignment, id: "revisit", protocol_visit_label: "baseline-visit-2" },
  { ...assignment, id: "woman", task_type: "WQ" },
  { ...assignment, id: "follow-up", task_type: "PFF", target_date: "2026-11-02" },
  { ...assignment, id: "ordinary-today", generation_source: "event", target_date: today },
  { ...assignment, id: "completed", status: "completed", lifecycle_status: "completed" },
];
for (const row of rows) {
  const task = { task_key: row.id, household_id: "2-39-0002A-01", subject_id: "2-39-0002A-01", subject_type: "household", ...row };
  const columns = Object.keys(task);
  sqlite.prepare(`INSERT INTO follow_up_tasks (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
    .run(...Object.values(task));
}
const before = JSON.stringify(sqlite.prepare("SELECT * FROM follow_up_tasks ORDER BY id").all());
const activeDrafts = [{ form_code: "HHQ", task_id: "draft" }];
const expected = {
  current: ["assigned", "last-day", "ordinary-today", "reconciled"],
  upcoming: ["follow-up", "not-started", "revisit", "woman"],
  outdated: ["expired"],
  draft: ["draft"],
};
for (const mode of ["native SQLite", "web fallback"]) {
  if (mode === "web fallback") delete db.getAllAsync;
  for (const [stage, ids] of Object.entries(expected)) {
    const page = await listTasksPage({ stage, today, activeDrafts });
    assert.deepEqual(page.tasks.map((task) => task.id).sort(), ids, `${mode}: ${stage}`);
    assert.equal(page.total, ids.length, `${mode}: count must match visible rows`);
    const first = await listTasksPage({ stage, today, activeDrafts, limit: 1, offset: 0 });
    assert.equal(first.tasks.length, Math.min(ids.length, 1));
    assert.equal(first.total, ids.length);
  }
}
assert.equal(JSON.stringify(sqlite.prepare("SELECT * FROM follow_up_tasks ORDER BY id").all()), before,
  "Grouping must not change task dates, status or stored data");
sqlite.close();
console.log("Assigned BHQ grouping passed in native SQLite and web fallback; deadlines, drafts and other schedules preserved.");
