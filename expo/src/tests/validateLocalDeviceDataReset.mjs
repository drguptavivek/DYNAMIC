import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import {
  clearLocalDeviceData,
  getLocalDeviceDataResetKeysForTests,
} from "../modules/storage/localDeviceDataReset.js";

const backingStore = new Map();
global.window = {
  localStorage: {
    getItem: (key) => backingStore.get(key) || null,
    setItem: (key, value) => backingStore.set(key, String(value)),
    removeItem: (key) => backingStore.delete(key),
  },
};

const { webStorageKeys, nativeTablesToClear } = getLocalDeviceDataResetKeysForTests();

for (const key of [
  "dynamic_web_sqlite_v2",
  "dynamic_households_v4",
  "dynamic_household_members_v4",
  "dynamic_questionnaire_drafts_v1",
  "dynamic_questionnaire_submissions_v1",
]) {
  assert.ok(webStorageKeys.includes(key), `logout should clear web storage key ${key}`);
}

for (const table of [
  "follow_up_tasks",
  "task_attempts",
  "form_responses",
  "questionnaire_drafts",
  "eligible_women",
  "pregnancies",
  "domain_events_outbox",
  "form_submissions",
  "household_members",
  "households",
  "study_sites",
  "study_villages",
  "sync_meta",
]) {
  assert.ok(nativeTablesToClear.includes(table), `logout should clear native table ${table}`);
}

const authStoreSource = readFileSync(
  new URL("../modules/auth/authStore.js", import.meta.url),
  "utf8",
);
const loginWipes = authStoreSource.match(
  /await clearLocalDeviceData\(\);/g,
) || [];
assert.ok(
  loginWipes.length >= 3,
  "login, QR login, and rejected session restore must all wipe local device data",
);
assert.match(
  authStoreSource,
  /\/auth\/refresh/,
  "restoreSession must refresh an expired access token before forcing logout",
);
assert.match(
  authStoreSource,
  /refreshed\.definitive[\s\S]*await clearLocalDeviceData\(\)/,
  "restoreSession must wipe local data only after definitive refresh rejection",
);

for (const key of webStorageKeys) {
  window.localStorage.setItem(key, "cached");
}

await clearLocalDeviceData();

for (const key of webStorageKeys) {
  assert.equal(window.localStorage.getItem(key), null, `logout should remove ${key}`);
}

console.log("Local device data reset validation passed.");
