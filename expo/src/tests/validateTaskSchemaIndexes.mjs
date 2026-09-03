/**
 * Verifies initTaskDb() creates the hot-path indexes for follow_up_tasks,
 * form_responses, and task_attempts, and that they are issued after the
 * ALTER TABLE migration loop (so they only run once the columns they cover
 * are guaranteed to exist on upgraded local databases).
 */
import assert from "node:assert/strict";

import { createFakeSqliteDb } from "./helpers/createFakeSqliteDb.mjs";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const fakeDb = createFakeSqliteDb();
const require = stubOfflineDatabase(fakeDb, import.meta.url);

const { initTaskDb } = require("../modules/tasks/taskSchema.js");

initTaskDb();

const runSyncCalls = fakeDb.calls.filter((call) => call.method === "runSync");
const normalize = (sql) => sql.replace(/\s+/g, " ").trim();

const alterStatements = runSyncCalls.filter((call) => /^\s*ALTER TABLE/i.test(call.sql));
assert.ok(alterStatements.length > 0, "expected ALTER TABLE migration statements to run");
const lastAlterIndex = runSyncCalls.lastIndexOf(alterStatements[alterStatements.length - 1]);

const expectedIndexes = [
  { table: "follow_up_tasks", columns: ["status", "target_date"] },
  { table: "follow_up_tasks", columns: ["assigned_locality_code", "status"] },
  { table: "follow_up_tasks", columns: ["sync_status"] },
  { table: "follow_up_tasks", columns: ["household_id"] },
  { table: "form_responses", columns: ["sync_status", "submitted_at"] },
  { table: "form_responses", columns: ["household_id"] },
  { table: "task_attempts", columns: ["task_id"] },
  { table: "questionnaire_drafts", columns: ["draft_status", "household_id"] },
  { table: "questionnaire_drafts", columns: ["draft_status", "woman_id"] },
  { table: "questionnaire_drafts", columns: ["draft_status", "site_id", "locality_code"] },
];

for (const { table, columns } of expectedIndexes) {
  const columnPattern = columns.join("\\s*,\\s*");
  const indexRegex = new RegExp(
    `CREATE INDEX IF NOT EXISTS\\s+\\S+\\s+ON\\s+${table}\\s*\\(\\s*${columnPattern}\\s*\\)`,
    "i"
  );

  const matchIndex = runSyncCalls.findIndex((call) => indexRegex.test(normalize(call.sql)));
  assert.ok(
    matchIndex !== -1,
    `expected a CREATE INDEX statement for ${table}(${columns.join(", ")})`
  );
  assert.ok(
    matchIndex > lastAlterIndex,
    `expected the index on ${table}(${columns.join(", ")}) to be created after the ALTER TABLE migration loop`
  );
}

// Calling initTaskDb() again must not re-run schema statements (schemaInitialized guard).
const callCountAfterFirstInit = fakeDb.calls.length;
initTaskDb();
assert.equal(fakeDb.calls.length, callCountAfterFirstInit);

console.log("Task schema index validation passed");
