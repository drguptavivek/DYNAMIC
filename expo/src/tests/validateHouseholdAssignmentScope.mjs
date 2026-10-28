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
const user = { user_id: "worker", role: "field_worker", site_id: 2 };
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify(user)]);
for (const [id, household_id, sync_status] of [["assigned", "2-39-0002-01", "pending"], ["leaked", "2-39-0002-02", "synced"]]) {
  saveTask({ id, household_id, task_key: id, subject_id: household_id, subject_type: "household", task_type: "HHQ", status: "open", lifecycle_status: "open", sync_status });
}
assert.deepEqual(getAssignedHouseholdIds(), [], "a field worker without confirmed assignments must not see cached households");
assert.deepEqual(listTaskWorklist(), []);
saveAssignedHouseholdIds(user, []);
assert.deepEqual(getAssignedHouseholdIds(), []);
assert.deepEqual(listTaskWorklist(), []);
assert.equal((await listTasksPage({})).total, 0);
assert.deepEqual(await listOpenHhqHouseholdIds(), []);
assert.equal(listTasks({}).length, 2, "raw task history/reconciliation is untouched");
assert.ok(getTask("leaked"), "scope hides caches without deleting task records");
saveAssignedHouseholdIds(user, ["2-39-0002-01"]);
assert.deepEqual(listTaskWorklist().map((row) => row.id), ["assigned"]);
assert.equal((await listTasksPage({})).total, 1);
assert.deepEqual(await listOpenHhqHouseholdIds(), ["2-39-0002-01"]);
assert.equal(getTask("assigned").sync_status, "pending", "offline generated work for an assigned household remains intact");
saveAssignedHouseholdIds(user, undefined);
assert.deepEqual(getAssignedHouseholdIds(), ["2-39-0002-01"], "missing old-server scope does not overwrite confirmed assignments");
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify({ ...user, user_id: "other" })]);
assert.deepEqual(getAssignedHouseholdIds(), [], "another user must not inherit the cached assignment scope");
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify(user)]);
saveAssignedHouseholdIds(user, null);
assert.deepEqual(getAssignedHouseholdIds(), [], "an invalid field-worker scope must fail closed");
for (const scope of ["not JSON", JSON.stringify({ userId: user.user_id, householdIds: "not an array" })]) {
  db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["assigned_household_scope", scope]);
  assert.deepEqual(getAssignedHouseholdIds(), [], "malformed assignment metadata must not expose cached work");
}
saveAssignedHouseholdIds(user, ["2-39-0002-01"]);
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify({ ...user, site_id: null })]);
assert.deepEqual(getAssignedHouseholdIds(), [], "a worker without a current site has no active household scope");
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify({ ...user, site_id: true })]);
assert.deepEqual(getAssignedHouseholdIds(), [], "a malformed site cannot select another site's cached assignments");
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", "not JSON"]);
assert.deepEqual(getAssignedHouseholdIds(), [], "corrupt identity metadata fails closed");
assert.deepEqual(getAssignedHouseholdIds({ getFirstSync() { throw new Error("unavailable"); } }), [], "scope read failures fail closed");
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify(user)]);
saveAssignedHouseholdIds(user, ["2-39-0002-01", "1-01-0004-04", null, {}, "2-invalid"]);
assert.deepEqual(getAssignedHouseholdIds(), ["2-39-0002-01"], "only canonical household IDs in the current site are actionable");

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
    { household_id: "2-39-0002-01", locality_code: "39" },
    { household_id: "2-39-0002-02", locality_code: "39" },
  ])],
  ["dynamic_household_members_v4", JSON.stringify([
    { individual_id: "2-39-0002-01-01", household_id: "2-39-0002-01", member_name: "Assigned" },
    { individual_id: "2-39-0002-02-01", household_id: "2-39-0002-02", member_name: "Other" },
  ])],
]);
global.window = { localStorage: {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} };
const { listHouseholds, searchHouseholdMembers, getHousehold } = require("../modules/households/householdRepository.js");
assert.deepEqual((await listHouseholds()).map((row) => row.household_id), ["2-39-0002-01"]);
assert.deepEqual(await listHouseholds({ householdIds: ["2-39-0002-02"] }), []);
assert.deepEqual((await searchHouseholdMembers()).map((row) => row.household_id), ["2-39-0002-01"]);
saveAssignedHouseholdIds(user, []);
assert.deepEqual(await listHouseholds(), []);
assert.deepEqual(await searchHouseholdMembers(), []);
assert.equal((await getHousehold("2-39-0002-02")).household_id, "2-39-0002-02", "raw evidence/history lookup is retained");
assert.equal(JSON.parse(storage.get("dynamic_households_v4")).length, 2, "hidden household caches remain intact");
// Reproduce the same worker moving from Bareilly to Ballabhgarh. Historical
// allocations/cache rows remain stored, but only current-site work is actionable.
const oldHouseholdId = "1-01-0004-04";
const currentHouseholdIds = ["2-39-0002-01", "2-39-0002-02"];
for (const task of [
  { id: "old-site", household_id: oldHouseholdId, task_type: "HHQ", subject_type: "household", subject_id: oldHouseholdId },
  { id: "local-bwq", household_id: currentHouseholdIds[0], task_type: "WQ", subject_type: "person", subject_id: `${currentHouseholdIds[0]}-02` },
  { id: "local-pef", household_id: currentHouseholdIds[1], task_type: "PEF", subject_type: "pregnancy", subject_id: `${currentHouseholdIds[1]}-02-1` },
]) saveTask({ ...task, task_key: task.id, status: "open", lifecycle_status: "open", sync_status: "pending" });
db.runSync("INSERT INTO form_responses (id, form_code, household_id, answers_json, sync_status) VALUES (?, ?, ?, ?, ?)",
  ["old-unsynced-form", "HHQ", oldHouseholdId, JSON.stringify({ hhq_household_head_name: "Preserved head" }), "pending"]);
