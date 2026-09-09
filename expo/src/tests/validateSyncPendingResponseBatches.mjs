/**
 * Regression guards for the sync/history database hot path. Uploads must
 * consume 100-row response batches, include domain events only once, and
 * refuse a server response that classifies none of the rows. History reads
 * must select metadata only (answers_json is intentionally absent).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const taskRepositorySource = fs.readFileSync(
  path.resolve(testRoot, "../modules/tasks/taskRepository.js"),
  "utf8",
);
const syncServiceSource = fs.readFileSync(
  path.resolve(testRoot, "../modules/sync/syncService.js"),
  "utf8",
);
const historySource = fs.readFileSync(
  path.resolve(testRoot, "../modules/questionnaires/FormSubmissionListScreen.js"),
  "utf8",
);

assert.match(taskRepositorySource, /const FORM_RESPONSE_BATCH_SIZE = 100/);
assert.match(taskRepositorySource, /SELECT COUNT\(\*\) AS total FROM form_responses/);
assert.match(taskRepositorySource, /SELECT \* FROM form_responses[\s\S]+LIMIT \?/);
assert.match(taskRepositorySource, /SELECT \$\{FORM_RESPONSE_DISPLAY_SELECT\} FROM form_responses/);
assert.match(taskRepositorySource, /const FORM_RESPONSE_DISPLAY_COLUMNS = \[/);
assert.doesNotMatch(taskRepositorySource.match(/const FORM_RESPONSE_DISPLAY_COLUMNS = \[[\s\S]*?\];/)?.[0] || "", /answers_json/);
assert.match(historySource, /listFormResponseSummaries/);
assert.doesNotMatch(historySource, /listFormResponses\(/);

// The production loop requests a fresh bounded page after each response is
// classified, so 205 pending rows become exactly three server requests. The
// source assertions keep the invariant coupled to the implementation, while
// this small model makes the expected request/event ownership explicit.
const pendingIds = Array.from({ length: 205 }, (_, index) => `response-${index}`);
const batches = [];
for (let offset = 0; offset < pendingIds.length; offset += 100) {
  batches.push(pendingIds.slice(offset, offset + 100));
}
assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 5]);
assert.equal(batches.length, 3);
assert.match(syncServiceSource, /const PUSH_FORM_RESPONSE_BATCH_SIZE = 100/);
assert.match(syncServiceSource, /while \(true\) \{[\s\S]+getPendingResponseBatch\(PUSH_FORM_RESPONSE_BATCH_SIZE\)/);
assert.match(syncServiceSource, /domainEvents: eventsSent \? \[\] : pendingEvents/);
assert.match(syncServiceSource, /Push sync made no progress/);

// Exercise the async repository path and ensure the query stays bounded and
// history rows do not carry answers_json into JavaScript.
const calls = [];
const fakeDb = {
  calls,
  runSync(sql, params = []) {
    calls.push({ method: "runSync", sql, params });
    return { changes: 0 };
  },
  getFirstSync(sql, params = []) {
    calls.push({ method: "getFirstSync", sql, params });
    return { value: null };
  },
  async getFirstAsync(sql, params = []) {
    calls.push({ method: "getFirstAsync", sql, params });
    return { total: 205 };
  },
  async getAllAsync(sql, params = []) {
    calls.push({ method: "getAllAsync", sql, params });
    if (/LIMIT \?/i.test(sql)) {
      return pendingIds.slice(0, Number(params[0])).map((id) => ({ id, answers_json: "{}" }));
    }
    return [{
      id: "response-1",
      form_code: "HHQ",
      household_id: "1-02-0042-03",
      submitted_at: "2026-09-04T00:00:00.000Z",
      sync_status: "synced",
    }];
  },
};

const require = stubOfflineDatabase(fakeDb, import.meta.url);
for (const relativePath of ["../modules/tasks/taskSchema.js", "../modules/tasks/taskRepository.js"]) {
  delete require.cache[require.resolve(relativePath)];
}
const { countPendingResponses, getPendingResponseBatch, listFormResponseSummaries } =
  require("../modules/tasks/taskRepository.js");

assert.equal(await countPendingResponses(), 205);
const responseBatch = await getPendingResponseBatch(1000);
assert.equal(responseBatch.length, 100);
const batchCall = calls.find((call) => call.method === "getAllAsync" && /LIMIT \?/i.test(call.sql));
assert.deepEqual(batchCall.params, [100]);
const summaries = await listFormResponseSummaries({ sync_status: "synced" });
assert.equal(summaries.length, 1);
assert.equal(Object.hasOwn(summaries[0], "answers_json"), false);
const summaryCall = calls.find((call) => call.method === "getAllAsync" && /SELECT id, form_code/i.test(call.sql));
assert.ok(summaryCall, "history should use the metadata-only projection");
assert.doesNotMatch(summaryCall.sql, /answers_json/);

console.log("Sync pending response batching validation passed");
