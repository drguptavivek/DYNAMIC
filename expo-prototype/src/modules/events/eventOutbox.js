/**
 * Domain events outbox - stores events for eventual sync to server
 * Uses the same sync SQLite API as taskSchema
 */

import { getDb } from "../tasks/taskSchema.js";

/**
 * Get all pending events waiting to be synced
 * @returns {array} Array of pending events
 */
export function getPendingEvents() {
  const db = getDb();
  try {
    const rows = db.getAllSync(
      "SELECT * FROM domain_events_outbox WHERE sync_status = 'pending' ORDER BY created_at ASC",
      [],
    );
    return (rows || []).map((row) => ({
      ...row,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    }));
  } catch (error) {
    console.error("Error getting pending events:", error);
    throw error;
  }
}

/**
 * Mark an event as synced
 * @param {string} eventId - ID of the event to mark as synced
 */
export function markEventSynced(eventId) {
  const db = getDb();
  const now = new Date().toISOString();

  try {
    db.runSync("UPDATE domain_events_outbox SET sync_status = ?, updated_at = ? WHERE id = ?", [
      "synced",
      now,
      eventId,
    ]);
  } catch (error) {
    console.error("Error marking event as synced:", error);
    throw error;
  }
}

/**
 * Delete synced events (cleanup after successful sync)
 * @returns {number} Number of events deleted
 */
export function deleteSyncedEvents() {
  const db = getDb();
  try {
    const result = db.runSync("DELETE FROM domain_events_outbox WHERE sync_status = 'synced'");
    return result.changes || 0;
  } catch (error) {
    console.error("Error deleting synced events:", error);
    throw error;
  }
}

/**
 * Get all synced events
 * @returns {array} Array of synced events
 */
export function getSyncedEvents() {
  const db = getDb();
  try {
    const rows = db.getAllSync(
      "SELECT * FROM domain_events_outbox WHERE sync_status = 'synced' ORDER BY created_at DESC",
      [],
    );
    return (rows || []).map((row) => ({
      ...row,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    }));
  } catch (error) {
    console.error("Error getting synced events:", error);
    throw error;
  }
}
