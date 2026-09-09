/**
 * Verifies getHouseholdsByIdsSync batches household lookups: dedupes and
 * drops nullish ids, issues one query per chunk of up to 500 ids, and
 * returns a Map keyed by household_id.
 */
import assert from "node:assert/strict";

import { createFakeSqliteDb } from "./helpers/createFakeSqliteDb.mjs";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

function householdsForIds(ids) {
  return ids.map((id) => ({ household_id: id, household_head_name: `Head ${id}` }));
}

const fakeDb = createFakeSqliteDb({
  getAllSyncResults(sql, params) {
    return householdsForIds(params);
  },
});
const require = stubOfflineDatabase(fakeDb, import.meta.url);

const { getHouseholdsByIdsSync } = require("../lib/householdSync.js");

// Dedupes and drops nullish ids; issues exactly one query with 2 placeholders.
const result = getHouseholdsByIdsSync(["a", "b", "a", null, undefined]);
const getAllCalls = fakeDb.calls.filter((call) => call.method === "getAllSync");
assert.equal(getAllCalls.length, 1);
assert.equal((getAllCalls[0].sql.match(/\?/g) || []).length, 2);
assert.deepEqual(getAllCalls[0].params, ["a", "b"]);
assert.ok(result instanceof Map);
assert.equal(result.size, 2);
assert.equal(result.get("a").household_id, "a");
assert.equal(result.get("b").household_id, "b");

// Empty input returns an empty Map with zero queries.
fakeDb.calls.length = 0;
const emptyResult = getHouseholdsByIdsSync([]);
assert.ok(emptyResult instanceof Map);
assert.equal(emptyResult.size, 0);
assert.equal(fakeDb.calls.filter((call) => call.method === "getAllSync").length, 0);

// Chunks large id lists into batches of 500.
fakeDb.calls.length = 0;
const manyIds = Array.from({ length: 1001 }, (_, index) => `id-${index}`);
const chunkedResult = getHouseholdsByIdsSync(manyIds);
const chunkedCalls = fakeDb.calls.filter((call) => call.method === "getAllSync");
assert.equal(chunkedCalls.length, 3);
assert.equal(chunkedCalls[0].params.length, 500);
assert.equal(chunkedCalls[1].params.length, 500);
assert.equal(chunkedCalls[2].params.length, 1);
assert.equal(chunkedResult.size, 1001);
assert.equal(chunkedResult.get("id-0").household_id, "id-0");
assert.equal(chunkedResult.get("id-1000").household_id, "id-1000");

console.log("Household sync batch validation passed");
