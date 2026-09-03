/**
 * Household/member sync fetcher - fetches household and member data using sync SQLite API
 * Bridges the gap between householdRepository (async) and taskSchema (sync)
 */

import { getDb } from "../modules/tasks/taskSchema.js";

/**
 * Fetch household data by ID using sync API
 * @param {string} householdId - The household ID to fetch
 * @returns {object|null} Household data or null if not found
 */
export function getHouseholdSync(householdId) {
  const db = getDb();
  if (!db) return null;

  try {
    const household = db.getFirstSync(`SELECT * FROM households WHERE household_id = ?`, [
      householdId,
    ]);
    return household || null;
  } catch (error) {
    console.error("Error fetching household:", error);
    return null;
  }
}

/**
 * Fetch multiple households by id in one (or a few, chunked) query.
 * Dedupes and drops nullish ids, chunks to respect the SQLite bound-variable
 * limit, and returns a Map keyed by household_id for O(1) lookups.
 * @param {Array<string>} householdIds - The household IDs to fetch
 * @returns {Map<string, object>} Map of household_id -> household row
 */
export function getHouseholdsByIdsSync(householdIds) {
  const result = new Map();
  if (!Array.isArray(householdIds) || householdIds.length === 0) return result;

  const uniqueIds = Array.from(
    new Set(householdIds.filter((id) => id !== null && id !== undefined))
  );
  if (uniqueIds.length === 0) return result;

  const db = getDb();
  if (!db) return result;

  const CHUNK_SIZE = 500;
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    try {
      const rows = db.getAllSync(
        `SELECT * FROM households WHERE household_id IN (${placeholders})`,
        chunk
      );
      for (const row of rows || []) {
        result.set(row.household_id, row);
      }
    } catch (error) {
      console.error("Error fetching households by ids:", error);
    }
  }

  return result;
}

/**
 * Fetch household member data by ID using sync API
 * @param {string} memberId - The household member ID to fetch
 * @returns {object|null} Member data or null if not found
 */
export function getHouseholdMemberSync(memberId) {
  const db = getDb();
  if (!db) return null;

  try {
    const member = db.getFirstSync(`SELECT * FROM household_members WHERE individual_id = ?`, [
      memberId,
    ]);
    return member || null;
  } catch (error) {
    console.error("Error fetching household member:", error);
    return null;
  }
}

/**
 * Count registered members for a household using the sync SQLite cache.
 * @param {string} householdId - The household ID
 * @returns {number|null} Member count, or null if the cache is unavailable
 */
export function getHouseholdMemberCountSync(householdId) {
  if (!householdId) return null;
  const db = getDb();
  if (!db) return null;

  try {
    const row = db.getFirstSync(
      "SELECT COUNT(*) AS member_count FROM household_members WHERE household_id = ?",
      [householdId]
    );
    return Number(row?.member_count || 0);
  } catch (error) {
    console.error("Error counting household members:", error);
    return null;
  }
}

/**
 * Fetch household and member data together
 * @param {string} householdId - The household ID
 * @param {string} memberId - Optional household member ID
 * @returns {object} Object with household and member data
 */
export function getHouseholdContextSync(householdId, memberId) {
  const household = getHouseholdSync(householdId);
  let member = null;

  if (memberId) {
    member = getHouseholdMemberSync(memberId);
  }

  return { household, member };
}
