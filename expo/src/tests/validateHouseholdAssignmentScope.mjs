import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";
import fs from "node:fs";
import vm from "node:vm";

const sqlite = new DatabaseSync(":memory:");
const db = {
  runSync(sql, params = []) { return sqlite.prepare(sql).run(...params.map((value) => value ?? null)); },
  getAllSync(sql, params = []) { return sqlite.prepare(sql).all(...params.map((value) => value ?? null)); },
  getFirstSync(sql, params = []) { return sqlite.prepare(sql).get(...params.map((value) => value ?? null)); },
  async getAllAsync(sql, params = []) { return this.getAllSync(sql, params); },
  async getFirstAsync(sql, params = []) { return this.getFirstSync(sql, params); },
};
const require = stubOfflineDatabase(db, import.meta.url);
const { initTaskDb } = require("../modules/tasks/taskSchema.js");
initTaskDb();
const { getAssignedHouseholdIds, saveAssignedHouseholdIds } = require("../modules/sync/householdAssignmentScope.js");
const { saveTask, listTasks, listTasksPage, listOpenHhqHouseholdIds, getTask } = require("../modules/tasks/taskRepository.js");
const { listTaskWorklist } = require("../modules/worklist/taskWorklistRepository.js");
const user = { user_id: "worker", role: "field_worker" };
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify(user)]);
for (const [id, household_id, sync_status] of [["assigned", "HH1", "pending"], ["leaked", "HH2", "synced"]]) {
  saveTask({ id, household_id, task_key: id, subject_id: household_id, subject_type: "household", task_type: "HHQ", status: "open", lifecycle_status: "open", sync_status });
}
assert.equal(getAssignedHouseholdIds(), null, "older servers without scope retain compatibility");
assert.equal(listTaskWorklist().length, 2);
saveAssignedHouseholdIds(user, []);
assert.deepEqual(getAssignedHouseholdIds(), []);
assert.deepEqual(listTaskWorklist(), []);
assert.equal((await listTasksPage({})).total, 0);
assert.deepEqual(await listOpenHhqHouseholdIds(), []);
assert.equal(listTasks({}).length, 2, "raw task history/reconciliation is untouched");
assert.ok(getTask("leaked"), "scope hides caches without deleting task records");
saveAssignedHouseholdIds(user, ["HH1"]);
assert.deepEqual(listTaskWorklist().map((row) => row.id), ["assigned"]);
assert.equal((await listTasksPage({})).total, 1);
assert.deepEqual(await listOpenHhqHouseholdIds(), ["HH1"]);
assert.equal(getTask("assigned").sync_status, "pending", "offline generated work for an assigned household remains intact");
saveAssignedHouseholdIds(user, undefined);
assert.deepEqual(getAssignedHouseholdIds(), ["HH1"], "missing old-server scope does not overwrite confirmed assignments");
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify({ ...user, user_id: "other" })]);
assert.equal(getAssignedHouseholdIds(), null, "assignment cache belongs to its authenticated user");
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify({ ...user, role: "central_admin" })]);
assert.equal(getAssignedHouseholdIds(), null, "non-field-worker roles keep their server-authorized scope");
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify(user)]);
// The browser SQLite shim does not implement json_each: its display fallback
// must filter rows in JavaScript rather than relying on an ignored SQL clause.
const getAllAsync = db.getAllAsync;
delete db.getAllAsync;
assert.deepEqual(listTaskWorklist().map((row) => row.id), ["assigned"]);
assert.equal((await listTasksPage({})).total, 1);
db.getAllAsync = getAllAsync;

const Module = require("module");
const reactNativePath = require.resolve("react-native");
const nativeStub = new Module(reactNativePath);
nativeStub.filename = reactNativePath;
nativeStub.loaded = true;
nativeStub.exports = { Platform: { OS: "web" } };
Module._cache[reactNativePath] = nativeStub;
const storage = new Map([
  ["dynamic_households_v4", JSON.stringify([
    { household_id: "HH1", locality_code: "02" },
    { household_id: "HH2", locality_code: "02" },
  ])],
  ["dynamic_household_members_v4", JSON.stringify([
    { individual_id: "HH1-01", household_id: "HH1", member_name: "Assigned" },
    { individual_id: "HH2-01", household_id: "HH2", member_name: "Other" },
  ])],
]);
global.window = { localStorage: {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} };
const { listHouseholds, searchHouseholdMembers, getHousehold } = require("../modules/households/householdRepository.js");
assert.deepEqual((await listHouseholds()).map((row) => row.household_id), ["HH1"]);
assert.deepEqual(await listHouseholds({ householdIds: ["HH2"] }), []);
assert.deepEqual((await searchHouseholdMembers()).map((row) => row.household_id), ["HH1"]);
saveAssignedHouseholdIds(user, []);
assert.deepEqual(await listHouseholds(), []);
assert.deepEqual(await searchHouseholdMembers(), []);
assert.equal((await getHousehold("HH2")).household_id, "HH2", "raw evidence/history lookup is retained");
assert.equal(JSON.parse(storage.get("dynamic_households_v4")).length, 2, "hidden household caches remain intact");
delete global.window;
sqlite.close();

const syncSource = fs.readFileSync(new URL("../modules/sync/syncService.js", import.meta.url), "utf8");
const pullSource = syncSource.slice(syncSource.indexOf("export async function pullSync("), syncSource.indexOf("\nasync function pullMembersForHouseholds("))
  .replace("export async function", "async function");
const savedScopes = [];
let pages = [];
const context = vm.createContext({
  URLSearchParams, Date, Map, Set,
  console: { error() {} },
  API_BASE_URL: "http://test", CHUNK_SIZE: 500,
  authStore: { getToken: () => "token", getUser: () => user },
  getLastSyncAt: () => null, getLastFormResponseSyncAt: () => null,
  getMeta: () => null, getAssignedLocalities: () => ["02"],
  emitProgress() {}, shouldShowBatchProgress: () => false,
  setClockMetadata() {}, unwrapApiData: (data) => data,
  refreshProtocolForms: async () => ({ formsUpdated: 0 }),
  setMeta() {}, selectNextPullCursor: () => null,
  saveAssignedHouseholdIds: (...args) => savedScopes.push(args),
  fetch: async () => {
    const page = pages.shift();
    return { ok: Boolean(page), statusText: "Failed", json: async () => page };
  },
});
vm.runInContext(`${pullSource}\nglobalThis.pullSync = pullSync;`, context);
pages = [{ next_page_token: "page2", assigned_household_ids: ["HH1"] }, null];
await assert.rejects(context.pullSync(), /Pull sync failed/);
assert.equal(savedScopes.length, 0, "a failed later page must preserve the last complete assignment scope");
pages = [{ next_page_token: "page2", assigned_household_ids: [] }, { assigned_household_ids: [] }];
await context.pullSync();
assert.equal(savedScopes.length, 1, "persist authoritative assignments once after every page succeeds");
assert.deepEqual(savedScopes[0], [user, []]);
pages = [{}];
await context.pullSync();
assert.equal(savedScopes.length, 1, "an older server without the scope field must not erase the confirmed scope");
console.log("Household assignment visibility passed: zero scope, reassignment, offline work, and retained caches.");
