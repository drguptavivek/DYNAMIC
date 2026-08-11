const WEB_STORAGE_KEYS = [
  "dynamic_web_sqlite_v1",
  "dynamic_web_sqlite_v2",
  "dynamic_households_v1",
  "dynamic_households_v2",
  "dynamic_households_v3",
  "dynamic_households_v4",
  "dynamic_household_members_v1",
  "dynamic_household_members_v2",
  "dynamic_household_members_v3",
  "dynamic_household_members_v4",
  "dynamic_questionnaire_drafts_v1",
  "dynamic_questionnaire_submissions_v1",
];

const NATIVE_TABLES_TO_CLEAR = [
  "domain_events_outbox",
  "task_attempts",
  "follow_up_tasks",
  "form_responses",
  "questionnaire_drafts",
  "eligible_women",
  "pregnancies",
  "form_submissions",
  "household_members",
  "households",
  "sync_meta",
];

function clearWebLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  for (const key of WEB_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
}

async function clearNativeSqlite() {
  const { getOfflineDatabase } = await import("./offlineDatabase.js");
  const db = getOfflineDatabase();
  for (const table of NATIVE_TABLES_TO_CLEAR) {
    try {
      await db.execAsync(`DELETE FROM ${table};`);
    } catch (error) {
      if (!String(error?.message || "").toLowerCase().includes("no such table")) {
        console.warn(`Could not clear local table ${table}:`, error);
      }
    }
  }
}

export async function clearLocalDeviceData() {
  if (typeof window !== "undefined" && window.localStorage) {
    clearWebLocalStorage();
    return;
  }

  await clearNativeSqlite();
}

export function getLocalDeviceDataResetKeysForTests() {
  return {
    webStorageKeys: [...WEB_STORAGE_KEYS],
    nativeTablesToClear: [...NATIVE_TABLES_TO_CLEAR],
  };
}
