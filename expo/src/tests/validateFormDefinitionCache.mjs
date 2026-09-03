/**
 * Verifies the caches added to stop re-reading, re-parsing, and re-cloning
 * questionnaire form definitions on every questionnaire open:
 *  - syncService.getCachedProtocolForm only reads/parses the (200-350 KB)
 *    form_json_<CODE> row from sync_meta when its version stamp changes, not
 *    on every call, and clearProtocolFormCache() forces a fresh read.
 *  - runtimeFormCatalog.getRuntimeFormByCode only re-runs the
 *    preserveClientRendererMetadata deep-clone/merge when the cached form
 *    object actually changes.
 *  - getPreparedSurveyJson's cached prepared survey JSON is never mutated by
 *    downstream consumers (applyHouseholdMasterChoices, `new Model()`), so
 *    sharing it across repeated questionnaire opens is safe.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

import { createFakeSqliteDb } from "./helpers/createFakeSqliteDb.mjs";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const testRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * A stateful fake `sync_meta` table (key/value) backing getMeta/setMeta in
 * syncService.js, plus a call log so tests can assert exactly how many times
 * a given meta key was read.
 */
function createMetaDb() {
  const store = new Map();
  const calls = [];

  return {
    calls,
    store,
    seed(key, value) {
      store.set(key, value);
    },
    getFirstSync(sql, params = []) {
      calls.push({ method: "getFirstSync", sql, params });
      if (/SELECT value FROM sync_meta/.test(sql)) {
        const key = params[0];
        return store.has(key) ? { value: store.get(key) } : null;
      }
      return null;
    },
    getAllSync(sql, params = []) {
      calls.push({ method: "getAllSync", sql, params });
      return [];
    },
    runSync(sql, params = []) {
      calls.push({ method: "runSync", sql, params });
      if (/INSERT OR REPLACE INTO sync_meta/.test(sql)) {
        const [key, value] = params;
        store.set(key, value);
      }
      return { changes: 0 };
    },
  };
}

function metaReadCount(calls, key) {
  return calls.filter(
    (call) => call.method === "getFirstSync" && call.params?.[0] === key,
  ).length;
}

// syncService.js transitively imports authStore.js, which imports
// "react-native" and "expo-application" directly at module scope. Those
// packages aren't loadable under plain tsx/node (react-native's source uses
// Flow syntax esbuild can't parse), so pre-populate Node's CJS module cache
// with minimal fakes for them - the same trick stubOfflineDatabase.mjs uses
// for offlineDatabase.js - before syncService.js (or anything requiring it)
// is required.
function stubNativeModules(require) {
  const Module = require("module");
  function stubModule(specifier, exportsObj) {
    const resolved = require.resolve(specifier);
    const fakeModule = new Module(resolved);
    fakeModule.filename = resolved;
    fakeModule.loaded = true;
    fakeModule.exports = exportsObj;
    Module._cache[resolved] = fakeModule;
  }
  stubModule("react-native", { Platform: { OS: "ios", select: (obj) => obj.ios } });
  stubModule("expo-application", {});
}

// syncService.js/taskSchema.js/runtimeFormCatalog.js get cached by Node's
// CJS require() after the first load, which would otherwise pin every block
// below to whichever fakeDb was stubbed first. Force a fresh require of the
// whole chain per block so each block's fakeDb is the one actually wired
// through getDb().
function loadSyncService(fakeDb) {
  const require = stubOfflineDatabase(fakeDb, import.meta.url);
  stubNativeModules(require);
  for (const relativePath of [
    "../modules/tasks/taskSchema.js",
    "../modules/tasks/taskRepository.js",
    "../modules/sync/syncService.js",
  ]) {
    const resolved = require.resolve(relativePath);
    delete require.cache[resolved];
  }
  return require("../modules/sync/syncService.js");
}

function loadRuntimeFormCatalog(fakeDb) {
  const require = stubOfflineDatabase(fakeDb, import.meta.url);
  stubNativeModules(require);
  for (const relativePath of [
    "../modules/tasks/taskSchema.js",
    "../modules/tasks/taskRepository.js",
    "../modules/sync/syncService.js",
    "../data/runtimeFormCatalog.js",
  ]) {
    const resolved = require.resolve(relativePath);
    delete require.cache[resolved];
  }
  return require("../data/runtimeFormCatalog.js");
}

