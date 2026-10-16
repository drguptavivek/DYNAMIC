/** Behavioral checks for the synthetic-only BLB registry cache and pull path. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  getAssignedBlbRegistryVillages,
  getBlbRegistryScopeFingerprint,
  getSelectedBlbRegistryVillages,
  getBlbRegistryVillageSearchScope,
} from "../modules/households/blbRegistryScope.js";
import {
  invalidateRegistrySession,
  getRegistrySessionSignal,
  withRegistryCacheLock,
} from "../modules/storage/registryCacheLifecycle.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const repository = fs.readFileSync(path.resolve(root, "../modules/households/blbRegistryRepository.js"), "utf8").replace(/\r\n/g, "\n");
const sync = fs.readFileSync(path.resolve(root, "../modules/sync/syncService.js"), "utf8").replace(/\r\n/g, "\n");
const schema = fs.readFileSync(path.resolve(root, "../modules/households/householdRepository.js"), "utf8");

assert.match(repository, /uid: requiredText\(individual\?\.uid/);
assert.match(repository, /hh_list_no: text\(individual\?\.hh_list_no\) \|\| ""/);
assert.match(schema, /uid TEXT PRIMARY KEY NOT NULL,[\s\S]*village_code TEXT,[\s\S]*source_age_as_of TEXT/);
assert.doesNotMatch(schema, /UNIQUE\(hh_list_no, family_no, ind_no\)/);
assert.match(schema, /ALTER TABLE blb_registry_individuals RENAME TO blb_registry_individuals_legacy/);
assert.match(schema, /INSERT INTO blb_registry_individuals[\s\S]*FROM blb_registry_individuals_legacy/);

const scopedUser = {
  area_assignments: [
    { site_id: 2, locality_code: "02", active_from: "2026-01-01", active_to: "2026-12-31" },
    { site_id: 3, locality_code: "02", active_from: "2026-01-01", active_to: "2026-12-31" },
    { site_id: 2, locality_code: "03", active_from: "2027-01-01", active_to: null },
    { site_id: 2, locality_code: "04", active_from: null, active_to: "2026-09-30" },
  ],
};
const mappedVillages = ["02", "10", "11", "12", "13", "14", "15", "20", "21", "22", "30", "31", "32", "33", "34", "39", "40", "41", "42", "43", "50", "51", "52", "60", "61", "62", "63", "64", "70", "71"];
assert.deepEqual(getAssignedBlbRegistryVillages(scopedUser, "2026-10-14"), mappedVillages);
assert.equal(getBlbRegistryScopeFingerprint(scopedUser, "2026-10-14"), mappedVillages.join(","));
assert.deepEqual(getSelectedBlbRegistryVillages(scopedUser, " 02 ", "2026-10-14"), mappedVillages);
assert.deepEqual(getSelectedBlbRegistryVillages(scopedUser, "", "2026-10-14"), mappedVillages);
assert.deepEqual(getSelectedBlbRegistryVillages(scopedUser, "10", "2026-10-14"), [], "selection must be an assigned study locality, not just an accessible source village");
assert.deepEqual(getSelectedBlbRegistryVillages(scopedUser, "04", "2026-10-14"), [], "expired assignments do not permit browsing");
assert.deepEqual(getAssignedBlbRegistryVillages({ area_assignments: [{ site_id: 2, locality_code: "10" }] }, "2026-10-14"), ["10"]);
assert.deepEqual(getSelectedBlbRegistryVillages({ area_assignments: [{ site_id: 2, locality_code: "10" }] }, "10", "2026-10-14"), ["10"]);
assert.deepEqual(getAssignedBlbRegistryVillages({ area_assignments: [{ site_id: 1, locality_code: "02" }] }, "2026-10-14"), []);
assert.deepEqual(getAssignedBlbRegistryVillages({ area_assignments: [{ site_id: 2, locality_code: "02", active_to: "2026-10-13" }] }, "2026-10-14"), []);
assert.deepEqual(getAssignedBlbRegistryVillages({ area_assignments: [{ site_id: 2, locality_code: "02", active_from: "2026-10-15" }] }, "2026-10-14"), []);
assert.deepEqual(getAssignedBlbRegistryVillages({}, "2026-10-14"), []);

let releaseFirst;
const lockOrder = [];
const firstLock = withRegistryCacheLock(async () => {
  lockOrder.push("first");
  await new Promise((resolve) => { releaseFirst = resolve; });
  lockOrder.push("first-done");
});
const secondLock = withRegistryCacheLock(async () => { lockOrder.push("second"); });
await Promise.resolve();
assert.deepEqual(lockOrder, ["first"]);
const previousSignal = getRegistrySessionSignal();
invalidateRegistrySession();
assert.equal(previousSignal.aborted, true, "logout cancels a pending network request holding the download lock");
assert.equal(getRegistrySessionSignal().aborted, false, "the next account receives a fresh signal");
releaseFirst();
await Promise.all([firstLock, secondLock]);
assert.deepEqual(lockOrder, ["first", "first-done", "second"]);

function loadRepository({ platform, storage, db }) {
  const transformed = repository
    .replace('import { Platform } from "react-native";', "const Platform = globalThis.Platform;")
    .replace('import { getOfflineDatabase } from "../storage/offlineDatabase";', "const getOfflineDatabase = globalThis.getOfflineDatabase;")
    .replace('import { getBlbRegistryVillageSearchScope } from "./blbRegistryScope.js";', "const getBlbRegistryVillageSearchScope = globalThis.getBlbRegistryVillageSearchScope;")
    .replace('import {\n  getRegistrySessionGeneration,\n  withRegistryCacheLock,\n} from "../storage/registryCacheLifecycle.js";', "const getRegistrySessionGeneration = globalThis.getRegistrySessionGeneration; const withRegistryCacheLock = globalThis.withRegistryCacheLock;")
    .replace(/^export /gm, "")
    + "\nthis.registryApi = { replaceBlbRegistry, findBlbRegistryIndividuals, findBlbRegistryIndividual, findBlbRegistryIndividualByUid, searchBlbRegistryPeople, listBlbRegistryHouseholds, listBlbRegistryHouseholdMembers, bumpGeneration: () => { this.generation += 1; } };";
  const context = {
    Platform: platform,
    getBlbRegistryVillageSearchScope,
    getOfflineDatabase: () => db,
    window: { localStorage: storage },
    generation: 0,
    getRegistrySessionGeneration: () => context.generation,
    withRegistryCacheLock: async (work) => work(),
    console,
  };
  vm.runInNewContext(transformed, context);
  return context.registryApi;
}

const browserStorage = {
  value: JSON.stringify({ households: [], individuals: [{ uid: "old", village_code: "01" }] }),
  fail: false,
  getItem() { return this.value; },
  setItem(_key, value) { if (this.fail) throw new Error("quota"); this.value = value; },
};
const webApi = loadRepository({ platform: { OS: "web" }, storage: browserStorage, db: null });
await webApi.replaceBlbRegistry({ households: [], individuals: [
  { uid: "UID-A!", village_code: "01", hh_list_no: "001", family_no: "02", ind_no: "3", name: "A", domicile: "R", curr_status: "L" },
  { uid: "UID-B", village_code: "01", hh_list_no: "001", family_no: "02", ind_no: "3", name: "B", domicile: "Dead", curr_status: "L" },
  { uid: "UID-PERCENT", village_code: "01", hh_list_no: "002", family_no: "01", ind_no: "01", name: "100% Person", domicile: "R", curr_status: "L" },
  { uid: "UID-BLANK", village_code: "01", hh_list_no: "", family_no: "", ind_no: "", name: "Blank keys" },
] });
const storedRows = JSON.parse(browserStorage.value).individuals;
assert.equal(storedRows[0].domicile, "R");
assert.equal(storedRows[0].status, "alive");
assert.equal(storedRows[0].curr_status, "L");
assert.equal((await webApi.findBlbRegistryIndividuals("01", "001", "02", "3", ["01"])).length, 2);
assert.equal(await webApi.findBlbRegistryIndividual("01", "001", "02", "3", ["01"]), null);
assert.equal((await webApi.findBlbRegistryIndividualByUid("UID-A!", ["01"])).uid, "UID-A!");
assert.equal((await webApi.findBlbRegistryIndividuals("01", "001", "02", "3", ["03"])).length, 0);
assert.equal(await webApi.findBlbRegistryIndividualByUid("UID-A!", ["03"]), null);
assert.equal((await webApi.findBlbRegistryIndividuals("01", "", "", "", ["01"])).length, 0);
assert.equal((await webApi.searchBlbRegistryPeople({ villageCode: "01", houseNo: "001" }, ["01"])).length, 2);
assert.equal((await webApi.searchBlbRegistryPeople({ villageCode: "01", houseNo: "002" }, ["01"]))[0].hh_list_no, "002");
assert.equal((await webApi.searchBlbRegistryPeople({ villageCode: "01", search: "100%" }, ["01"])).length, 1);
assert.equal((await webApi.searchBlbRegistryPeople({ villageCode: "01", search: "01-001-02-3", limit: 1, offset: 1 }, ["01"]))[0].uid, "UID-B");
assert.equal((await webApi.searchBlbRegistryPeople({ villageCode: "01", limit: 500 }, ["03"])).length, 0);
assert.equal((await webApi.searchBlbRegistryPeople({ villageCode: "", houseNo: "001" }, ["01"])).length, 0);
browserStorage.fail = true;
await assert.rejects(() => webApi.replaceBlbRegistry({ households: [], individuals: [{ uid: "new", village_code: "01" }] }), /quota/);
assert.match(browserStorage.value, /UID-A!/);

const nativeLog = [];
let nativeApi;
nativeApi = loadRepository({
  platform: { OS: "android" },
  storage: null,
  db: {
    async execAsync(sql) { nativeLog.push(sql); },
    async runAsync(sql) { nativeLog.push(sql); if (sql.includes("DELETE FROM blb_registry_households")) nativeApi.bumpGeneration(); },
    async getAllAsync(sql, params) { nativeLog.push({ sql, params }); return []; },
  },
});
await assert.rejects(() => nativeApi.replaceBlbRegistry({ households: [], individuals: [{ uid: "native", village_code: "01" }] }), /session changed (during cache replacement|before cache commit)/);
assert.ok(nativeLog.includes("BEGIN TRANSACTION"));
assert.ok(nativeLog.includes("ROLLBACK"));
await nativeApi.searchBlbRegistryPeople({ villageCode: "01", houseNo: "001", search: "A%", offset: 2, limit: 500 }, ["01"]);
const searchQuery = nativeLog.find((entry) => typeof entry === "object" && entry.sql.includes("FROM blb_registry_individuals"));
assert.match(searchQuery.sql, /trim\(village_code\) IN \(\?\)/);
assert.match(searchQuery.sql, /trim\(hh_list_no\) = \?/);
assert.match(searchQuery.sql, /ORDER BY family_no[\s\S]*ind_no[\s\S]*uid/);
assert.match(searchQuery.params[2], /a\\%/);
assert.equal(searchQuery.params.at(-2), 50);
assert.equal(searchQuery.params.at(-1), 2);

let activeScope = "02";
const scopeLog = [];
let scopeApi;
scopeApi = loadRepository({
  platform: { OS: "android" },
  storage: null,
  db: {
    async execAsync(sql) { scopeLog.push(sql); },
    async runAsync(sql) {
      scopeLog.push(sql);
      if (sql.includes("DELETE FROM blb_registry_households")) activeScope = "03";
    },
  },
});
await assert.rejects(() => scopeApi.replaceBlbRegistry({
  households: [],
  individuals: [{ uid: "scope-race", village_code: "02" }],
  expectedScopeFingerprint: "02",
  getCurrentScopeFingerprint: () => activeScope,
}), /assignment scope changed during cache replacement|assignment scope changed before cache commit/);
assert.ok(scopeLog.includes("ROLLBACK"));

// The pull loop requests bounded pages, follows opaque cursors, validates
// every page, saves each page before continuing, and activates only a complete cache.
assert.match(sync, /BLB_REGISTRY_PAGE_SIZE = 1000/);
assert.match(sync, /params\.set\("cursor", cursor\)/);
assert.match(sync, /session changed during pull/);
const pullStart = sync.indexOf("export async function pullBlbRegistry");
const pullEnd = sync.indexOf("\n}\n\nexport function getLastSyncAt", pullStart) + 2;
const pullSource = sync.slice(pullStart, pullEnd).replace("export async function", "async function");
async function runPull(responses, options = {}) {
  let replaceArgs = null;
  let marker = options.marker ?? null;
  let counts = options.counts || { households: 0, individuals: 0 };
  const progress = [];
  const urls = [];
  const events = [];
  const context = {
    API_BASE_URL: "https://example.test/api",
    URLSearchParams,
    getRegistrySessionGeneration: () => options.generation ?? 0,
    getRegistrySessionSignal: () => options.signal,
    getBlbRegistryScopeFingerprint,
    authStore: { getToken: () => null, getUser: () => options.user ?? null },
    getMeta: () => marker,
    setMeta: (_key, value) => { marker = value; },
    getBlbRegistryCounts: async () => counts,
    emitProgress: (callback, value) => { events.push("progress"); callback?.(value); },
    unwrapApiData: (payload) => payload?.data ?? payload,
    withBlbRegistryDownload: async (args) => {
      const households = [];
      const individuals = [];
      const metadata = await args.download(async (page) => {
        households.push(...page.households);
        individuals.push(...page.individuals);
        events.push("saved-page");
      });
      if (metadata.unchanged) return metadata;
      args.beforeCommit?.();
      replaceArgs = { ...args, households, individuals };
      if (options.replaceError) throw new Error(options.replaceError);
      counts = { households: households.length, individuals: individuals.length };
      events.push("activated");
      options.afterReplace?.(options);
      return { ...metadata, ...counts };
    },
  };
  vm.runInNewContext(`const BLB_REGISTRY_PAGE_SIZE = 1000; ${pullSource}\nthis.run = pullBlbRegistry;`, context);
  let index = 0;
  const fetchImpl = async (url, request) => {
    events.push("fetch");
    urls.push(url);
    assert.equal(request.signal, options.signal);
    options.beforeResponse?.(options, index);
    if (options.awaitAbort) {
      return new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => reject(new Error("request aborted")), { once: true }));
    }
    return responses[index++];
  };
  try {
    const result = await context.run({ fetchImpl, token: "synthetic-token", onProgress: (value) => progress.push(value) });
    return { result, replaceArgs, lastUrl: urls.at(-1), calls: index, marker, progress, urls, events };
  } catch (error) {
    error.marker = marker;
    error.replaceArgs = replaceArgs;
    throw error;
  }
}
const paged = await runPull([
  { ok: true, json: async () => ({ data: { households: [{ hh_list_no: "1", family_no: "1" }], individuals: [], next_cursor: "opaque-cursor" } }) },
  { ok: true, json: async () => ({ data: { households: [], individuals: [{ uid: "p2", hh_list_no: "2", family_no: "1", ind_no: "1" }], next_cursor: null } }) },
]);
assert.equal(paged.calls, 2);
assert.equal(paged.replaceArgs.individuals[0].uid, "p2");
assert.equal(paged.replaceArgs.expectedGeneration, 0);
assert.equal(paged.replaceArgs.expectedScopeFingerprint, "");
assert.match(paged.lastUrl, /cursor=opaque-cursor/);
const failed = await runPull([
  { ok: true, json: async () => ({ households: [], individuals: [], next_cursor: "next" }) },
  { ok: false, status: 503 },
]).catch((error) => error);
assert.match(failed.message, /BLB registry pull failed: 503/);
const pendingController = new AbortController();
const aborted = await runPull([], { signal: pendingController.signal, awaitAbort: true,
  beforeResponse: () => queueMicrotask(() => pendingController.abort()),
}).catch((error) => error);
assert.match(aborted.message, /request aborted/);
assert.equal(aborted.replaceArgs, null, "cancelled requests cannot activate a cache");

const versionA = "a".repeat(64);
const versionB = "b".repeat(64);
const cacheMarker = JSON.stringify({ version: versionA, userId: null, scope: "", households: 0, individuals: 1 });
const pageResponse = (data) => ({ ok: true, json: async () => ({ data }) });
const countedPull = await runPull([
  pageResponse({ households: [], individuals: [{ uid: "one" }, { uid: "two" }], total_individuals: 3, next_cursor: "last" }),
  pageResponse({ households: [], individuals: [{ uid: "three" }], next_cursor: null }),
]);
assert.equal(countedPull.calls, 2, "the count arrives with page one, without a counting/download pass");
const downloadProgress = countedPull.progress.filter((item) => item.stage === "pull-blb-registry");
assert.equal(downloadProgress[0].message, "2 downloaded out of 3");
assert.equal(downloadProgress[1].message, "3 downloaded out of 3");
assert.equal(downloadProgress[1].total, 3, "retain first-page total when later pages omit it");
assert.deepEqual(countedPull.events, ["fetch", "saved-page", "progress", "fetch", "saved-page", "activated", "progress"],
  "advance only after saving each page; report final count only after the complete cache is activated");
assert.ok(!countedPull.progress.some((item) => item.stage === "save-blb-registry"));
assert.equal(countedPull.replaceArgs.individuals.length, 3);
for (const total of [undefined, null, -1, 1.5, "3", 0]) {
  const fallback = await runPull([pageResponse({ households: [], individuals: [{ uid: "valid" }], total_individuals: total })]);
  assert.equal(fallback.progress[0].message, "1 HDSS people downloaded");
  assert.equal(fallback.replaceArgs.individuals.length, 1, "optional totals never reject or truncate valid records");
}
const emptyCountedPull = await runPull([pageResponse({ households: [], individuals: [], total_individuals: 0 })]);
assert.equal(emptyCountedPull.progress[0].message, "0 downloaded out of 0");
const unchangedResponse = pageResponse({ households: [], individuals: [], next_cursor: null, registry_version: versionA, not_modified: true });
const cachedPull = await runPull([unchangedResponse], { marker: cacheMarker, counts: { households: 0, individuals: 1 } });
assert.equal(cachedPull.calls, 1);
assert.equal(cachedPull.replaceArgs, null);
assert.equal(cachedPull.result.unchanged, true);
assert.match(cachedPull.lastUrl, /known_registry_version=aaaa/);
assert.ok(cachedPull.progress.some((item) => /up to date/.test(item.message)));
for (const options of [
  { marker: cacheMarker, counts: { households: 0, individuals: 0 } },
  { marker: cacheMarker, counts: { households: 0, individuals: 1 }, user: { id: "different-user" } },
  { marker: JSON.stringify({ ...JSON.parse(cacheMarker), scope: "different-village" }), counts: { households: 0, individuals: 1 } },
]) {
  const invalidReuse = await runPull([unchangedResponse], options).catch((error) => error);
  assert.match(invalidReuse.message, /invalid unchanged response/);
  assert.equal(invalidReuse.replaceArgs, null);
}
const lateUnchanged = await runPull([unchangedResponse], {
  marker: cacheMarker, counts: { households: 0, individuals: 1 },
  beforeResponse: (options) => { options.generation = 1; },
}).catch((error) => error);
assert.match(lateUnchanged.message, /session changed/);
assert.equal(lateUnchanged.replaceArgs, null);
const clearedCache = await runPull([unchangedResponse], {
  marker: cacheMarker, counts: { households: 0, individuals: 1 },
  beforeResponse: (options) => { options.counts.individuals = 0; },
}).catch((error) => error);
assert.match(clearedCache.message, /invalid unchanged response/);
const markerAfterFailedPage = await runPull([
  pageResponse({ households: [], individuals: [], next_cursor: "next", registry_version: versionA }),
  { ok: false, status: 503 },
], { marker: cacheMarker }).catch((error) => error);
assert.equal(markerAfterFailedPage.marker, cacheMarker);
const refreshedPull = await runPull([
  pageResponse({ households: [], individuals: [{ uid: "new" }], next_cursor: null, registry_version: versionB }),
], { marker: cacheMarker, counts: { households: 0, individuals: 1 } });
assert.equal(JSON.parse(refreshedPull.marker).version, versionB);
assert.equal(refreshedPull.result.individuals, 1);
assert.ok(refreshedPull.progress.every((item) => item.stage === "pull-blb-registry"));
const changedMidPull = await runPull([
  pageResponse({ households: [], individuals: [], next_cursor: "next", registry_version: versionA }),
  pageResponse({ households: [], individuals: [], next_cursor: null, registry_version: versionB }),
], { marker: cacheMarker }).catch((error) => error);
assert.match(changedMidPull.message, /changed during download/);
assert.equal(changedMidPull.replaceArgs, null);
assert.equal(changedMidPull.marker, cacheMarker);
const failedReplace = await runPull([
  pageResponse({ households: [], individuals: [{ uid: "new" }], registry_version: versionB }),
], { marker: cacheMarker, replaceError: "synthetic cache write failed" }).catch((error) => error);
assert.match(failedReplace.message, /cache write failed/);
assert.equal(failedReplace.marker, "");
const lateSession = await runPull([
  pageResponse({ households: [], individuals: [{ uid: "new" }], registry_version: versionB }),
], { marker: cacheMarker, afterReplace: (options) => { options.generation = 1; } }).catch((error) => error);
assert.match(lateSession.message, /session changed/);
assert.equal(lateSession.marker, "");
assert.equal(paged.marker, ""); // Old APIs do not create a version marker.
assert.ok(!paged.urls.some((url) => url.includes("known_registry_version")));

// Run the real initialization SQL against a legacy SQLite table, rather than
// relying on a fake database that accepts references to missing columns.
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE blb_registry_individuals (
  uid TEXT PRIMARY KEY NOT NULL, hh_list_no TEXT NOT NULL,
  family_no TEXT NOT NULL, ind_no TEXT NOT NULL, name TEXT NOT NULL,
  age_years INTEGER, sex TEXT, status TEXT NOT NULL DEFAULT 'alive', updated_at TEXT,
  UNIQUE(hh_list_no, family_no, ind_no)
); INSERT INTO blb_registry_individuals VALUES ('legacy-test', '001', '02', '03', 'Synthetic', 12, '1', 'alive', NULL);`);
const db = {
  execAsync: async (sql) => sqlite.exec(sql),
  runAsync: async (sql, params = []) => sqlite.prepare(sql).run(...params),
  getAllAsync: async (sql, params = []) => sqlite.prepare(sql).all(...params),
  getFirstAsync: async (sql, params = []) => sqlite.prepare(sql).get(...params),
};
const initStart = schema.indexOf("async function initializeSqlite(db)");
const initEnd = schema.indexOf("async function ensureSqliteInitialized", initStart);
const initContext = { STUDY_SITES: [], STUDY_VILLAGES: [] };
vm.runInNewContext(`${schema.slice(initStart, initEnd)}\nthis.initialize = initializeSqlite;`, initContext);
await initContext.initialize(db);
assert.equal(sqlite.prepare("SELECT hh_list_no FROM blb_registry_individuals WHERE uid = ?").get("legacy-test").hh_list_no, "001");
sqlite.prepare("INSERT INTO blb_registry_individuals (uid, hh_list_no, family_no, ind_no) VALUES (?, ?, ?, ?)").run("second-test", "001", "02", "03");
await initContext.initialize(db);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM blb_registry_individuals").get().n, 2);
// An already-v2 phone still receives the independent browse indexes without rewriting IDs.
const beforeIndexUpgrade = await db.getAllAsync("SELECT * FROM blb_registry_individuals ORDER BY uid");
sqlite.exec(`DROP INDEX idx_blb_registry_household_browse;
  DROP INDEX idx_blb_registry_people_browse;
  DELETE FROM local_schema_migrations WHERE name='blb_registry.browse_indexes.v1'`);
assert.ok(sqlite.prepare("SELECT name FROM local_schema_migrations WHERE name='blb_registry.individuals.v2'").get());
await initContext.initialize(db);
assert.deepEqual(await db.getAllAsync("SELECT * FROM blb_registry_individuals ORDER BY uid"), beforeIndexUpgrade);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name IN ('idx_blb_registry_household_browse','idx_blb_registry_people_browse')").get().n, 2);
await initContext.initialize(db);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM local_schema_migrations WHERE name='blb_registry.browse_indexes.v1'").get().n, 1);
sqlite.exec("UPDATE blb_registry_individuals SET village_code='01'; UPDATE blb_registry_individuals SET name='A% Literal', hh_list_no=' 001 ' WHERE uid='legacy-test'");
const realSqlApi = loadRepository({ platform: { OS: "android" }, storage: null, db });
const literalMatch = await realSqlApi.searchBlbRegistryPeople({ villageCode: "01", houseNo: "001", search: "A%" }, ["01"]);
assert.equal(literalMatch.length, 1, "native LIKE escapes literal wildcard input");
assert.equal(literalMatch[0].uid, "legacy-test");
const originalIdMatches = await realSqlApi.searchBlbRegistryPeople({ villageCode: "01", houseNo: "001", search: "01-001-02-03" }, ["01"]);
assert.equal(originalIdMatches.length, 2, "native original-ID search retains both people and tolerates source padding");

// Browsing groups reference people into scoped households before applying page limits.
const browseRows = Array.from({ length: 55 }, (_, index) => ({
  uid: `browse-${index}`, village_code: "01", village_name: "First village",
  hh_list_no: String(index).padStart(3, "0"), family_no: "01", ind_no: "01", name: `Person ${index}`,
}));
browseRows.push(
  { uid: "late-rajat", village_code: " 01 ", hh_list_no: " 099 ", family_no: " 02 ", ind_no: "01", name: "Rajat" },
  { uid: "late-ankit", village_code: "01", hh_list_no: "099", family_no: "02", ind_no: "01", name: "Ankit" },
  { uid: "literal", village_code: "01", hh_list_no: "099", family_no: "02", ind_no: "03", name: "100% A_B \\ person" },
  { uid: "other-village", village_code: "02", hh_list_no: "099", family_no: "02", ind_no: "01", name: "Rajat" },
  { uid: "blank-house", village_code: "01", hh_list_no: "", family_no: "02", ind_no: "01", name: "Rajat" },
  { uid: "blank-family", village_code: "01", hh_list_no: "099", family_no: " ", ind_no: "01", name: "Rajat" },
);
for (let index = 0; index < 51; index += 1) browseRows.push({
  uid: `large-${index}`, village_code: "01", hh_list_no: "100", family_no: "01", ind_no: "01", name: `Large family ${index}`,
});
browserStorage.fail = false;
for (const api of [webApi, realSqlApi]) {
  await api.replaceBlbRegistry({ households: [], individuals: browseRows });
  const firstPage = await api.listBlbRegistryHouseholds({ limit: 500 }, ["01"]);
  assert.equal(firstPage.households.length, 50, "household page cannot exceed 50");
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.households[0].hh_list_no, "000", "leading zeros are retained");
  const secondPage = await api.listBlbRegistryHouseholds({ offset: 50 }, ["01"]);
  assert.equal(secondPage.households.length, 7);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.households[0].hh_list_no, "050");
  const found = await api.listBlbRegistryHouseholds({ search: "  rAJat , ANKIT  " }, ["01", "02"]);
  assert.equal(found.households.length, 1, "all comma-separated names must match the same household, across members");
  assert.equal(found.households[0].hh_list_no, "099", "search covers households beyond the first page");
  assert.equal(found.households[0].member_count, 3, "matching household retains all members including duplicate address tuples");
  assert.deepEqual(Array.from(found.households[0].member_names), ["100% A_B \\ person", "Ankit", "Rajat"]);
  for (const search of ["100%", "A_B", "\\"]) {
    assert.equal((await api.listBlbRegistryHouseholds({ search }, ["01"])).households.length, 1, "wildcard characters are literal");
  }
  assert.equal((await api.listBlbRegistryHouseholds({ search: "Rajat, missing" }, ["01"])).households.length, 0);
  assert.equal((await api.listBlbRegistryHouseholds({ search: "  , , " }, ["01"])).households.length, 50);
  assert.equal((await api.listBlbRegistryHouseholds({}, [])).households.length, 0);
  assert.equal((await api.listBlbRegistryHouseholds({ villageCode: "02" }, ["01"])).households.length, 0);
  const otherVillage = await api.listBlbRegistryHouseholds({ villageCode: "02", search: "Rajat" }, ["01", "02"]);
  assert.equal(otherVillage.households.length, 1);
  assert.equal(otherVillage.households[0].member_count, 1, "same address in another village remains a different household");
  const members = await api.listBlbRegistryHouseholdMembers({ villageCode: " 01 ", houseNo: "099", familyNo: "02" }, ["01"]);
  assert.equal(members.length, 3);
  assert.equal(new Set(members.map((member) => member.uid)).size, 3);
  assert.equal((await api.listBlbRegistryHouseholdMembers({ villageCode: "01", houseNo: "100", familyNo: "01" }, ["01"])).length, 51, "detail is not capped at 50 members");
  assert.equal((await api.listBlbRegistryHouseholdMembers({ villageCode: "02", houseNo: "099", familyNo: "02" }, ["01"])).length, 0);
  assert.equal((await api.listBlbRegistryHouseholdMembers({ villageCode: "01", houseNo: "099", familyNo: "02" }, [])).length, 0);
  assert.equal((await api.listBlbRegistryHouseholdMembers({ villageCode: "01", houseNo: "", familyNo: "02" }, ["01"])).length, 0);
}

const selectedMappedVillages = getSelectedBlbRegistryVillages(scopedUser, "02", "2026-10-14");
const mappedBrowseRows = browseRows.map((row) => ({ ...row, village_code: "10" }));
mappedBrowseRows.push({ uid: "outside-approved-villages", village_code: "99", hh_list_no: "099", family_no: "02", ind_no: "01", name: "Rajat" });
mappedBrowseRows.push({ uid: "last-approved-village", village_code: "71", hh_list_no: "099", family_no: "02", ind_no: "01", name: "Ankit" });
for (const api of [webApi, realSqlApi]) {
  await api.replaceBlbRegistry({ households: [], individuals: mappedBrowseRows });
  const page = await api.listBlbRegistryHouseholds({}, selectedMappedVillages);
  assert.equal(page.households.length, 50, "selected study locality 02 browses source village 10");
  assert.equal(page.hasMore, true);
  const matches = await api.listBlbRegistryHouseholds({ search: "  rAjAt, ANKIT  " }, selectedMappedVillages);
  assert.equal(matches.households.length, 1, "mapped-locality search covers records beyond the displayed page");
  assert.equal(matches.households[0].village_code, "10");
  assert.equal((await api.listBlbRegistryHouseholdMembers({ villageCode: "10", houseNo: "100", familyNo: "01" }, selectedMappedVillages)).length, 51);
  assert.equal((await api.listBlbRegistryHouseholds({ villageCode: "99" }, selectedMappedVillages)).households.length, 0, "mapping does not allow other source villages");
  const firstPeople = await api.searchBlbRegistryPeople({ villageCode: "02", limit: 10 }, selectedMappedVillages);
  const nextPeople = await api.searchBlbRegistryPeople({ villageCode: "02", limit: 10, offset: 10 }, selectedMappedVillages);
  assert.equal(firstPeople.length, 10, "BHQ starts with ten people across mapped villages");
  assert.equal(nextPeople.length, 10);
  assert.equal(new Set([...firstPeople, ...nextPeople].map((row) => row.uid)).size, 20, "load-more pages do not overlap");
  assert.ok(!firstPeople.some((row) => row.uid === "late-ankit"));
  const filteredPeople = await api.searchBlbRegistryPeople({ villageCode: "02", houseNo: " 099 ", search: "  aNkIt  ", limit: 10 }, selectedMappedVillages);
  assert.deepEqual(Array.from(filteredPeople, (row) => row.uid).sort(), ["last-approved-village", "late-ankit"], "name and house filters apply across all mapped records before limiting");
  const narrowedPeople = await api.searchBlbRegistryPeople({ villageCode: "10", houseNo: "099", search: "Ankit", limit: 10 }, selectedMappedVillages);
  assert.deepEqual(Array.from(narrowedPeople, (row) => row.uid), ["late-ankit"], "source village selection narrows the full-data search");
  const byOriginalId = await api.searchBlbRegistryPeople({ villageCode: "02", houseNo: "099", search: " 10-099-02-03 ", limit: 10 }, selectedMappedVillages);
  assert.deepEqual(Array.from(byOriginalId, (row) => row.uid), ["literal"], "original ID search finds a row beyond the initial ten");
  assert.equal((await api.searchBlbRegistryPeople({ villageCode: "02", houseNo: "0099", search: "Ankit", limit: 10 }, selectedMappedVillages)).length, 0, "house filter preserves significant leading zeros");
  assert.equal((await api.searchBlbRegistryPeople({ villageCode: "02", limit: 10 }, ["02"])).length, 0, "mapped villages must also be permitted by the cache scope");
  assert.equal((await api.searchBlbRegistryPeople({ villageCode: "02", limit: 10 }, ["10"])).length, 0, "locality expansion requires an explicit permitted locality");
  assert.equal((await api.searchBlbRegistryPeople({ villageCode: "02", limit: 10 }, [])).length, 0);
  assert.equal((await api.searchBlbRegistryPeople({ villageCode: "", limit: 10 }, selectedMappedVillages)).length, 0);
  assert.equal((await api.searchBlbRegistryPeople({ villageCode: "99", limit: 10 }, selectedMappedVillages)).length, 0);
}

// Exercise the production server-pull mapper and native upsert. A fresh sync
// must retain the exact UID instead of replacing it with an empty link.
const pullMapperStart = schema.indexOf("export async function saveSyncedHouseholdsAndMembers");
const pullMapperEnd = schema.indexOf("export async function saveHousehold(record)", pullMapperStart);
const pullMapperSource = schema.slice(pullMapperStart, pullMapperEnd).replace(/^export /gm, "");
const pulledMember = {
  household_member_id: "2-01-0001-01-01", household_id: "2-01-0001-01", member_number: 1,
  name: "Synthetic member", sex: "male", registry_uid: "SYNTHETIC-RAW-UID!",
  registry_individual_id: "01-0001-01-02", registry_status: "2",
  updated_at: "2026-10-14T12:00:00Z",
};
const mapperContext = {
  getDatabase: async () => ({
    ...db,
    runAsync: async (sql, params = []) => sqlite.prepare(sql).run(...params.map((value) => value ?? null)),
  }),
  ensureSqliteInitialized: async () => {},
  normalizeWomanQuestionnaireEligible: (value) => value === true || value === 1 || value === "1" ? 1 : 0,
  console,
};
vm.runInNewContext(`${pullMapperSource}\nthis.savePull = saveSyncedHouseholdsAndMembers;`, mapperContext);
await mapperContext.savePull([], [pulledMember]);
const retainedLink = sqlite.prepare("SELECT registry_uid, registry_individual_id, registry_status FROM household_members WHERE individual_id=?").get(pulledMember.household_member_id);
assert.equal(retainedLink.registry_uid, pulledMember.registry_uid);
assert.equal(retainedLink.registry_individual_id, pulledMember.registry_individual_id);
assert.equal(retainedLink.registry_status, pulledMember.registry_status);
const webValues = new Map();
const storage = { getItem: (key) => webValues.get(key) ?? null, setItem: (key, value) => webValues.set(key, value) };
Object.assign(mapperContext, {
  getDatabase: async () => null, getStorage: () => storage,
  cleanupObsoleteWebStorage: () => {}, readStorageArray: (store, key) => JSON.parse(store.getItem(key) || "[]"),
  setStorageArray: (store, key, rows) => store.setItem(key, JSON.stringify(rows)),
  mergeRowsById: (rows) => rows,
  HOUSEHOLD_STORAGE_KEY: "households", MEMBER_STORAGE_KEY: "members",
  WEB_HOUSEHOLD_CACHE_LIMIT: 500, WEB_MEMBER_CACHE_LIMIT: 500,
});
await mapperContext.savePull([], [pulledMember]);
const [webRetainedLink] = JSON.parse(storage.getItem("members"));
assert.equal(webRetainedLink.registry_uid, pulledMember.registry_uid);
assert.equal(webRetainedLink.registry_individual_id, pulledMember.registry_individual_id);
assert.equal(webRetainedLink.registry_status, pulledMember.registry_status);
sqlite.close();

console.log("Validated BLB registry cache rollback, scoped household browsing and name search, schema migration, and paged pull behavior.");
