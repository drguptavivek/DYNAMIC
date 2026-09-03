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
  "study_sites",
  "study_villages",
  "sync_meta",
];

async function clearWebLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  // The web SQLite shim keeps its tables in memory after the first load; reset
  // that state too, or the next persist() writes the stale rows back after the
  // storage keys are removed.
  try {
    const webSqlite = await import("../../shims/expo-sqlite.web.js");
    if (typeof webSqlite.resetWebDatabase === "function") {
      webSqlite.resetWebDatabase();
    }
  } catch (error) {
    console.warn("Could not reset web sqlite state:", error);
  }
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

async function clearProtocolFormMemoryCaches() {
  // The in-memory protocol form caches (syncService's parsed-form cache and
  // runtimeFormCatalog's merged-form cache) key off objects/rows that are
  // about to be wiped from sync_meta / localStorage. Clear them too, or a
  // stale cached form would keep being served after a fresh login.
  try {
    const { clearProtocolFormCache } = await import("../sync/syncService.js");
    clearProtocolFormCache();
  } catch (error) {
    console.warn("Could not clear protocol form cache:", error);
  }
}

export async function clearLocalDeviceData() {
  await clearProtocolFormMemoryCaches();

  if (typeof window !== "undefined" && window.localStorage) {
    await clearWebLocalStorage();
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