db.runSync("INSERT INTO questionnaire_drafts (draft_id, draft_key, form_code, json_payload, completion_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ["old-draft", "old-draft-key", "HHQ", JSON.stringify({ member_name: "Preserved member" }), "{}", "2026-10-28", "2026-10-28"]);
db.runSync("INSERT INTO domain_events_outbox (id, event_type, payload, sync_status) VALUES (?, ?, ?, ?)",
  ["old-event", "PreservedEvent", JSON.stringify({ household_id: oldHouseholdId }), "pending"]);
const rawSnapshot = () => JSON.stringify(Object.fromEntries(
  db.getAllSync("SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'sync_meta' ORDER BY name")
    .map(({ name }) => [name, db.getAllSync(`SELECT * FROM "${name}"`)]),
));
const beforeTransfer = rawSnapshot();
const webCacheBeforeTransfer = JSON.stringify([...storage]);
saveAssignedHouseholdIds({ ...user, site_id: 1 }, [oldHouseholdId, ...currentHouseholdIds]);
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify({ ...user, site_id: 1 })]);
assert.deepEqual(getAssignedHouseholdIds(), [oldHouseholdId]);
db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", ["auth_user", JSON.stringify(user)]);
assert.deepEqual(getAssignedHouseholdIds(), currentHouseholdIds, "a same-user site refresh must immediately exclude old-site assignments before pull");
assert.deepEqual(new Set(listTaskWorklist().map(({ id }) => id)), new Set(["assigned", "leaked", "local-bwq", "local-pef"]));
assert.equal((await listTasksPage({})).total, 4);
assert.deepEqual(await listOpenHhqHouseholdIds(), currentHouseholdIds);
assert.equal(getTask("local-bwq").sync_status, "pending");
assert.equal(getTask("local-pef").sync_status, "pending");
assert.equal(getTask("old-site").household_id, oldHouseholdId, "hidden historical tasks remain stored");
assert.equal(rawSnapshot(), beforeTransfer, "site visibility changes never modify tasks, saved forms, drafts or event outbox rows");
assert.equal(JSON.stringify([...storage]), webCacheBeforeTransfer, "household/member caches remain unchanged");
assert.deepEqual((await listHouseholds()).map(({ household_id }) => household_id), currentHouseholdIds);

delete global.window;

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
  getMeta: () => null, getAssignedLocalities: () => ["39"],
  emitProgress() {}, shouldShowBatchProgress: () => false,
  setClockMetadata() {}, unwrapApiData: (data) => data,
  refreshProtocolForms: async () => ({ formsUpdated: 0 }),
  setMeta() {}, selectNextPullCursor: () => null,
  saveAssignedHouseholdIds: (...args) => { savedScopes.push(args); saveAssignedHouseholdIds(...args, db); },
  fetch: async () => {
    const page = pages.shift();
    return { ok: Boolean(page), statusText: "Failed", json: async () => page };
  },
});
vm.runInContext(`${pullSource}\nglobalThis.pullSync = pullSync;`, context);
pages = [{ next_page_token: "page2", assigned_household_ids: ["2-39-0002-01"] }, null];
await assert.rejects(context.pullSync(), /Pull sync failed/);
assert.equal(savedScopes.length, 0, "a failed later page must preserve the last complete assignment scope");
assert.deepEqual(getAssignedHouseholdIds(), currentHouseholdIds, "failed pull cannot revive old-site cached work");
pages = [{ next_page_token: "page2", assigned_household_ids: [] }, { assigned_household_ids: [] }];
await context.pullSync();
assert.equal(savedScopes.length, 1, "persist authoritative assignments once after every page succeeds");
assert.deepEqual(savedScopes[0], [user, []]);
saveAssignedHouseholdIds(user, [oldHouseholdId, ...currentHouseholdIds]);
pages = [{}];
await context.pullSync();
assert.equal(savedScopes.length, 1, "an older server without the scope field must not erase the confirmed scope");
assert.deepEqual(getAssignedHouseholdIds(), currentHouseholdIds);
assert.equal(rawSnapshot(), beforeTransfer, "pull scope refresh does not rewrite evidence or task records");
sqlite.close();
console.log("Household assignment visibility passed: fail-closed scope, same-user site transfer, offline work and retained evidence/caches.");
