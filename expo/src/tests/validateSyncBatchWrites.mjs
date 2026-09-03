/**
 * Verifies the batch write helpers used by pullSync/pushSync each run as a
 * single transaction (one BEGIN + one COMMIT wrapping the row statements,
 * ROLLBACK on failure) instead of one autocommit per row, and that
 * getTasksByIdentities chunks and dedupes identities instead of reading the
 * whole follow_up_tasks table.
 */
import assert from "node:assert/strict";

import { createFakeSqliteDb } from "./helpers/createFakeSqliteDb.mjs";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

function transactionSpan(calls) {
  const beginIndex = calls.findIndex((call) => call.method === "runSync" && call.sql === "BEGIN TRANSACTION");
  const commitIndex = calls.findIndex((call) => call.method === "runSync" && call.sql === "COMMIT");
  const rollbackIndex = calls.findIndex((call) => call.method === "runSync" && call.sql === "ROLLBACK");
  return { beginIndex, commitIndex, rollbackIndex };
}

function countMatching(calls, predicate) {
  return calls.filter(predicate).length;
}

// taskSchema.js/taskRepository.js get cached by Node's CJS require() after the
// first load, which would otherwise pin every block below to whichever
// fakeDb was stubbed first. Force a fresh require of both per block so each
// block's fakeDb is the one actually wired through getDb().
function loadTaskRepository(fakeDb) {
  const require = stubOfflineDatabase(fakeDb, import.meta.url);
  for (const relativePath of ["../modules/tasks/taskSchema.js", "../modules/tasks/taskRepository.js"]) {
    const resolved = require.resolve(relativePath);
    delete require.cache[resolved];
  }
  return require("../modules/tasks/taskRepository.js");
}

{
  // saveEligibleWomenBatch wraps rows in exactly one BEGIN/COMMIT.
  const fakeDb = createFakeSqliteDb();
  const { saveEligibleWomenBatch } = loadTaskRepository(fakeDb);

  saveEligibleWomenBatch([
    { woman_id: "woman-1", household_member_id: "member-1", household_id: "hh-1" },
    { woman_id: "woman-2", household_member_id: "member-2", household_id: "hh-1" },
    { woman_id: "woman-3", household_member_id: "member-3", household_id: "hh-1" },
  ]);

  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "BEGIN TRANSACTION"),
    1,
  );
  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "COMMIT"),
    1,
  );
  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "ROLLBACK"),
    0,
  );
  const { beginIndex, commitIndex } = transactionSpan(fakeDb.calls);
  const insertCalls = countMatching(
    fakeDb.calls,
    (call) => call.method === "runSync" && call.sql.includes("INSERT OR REPLACE INTO eligible_women"),
  );
  assert.equal(insertCalls, 3);
  assert.ok(beginIndex >= 0 && beginIndex < commitIndex && commitIndex === fakeDb.calls.length - 1);
  const insertIndexes = fakeDb.calls
    .map((call, index) => ({ call, index }))
    .filter(({ call }) => call.method === "runSync" && call.sql.includes("INSERT OR REPLACE INTO eligible_women"))
    .map(({ index }) => index);
  assert.ok(insertIndexes.every((index) => index > beginIndex && index < commitIndex));
}

{
  // savePregnancyBatch wraps rows in exactly one BEGIN/COMMIT.
  const fakeDb = createFakeSqliteDb();
  const { savePregnancyBatch } = loadTaskRepository(fakeDb);

  savePregnancyBatch([
    { pregnancy_id: "preg-1", woman_id: "woman-1", household_id: "hh-1" },
    { pregnancy_id: "preg-2", woman_id: "woman-2", household_id: "hh-1" },
  ]);

  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "BEGIN TRANSACTION"),
    1,
  );
  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "COMMIT"),
    1,
  );
  const insertCalls = countMatching(
    fakeDb.calls,
    (call) => call.method === "runSync" && call.sql.includes("INSERT OR REPLACE INTO pregnancies"),
  );
  assert.equal(insertCalls, 2);
}

