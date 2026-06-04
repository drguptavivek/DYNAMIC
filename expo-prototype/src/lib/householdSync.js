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