// ---------------------------------------------------------------------------
// (a) getCachedProtocolForm hits SQLite once across repeated calls with an
//     unchanged stamp, and re-reads after a version change and after
//     clearProtocolFormCache().
// ---------------------------------------------------------------------------
{
  const fakeDb = createMetaDb();
  fakeDb.seed(
    "form_versions",
    JSON.stringify([{ form_code: "HHQ", checksum: "checksum-v1" }]),
  );
  fakeDb.seed("form_json_HHQ", JSON.stringify({ form_code: "HHQ", pages: [{ name: "page1", elements: [] }] }));

  const { getCachedProtocolForm, clearProtocolFormCache } = loadSyncService(fakeDb);

  const first = getCachedProtocolForm("hhq");
  const second = getCachedProtocolForm("hhq");
  const third = getCachedProtocolForm("HHQ");
  assert.equal(metaReadCount(fakeDb.calls, "form_json_HHQ"), 1, "unchanged stamp should read SQLite once");
  assert.equal(first, second, "unchanged stamp should return the identical cached object");
  assert.equal(second, third, "code normalization should not bypass the cache");

  // Simulate a sync writing a new version of the form.
  fakeDb.seed(
    "form_versions",
    JSON.stringify([{ form_code: "HHQ", checksum: "checksum-v2" }]),
  );
  fakeDb.seed("form_json_HHQ", JSON.stringify({ form_code: "HHQ", pages: [{ name: "page1", elements: [{ name: "q1" }] }] }));

  const afterVersionChange = getCachedProtocolForm("HHQ");
  assert.equal(metaReadCount(fakeDb.calls, "form_json_HHQ"), 2, "a changed checksum should force a re-read");
  assert.notEqual(afterVersionChange, first, "a changed checksum should return a freshly parsed object");
  assert.deepEqual(afterVersionChange.pages[0].elements, [{ name: "q1" }]);

  const stillCached = getCachedProtocolForm("HHQ");
  assert.equal(metaReadCount(fakeDb.calls, "form_json_HHQ"), 2, "unchanged stamp after the version bump should not re-read");
  assert.equal(stillCached, afterVersionChange);

  clearProtocolFormCache();
  const afterClear = getCachedProtocolForm("HHQ");
  assert.equal(
    metaReadCount(fakeDb.calls, "form_json_HHQ"),
    3,
    "clearProtocolFormCache should force a re-read even with an unchanged checksum",
  );
  assert.notEqual(afterClear, afterVersionChange, "clearProtocolFormCache should hand back a freshly parsed object");
  assert.deepEqual(afterClear, afterVersionChange, "the freshly parsed object should still match the stored JSON");
}

// ---------------------------------------------------------------------------
// (a2) Legacy fallback: form_json exists but form_versions has no entry for
//      that code - falls back to the old raw-string comparison once, then
//      caches (without re-reading SQLite again) until explicitly cleared.
// ---------------------------------------------------------------------------
{
  const fakeDb = createMetaDb();
  fakeDb.seed("form_versions", JSON.stringify([{ form_code: "OTHER", checksum: "x" }]));
  fakeDb.seed("form_json_WQ", JSON.stringify({ form_code: "WQ", pages: [] }));

  const { getCachedProtocolForm, clearProtocolFormCache } = loadSyncService(fakeDb);

  const first = getCachedProtocolForm("WQ");
  const second = getCachedProtocolForm("WQ");
  assert.equal(metaReadCount(fakeDb.calls, "form_json_WQ"), 1, "the legacy path should read SQLite once, not per call");
  assert.equal(first, second);

  // Without a checksum, there's no cheap stamp to notice a change with, so a
  // raw update alone must not be picked up until the cache is invalidated.
  fakeDb.seed("form_json_WQ", JSON.stringify({ form_code: "WQ", pages: [{ name: "p1", elements: [] }] }));
  const stillCached = getCachedProtocolForm("WQ");
  assert.equal(metaReadCount(fakeDb.calls, "form_json_WQ"), 1, "the legacy path should not re-read on its own");
  assert.equal(stillCached, first);

  clearProtocolFormCache();
  const afterClear = getCachedProtocolForm("WQ");
  assert.equal(metaReadCount(fakeDb.calls, "form_json_WQ"), 2, "clearProtocolFormCache should force a fresh legacy read");
  assert.notEqual(afterClear, first);
  assert.deepEqual(afterClear.pages, [{ name: "p1", elements: [] }]);
}