{
  // A row-save failure rolls back the whole batch, not just that row.
  const fakeDb = createFakeSqliteDb();
  fakeDb.runSync = (function (original) {
    return function runSync(sql, params = []) {
      if (sql.includes("INSERT OR REPLACE INTO eligible_women") && params[0] === "woman-bad") {
        fakeDb.calls.push({ method: "runSync", sql, params });
        throw new Error("simulated write failure");
      }
      return original(sql, params);
    };
  })(fakeDb.runSync.bind(fakeDb));
  const { saveEligibleWomenBatch } = loadTaskRepository(fakeDb);

  assert.throws(() =>
    saveEligibleWomenBatch([
      { woman_id: "woman-good", household_member_id: "member-1", household_id: "hh-1" },
      { woman_id: "woman-bad", household_member_id: "member-2", household_id: "hh-1" },
    ]),
  );
  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "ROLLBACK"),
    1,
  );
  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "COMMIT"),
    0,
  );
}

{
  // markResponsesSyncedBatch wraps updates in exactly one BEGIN/COMMIT.
  const fakeDb = createFakeSqliteDb();
  const { markResponsesSyncedBatch } = loadTaskRepository(fakeDb);

  markResponsesSyncedBatch(["resp-1", "resp-2", "resp-3"]);

  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "BEGIN TRANSACTION"),
    1,
  );
  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "COMMIT"),
    1,
  );
  const updateCalls = countMatching(
    fakeDb.calls,
    (call) => call.method === "runSync" && call.sql.includes("sync_status = 'synced'"),
  );
  assert.equal(updateCalls, 3);
}

{
  // Empty input issues no transaction at all.
  const fakeDb = createFakeSqliteDb();
  const { markResponsesSyncedBatch } = loadTaskRepository(fakeDb);
  markResponsesSyncedBatch([]);
  assert.equal(fakeDb.calls.length, 0);
}

{
  // markResponsesUploadErrorBatch wraps updates in exactly one BEGIN/COMMIT.
  const fakeDb = createFakeSqliteDb();
  const { markResponsesUploadErrorBatch } = loadTaskRepository(fakeDb);

  markResponsesUploadErrorBatch([
    { id: "resp-1", message: "duplicate" },
    { id: "resp-2", message: "invalid" },
  ]);

  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "BEGIN TRANSACTION"),
    1,
  );
  assert.equal(
    countMatching(fakeDb.calls, (call) => call.method === "runSync" && call.sql === "COMMIT"),
    1,
  );
  const updateCalls = countMatching(
    fakeDb.calls,
    (call) => call.method === "runSync" && call.sql.includes("sync_status = 'upload_error'"),
  );
  assert.equal(updateCalls, 2);
  assert.deepEqual(
    fakeDb.calls
      .filter((call) => call.method === "runSync" && call.sql.includes("sync_status = 'upload_error'"))
      .map((call) => call.params[0]),
    ["duplicate", "invalid"],
  );
}

{
  // getTasksByIdentities dedupes, drops nullish identities, and issues one
  // OR'd query per chunk of 400 (each identity is bound twice, so 800
  // variables per query — under the 999 cap of older SQLite builds).
  function tasksForIdentities(sql, params) {
    // The query params array is [chunk, chunk] (task_key IN then id IN).
    const half = params.slice(0, params.length / 2);
    return half.map((identity) => ({ id: identity, task_key: identity }));
  }
  const fakeDb = createFakeSqliteDb({ getAllSyncResults: tasksForIdentities });
  const { getTasksByIdentities } = loadTaskRepository(fakeDb);

  const result = getTasksByIdentities(["a", "b", "a", null, undefined, ""]);
  const getAllCalls = fakeDb.calls.filter((call) => call.method === "getAllSync");
  assert.equal(getAllCalls.length, 1);
  assert.ok(getAllCalls[0].sql.includes("task_key IN"));
  assert.ok(getAllCalls[0].sql.includes("OR id IN"));
  assert.deepEqual(getAllCalls[0].params, ["a", "b", "a", "b"]);
  assert.equal(result.length, 2);

  fakeDb.calls.length = 0;
  const manyIdentities = Array.from({ length: 1001 }, (_, index) => `id-${index}`);
  getTasksByIdentities(manyIdentities);
  const chunkedCalls = fakeDb.calls.filter((call) => call.method === "getAllSync");
  assert.equal(chunkedCalls.length, 3);
  assert.equal(chunkedCalls[0].params.length, 800);
  assert.equal(chunkedCalls[1].params.length, 800);
  assert.equal(chunkedCalls[2].params.length, 402);

  fakeDb.calls.length = 0;
  const emptyResult = getTasksByIdentities([]);
  assert.deepEqual(emptyResult, []);
  assert.equal(fakeDb.calls.filter((call) => call.method === "getAllSync").length, 0);
}

console.log("Sync batch write validation passed");
