import { getOfflineDatabase } from "../storage/offlineDatabase.js";

const SCOPE_KEY = "assigned_household_scope";

export function getAssignedHouseholdIds(db = getOfflineDatabase()) {
  try {
    const user = JSON.parse(db.getFirstSync("SELECT value FROM sync_meta WHERE key = ?", ["auth_user"])?.value || "null");
    const scope = JSON.parse(db.getFirstSync("SELECT value FROM sync_meta WHERE key = ?", [SCOPE_KEY])?.value || "null");
    if (user?.role !== "field_worker" || !scope || scope.userId !== (user.user_id || user.id)) return null;
    return Array.isArray(scope.householdIds) ? scope.householdIds : null;
  } catch {
    return null;
  }
}

export function saveAssignedHouseholdIds(user, householdIds, db = getOfflineDatabase()) {
  if (householdIds !== null && !Array.isArray(householdIds)) return;
  db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", [
    SCOPE_KEY,
    JSON.stringify({ userId: user?.user_id || user?.id, householdIds }),
  ]);
}

export function householdScopePredicate(column, householdIds) {
  return householdIds === null
    ? { sql: "1=1", params: [] }
    : { sql: `${column} IN (SELECT value FROM json_each(?))`, params: [JSON.stringify(householdIds)] };
}