// ---------------------------------------------------------------------------
// (b) getRuntimeFormByCode memoizes the merged result and only recomputes it
//     when the underlying cached form object changes.
// ---------------------------------------------------------------------------
{
  const fakeDb = createMetaDb();
  const bundledLikeForm = {
    form_code: "HHQ",
    pages: [
      {
        name: "page1",
        elements: [{ name: "hhq_household_number", type: "text", renderAs: "db_check" }],
      },
    ],
  };
  fakeDb.seed("form_versions", JSON.stringify([{ form_code: "HHQ", checksum: "checksum-v1" }]));
  fakeDb.seed(
    "form_json_HHQ",
    JSON.stringify({
      form_code: "HHQ",
      pages: [{ name: "page1", elements: [{ name: "hhq_household_number", type: "text" }] }],
    }),
  );

  const { getRuntimeFormByCode } = loadRuntimeFormCatalog(fakeDb);

  const first = getRuntimeFormByCode("HHQ");
  const second = getRuntimeFormByCode("HHQ");
  assert.equal(first, second, "an unchanged cached form should return the identical merged object");
  assert.ok(first, "expected a merged runtime form");

  fakeDb.seed(
    "form_versions",
    JSON.stringify([{ form_code: "HHQ", checksum: "checksum-v2" }]),
  );
  fakeDb.seed(
    "form_json_HHQ",
    JSON.stringify({
      form_code: "HHQ",
      pages: [{ name: "page1", elements: [{ name: "hhq_household_number", type: "text" }, { name: "new_q" }] }],
    }),
  );
  const third = getRuntimeFormByCode("HHQ");
  assert.notEqual(third, first, "a changed cached form should recompute the merged result");
  void bundledLikeForm;
}

// ---------------------------------------------------------------------------
// (c) getPreparedSurveyJson's cached surveyJson survives applyHouseholdMasterChoices
//     and `new Model()` unmutated: preparing once and reusing it across two
//     "opens" is safe.
// ---------------------------------------------------------------------------
{
  const { prepareQuestionnaireSurveyJson, getPreparedSurveyJson } = await import(
    "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
  );
  const { applyHouseholdMasterChoices } = await import("../lib/householdMasterChoices.js");

  const hhqPath = path.resolve(
    testRoot,
    "../data/forms/baseline_household_questionnaire_v2026.05.09.json",
  );
  const hhqForm = JSON.parse(fs.readFileSync(hhqPath, "utf8"));

  const preparedFirstCall = getPreparedSurveyJson(hhqForm);
  const preparedSecondCall = getPreparedSurveyJson(hhqForm);
  assert.equal(
    preparedFirstCall,
    preparedSecondCall,
    "getPreparedSurveyJson should memoize per form object",
  );

  const user = { site_id: 2, area_assignments: [{ site_id: 2, locality_code: "01", active_to: null }] };
  const localities = [{ site_id: 2, locality_code: "01", locality_name: "Ajronda" }];

  const surveyJson = applyHouseholdMasterChoices(preparedFirstCall, { user, localities });
  const model = new Model(surveyJson);
  model.setValue("hhq_household_number", "12345");
  model.setValue("hhq_site_id", 2);

  const freshPrepared = prepareQuestionnaireSurveyJson(hhqForm);
  assert.deepEqual(
    preparedFirstCall,
    freshPrepared,
    "building a Model and running applyHouseholdMasterChoices must not mutate the cached prepared surveyJson",
  );

  // A second "open" reusing the same cached surveyJson must behave the same
  // way as the first - i.e. nothing from the first Model leaked into it.
  const secondSurveyJson = applyHouseholdMasterChoices(getPreparedSurveyJson(hhqForm), { user, localities });
  const secondModel = new Model(secondSurveyJson);
  assert.equal(secondModel.getValue("hhq_household_number"), undefined);
}

// ---------------------------------------------------------------------------
// Sanity: localDeviceDataReset.js actually wires up clearProtocolFormCache so
// the new caches are invalidated on logout/reset.
// ---------------------------------------------------------------------------
{
  const require = createRequire(import.meta.url);
  const resetSource = fs.readFileSync(
    require.resolve("../modules/storage/localDeviceDataReset.js"),
    "utf8",
  );
  assert.match(
    resetSource,
    /clearProtocolFormCache/,
    "localDeviceDataReset.js should clear the protocol form cache",
  );
}

console.log("Form definition cache validation passed");
