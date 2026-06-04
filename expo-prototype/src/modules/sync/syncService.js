import { getDb } from "../tasks/taskSchema.js";
import * as taskRepository from "../tasks/taskRepository.js";
import * as authStore from "../auth/authStore.js";
import {
  buildPushRecords,
  collectAcceptedSyncIds,
  collectAssignedLocalityCodes,
} from "./syncWorkflow.js";

const API_BASE_URL = "http://localhost:3000/api/v1";

function unwrapApiData(payload) {
  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

function getMeta(key) {
  const db = getDb();
  try {
    const row = db.getFirstSync("SELECT value FROM sync_meta WHERE key = ?", [key]);
    return row?.value || null;
  } catch (error) {
    console.error("Error getting meta:", error);
    return null;
  }
}

function setMeta(key, value) {
  const db = getDb();
  try {
    db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", [key, value]);
  } catch (error) {
    console.error("Error setting meta:", error);
    throw error;
  }
}

export function getAssignedLocalities() {
  const value = getMeta("assigned_localities");
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch (e) {
    console.error("Error parsing assigned_localities:", e);
    return [];
  }
}

export function setAssignedLocalities(codes) {
  try {
    setMeta("assigned_localities", JSON.stringify(codes));
  } catch (error) {
    console.error("Error setting assigned_localities:", error);
    throw error;
  }
}

export async function refreshAssignments() {
  const token = authStore.getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE_URL}/users/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Assignment refresh failed: ${response.statusText}`);
  }

  const user = unwrapApiData(await response.json());
  const localityCodes = collectAssignedLocalityCodes(user);
  setAssignedLocalities(localityCodes);
  return { user, localityCodes };
}

export function getLastSyncAt() {
  return getMeta("last_sync_at") || null;
}

function setLastSyncAt(timestamp) {
  try {
    setMeta("last_sync_at", timestamp);
  } catch (error) {
    console.error("Error setting last_sync_at:", error);
    throw error;
  }
}

export async function pullSync() {
  const token = authStore.getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const lastSync = getLastSyncAt();
  const localities = getAssignedLocalities();

  const params = new URLSearchParams();
  if (lastSync) {
    params.append("since", lastSync);
  }
  if (localities.length > 0) {
    params.append("locality_codes", localities.join(","));
  }

  try {
    const response = await fetch(`${API_BASE_URL}/sync/pull?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Pull sync failed: ${response.statusText}`);
    }

    const data = unwrapApiData(await response.json());
    const { tasks = [] } = data;

    if (tasks.length > 0) {
      await taskRepository.saveTaskBatch(tasks);
    }

    const now = new Date().toISOString();
    setLastSyncAt(now);

    return { pulled: tasks.length };
  } catch (error) {
    console.error("Pull sync error:", error);
    throw error;
  }
}

export async function pushSync() {
  const token = authStore.getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const pending = taskRepository.getPendingResponses();
  const { getPendingEvents } = await import("../events/eventOutbox.js");
  const pendingEvents = getPendingEvents();

  if (pending.length === 0 && pendingEvents.length === 0) {
    return { pushed: 0, events: 0 };
  }

  try {
    const records = buildPushRecords({
      formResponses: pending,
      domainEvents: pendingEvents,
    });

    const deviceId = getMeta("device_id") || "unregistered-device";
    const response = await fetch(`${API_BASE_URL}/sync/push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_id: deviceId,
        records,
      }),
    });

    if (!response.ok) {
      throw new Error(`Push sync failed: ${response.statusText}`);
    }

    const result = unwrapApiData(await response.json());
    const acceptedIds = collectAcceptedSyncIds(result);
    const serverErrors = Array.isArray(result.errors) ? result.errors : [];

    for (const item of pending) {
      if (acceptedIds.has(item.id)) {
        await taskRepository.markResponseSynced(item.id);
      }
    }

    const { markEventSynced } = await import("../events/eventOutbox.js");
    for (const event of pendingEvents) {
      if (acceptedIds.has(event.id)) {
        markEventSynced(event.id);
      }
    }

    if (serverErrors.length > 0) {
      const errorText = serverErrors.map((item) => `${item.id}: ${item.error}`).join("; ");
      throw new Error(`Push sync accepted ${acceptedIds.size} records with errors: ${errorText}`);
    }

    const acceptedResponses = pending.filter((item) => acceptedIds.has(item.id)).length;
    const acceptedEvents = pendingEvents.filter((event) => acceptedIds.has(event.id)).length;

    return { pushed: acceptedResponses, events: acceptedEvents };
  } catch (error) {
    console.error("Push sync error:", error);
    throw error;
  }
}

export async function syncAll() {
  try {
    const assignmentResult = await refreshAssignments();
    const pushResult = await pushSync();
    const pullResult = await pullSync();
    return {
      success: true,
      localities: assignmentResult.localityCodes.length,
      pulled: pullResult.pulled,
      pushed: pushResult.pushed,
      events: pushResult.events,
    };
  } catch (error) {
    console.error("Sync all error:", error);
    throw error;
  }
}
