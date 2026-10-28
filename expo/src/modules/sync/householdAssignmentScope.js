import { getOfflineDatabase } from "../storage/offlineDatabase.js";

const SCOPE_KEY = "assigned_household_scope";

export function getAssignedHouseholdIds(db = getOfflineDatabase()) {
  try {
    const user = JSON.parse(db.getFirstSync("SELECT value FROM sync_meta WHERE key = ?", ["auth_user"])?.value || "null");
    if (user?.role !== "field_worker") return null;
    const siteId = ["number", "string"].includes(typeof user.site_id) ? Number(user.site_id) : NaN;
    if (!Number.isInteger(siteId) || siteId <= 0) return [];
    const scope = JSON.parse(db.getFirstSync("SELECT value FROM sync_meta WHERE key = ?", [SCOPE_KEY])?.value || "null");
    const userId = user.user_id || user.id;
    if (!userId || !scope || scope.userId !== userId || !Array.isArray(scope.householdIds)) return [];
    // A site transfer must hide stale assignments before the next pull completes.
    return scope.householdIds.filter((householdId) => {
      const match = typeof householdId === "string" && /^(\d+)-\d{2}-[a-z0-9]{1,6}-\d{2}$/i.exec(householdId);
      return match && Number(match[1]) === siteId;
    });
  } catch {
    return [];
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
