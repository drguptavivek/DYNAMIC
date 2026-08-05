import { getDb } from "../tasks/taskSchema.js";
import * as taskRepository from "../tasks/taskRepository.js";
import * as authStore from "../auth/authStore.js";
import { reconcilePulledTasks } from "../worklist/taskWorklistRepository.js";
import {
  clearHouseholdCacheForSync,
  getHouseholdCacheInfo,
  saveSyncedHouseholdsAndMembers,
} from "../households/householdRepository.js";
import { API_BASE_URL } from "./apiConfig.js";
import {
  buildPushRecords,
  collectAcceptedSyncIds,
  collectAssignedLocalityCodes,
  countOpenPulledTasks,
  selectChangedFormCodes,
  selectNextPullCursor,
  summarizeClockStatus,
} from "./syncWorkflow.js";

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
  authStore.storeUser(user);
  const localityCodes = collectAssignedLocalityCodes(user);
  setAssignedLocalities(localityCodes);
  return { user, localityCodes };
}

function emitProgress(onProgress, progress) {
  if (typeof onProgress === "function") {
    onProgress(progress);
  }
}

function shouldShowBatchProgress(batch, totalBatches, hasNextBatch = true) {
  return batch === 1 || batch % 50 === 0 || !hasNextBatch || batch === totalBatches;
}

export function getLastSyncAt() {
  const value = getMeta("last_sync_at");
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    setMeta("last_sync_at", "");
    return null;
  }

  return value;
}

function setLastSyncAt(timestamp) {
  try {
    setMeta("last_sync_at", timestamp);
  } catch (error) {
    console.error("Error setting last_sync_at:", error);
    throw error;
  }
}

function setClockMetadata(clock) {
  if (!clock || typeof clock !== "object") return null;

  const capturedAt = new Date().toISOString();
  const storedClock = {
    ...clock,
    checked_at_utc: capturedAt,
  };

  setMeta("sync_clock_metadata", JSON.stringify(storedClock));
  setMeta("sync_clock_checked_at_utc", capturedAt);

  if (typeof clock.server_time_utc === "string") {
    setMeta("sync_clock_server_time_utc", clock.server_time_utc);
  }
  if (typeof clock.device_time_utc === "string") {
    setMeta("sync_clock_device_time_utc", clock.device_time_utc);
  }
  if (typeof clock.server_device_delta_ms === "number") {
    setMeta("sync_clock_delta_ms", String(clock.server_device_delta_ms));
  }
  if (typeof clock.clock_status === "string") {
    setMeta("sync_clock_status", clock.clock_status);
  }

  return storedClock;
}

export function getClockStatus() {
  const value = getMeta("sync_clock_metadata");
  if (!value) return null;

  try {
    const clock = JSON.parse(value);
    return {
      ...summarizeClockStatus(clock),
      clock,
      checkedAt: clock.checked_at_utc || null,
      serverTimeUtc: clock.server_time_utc || null,
      deviceTimeUtc: clock.device_time_utc || null,
    };
  } catch (error) {
    console.error("Error parsing sync clock metadata:", error);
    setMeta("sync_clock_metadata", "");
    return null;
  }
}

export async function refreshServerClock() {
  const token = authStore.getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const clientTimeUtc = new Date().toISOString();
  const params = new URLSearchParams({ device_time_utc: clientTimeUtc });
  const response = await fetch(`${API_BASE_URL}/sync/time?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Time sync check failed: ${response.statusText}`);
  }

  const result = unwrapApiData(await response.json());
  setClockMetadata(result.clock);
  return getClockStatus();
}

function getCachedFormVersions() {
  const value = getMeta("form_versions");
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error parsing form_versions:", error);
    return [];
  }
}

function setCachedFormVersions(formVersions) {
  setMeta("form_versions", JSON.stringify(formVersions));
}

function cacheProtocolForms(forms) {
  for (const form of forms) {
    if (!form?.form_code || !form.json) continue;
    setMeta(`form_json_${String(form.form_code).toUpperCase()}`, JSON.stringify(form.json));
  }
}

export function getCachedProtocolForm(formCode) {
  const value = getMeta(`form_json_${String(formCode).toUpperCase()}`);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error("Error parsing cached protocol form:", error);
    return null;
  }
}

export async function refreshProtocolForms(formVersions = []) {
  if (!Array.isArray(formVersions) || formVersions.length === 0) {
    return { formsUpdated: 0 };
  }

  const changedCodes = selectChangedFormCodes(formVersions, getCachedFormVersions());
  if (changedCodes.length === 0) {
    return { formsUpdated: 0 };
  }

  const token = authStore.getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const params = new URLSearchParams({ codes: changedCodes.join(",") });
  const response = await fetch(`${API_BASE_URL}/protocol/forms/batch?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Form refresh failed: ${response.statusText}`);
  }

  const result = unwrapApiData(await response.json());
  const forms = Array.isArray(result.forms) ? result.forms : [];
  cacheProtocolForms(forms);
  setCachedFormVersions(formVersions);

  return { formsUpdated: forms.length };
}

export async function pullSync(options = {}) {
  const { onProgress } = options;
  const token = authStore.getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const lastSync = getLastSyncAt();
  const localities = getAssignedLocalities();

  const baseParams = new URLSearchParams();
  if (lastSync) {
    baseParams.append("since", lastSync);
  }
  if (localities.length > 0) {
    baseParams.append("locality_codes", localities.join(","));
  }
  baseParams.append("client_time_utc", new Date().toISOString());
  baseParams.append("include_members", "false");
  baseParams.append("page_size", "500");

  try {
    let nextPageToken = null;
    let pulledTasks = 0;
    let pulledOpenTasks = 0;
    let pulledHouseholds = 0;
    let pulledMembers = 0;
    let pulledEligibleWomen = 0;
    let pulledPregnancies = 0;
    let formsUpdated = 0;
    let lastData = null;
    let batch = 0;

    do {
      batch += 1;
      if (shouldShowBatchProgress(batch, 0)) {
        emitProgress(onProgress, {
          stage: "pull-households",
          message: `Fetching household batch ${batch}`,
          batch,
        pulledTasks,
        pulledHouseholds,
        pulledMembers,
        pulledEligibleWomen,
        pulledPregnancies,
        formsUpdated,
        });
      }
      const params = new URLSearchParams(baseParams);
      if (nextPageToken) {
        params.set("page_token", nextPageToken);
      }

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
      lastData = data;
      setClockMetadata(data.clock);
      const {
        households = [],
        tasks = [],
        eligible_women: eligibleWomen = [],
        pregnancies = [],
        form_versions: formVersions = [],
        protocol_config_version,
        total_households: totalHouseholds = 0,
        total_household_batches: totalHouseholdBatches = 0,
        household_batch_number: householdBatchNumber = batch,
      } = data;

      const showReceivedProgress = shouldShowBatchProgress(
        householdBatchNumber,
        totalHouseholdBatches,
        Boolean(data.next_page_token),
      );

      if (showReceivedProgress) {
        emitProgress(onProgress, {
          stage: "pull-households-received",
          message: `Fetched household batch ${householdBatchNumber} of ${totalHouseholdBatches || "?"}`,
          batch: householdBatchNumber,
          totalBatches: totalHouseholdBatches,
          totalHouseholds,
          currentHouseholds: households.length,
          pulledTasks,
          pulledHouseholds,
          pulledMembers,
          pulledEligibleWomen,
          pulledPregnancies,
          formsUpdated,
        });
      }

      if (households.length > 0) {
        if (showReceivedProgress) {
          emitProgress(onProgress, {
            stage: "pull-members",
            message: `Fetching members for batch ${householdBatchNumber} of ${totalHouseholdBatches || "?"}`,
            batch: householdBatchNumber,
            totalBatches: totalHouseholdBatches,
            totalHouseholds,
            currentHouseholds: households.length,
            pulledTasks,
            pulledHouseholds,
            pulledMembers,
            pulledEligibleWomen,
            pulledPregnancies,
            formsUpdated,
          });
        }
        const householdMembers = await pullMembersForHouseholds(
          token,
          households.map((household) => household.household_id),
        );
        await saveSyncedHouseholdsAndMembers(households, householdMembers);
        pulledHouseholds += households.length;
        pulledMembers += householdMembers.length;
      }

      if (tasks.length > 0) {
        reconcilePulledTasks(tasks);
        pulledTasks += tasks.length;
        pulledOpenTasks += countOpenPulledTasks(tasks);
      }

      if (eligibleWomen.length > 0) {
        taskRepository.saveEligibleWomenBatch(eligibleWomen);
        pulledEligibleWomen += eligibleWomen.length;
      }

      if (pregnancies.length > 0) {
        taskRepository.savePregnancyBatch(pregnancies);
        pulledPregnancies += pregnancies.length;
      }

      const formRefresh = await refreshProtocolForms(formVersions);
      formsUpdated += formRefresh.formsUpdated;
      if (protocol_config_version) {
        setMeta("protocol_config_version", protocol_config_version);
      }

      nextPageToken = data.next_page_token || null;
      if (shouldShowBatchProgress(householdBatchNumber, totalHouseholdBatches, Boolean(nextPageToken))) {
        emitProgress(onProgress, {
          stage: nextPageToken ? "pull-next" : "pull-complete",
          message: nextPageToken
            ? `Completed batch ${householdBatchNumber} of ${totalHouseholdBatches || "?"}; next update at batch ${Math.min(householdBatchNumber + 50, totalHouseholdBatches || householdBatchNumber + 50)}`
            : "All pull batches complete",
          batch: householdBatchNumber,
          totalBatches: totalHouseholdBatches,
          totalHouseholds,
          hasNextBatch: Boolean(nextPageToken),
          pulledTasks,
          pulledHouseholds,
          pulledMembers,
          pulledEligibleWomen,
          pulledPregnancies,
          formsUpdated,
        });
      }
    } while (nextPageToken);

    const nextCursor = lastData ? selectNextPullCursor(lastData, lastSync) : null;
    if (nextCursor) {
      setLastSyncAt(nextCursor);
    }

    return {
      pulled: pulledTasks,
      pulledOpenTasks,
      pulledHouseholds,
      pulledMembers,
      pulledEligibleWomen,
      pulledPregnancies,
      formsUpdated,
    };
  } catch (error) {
    console.error("Pull sync error:", error);
    throw error;
  }
}

async function pullMembersForHouseholds(token, householdIds) {
  if (!Array.isArray(householdIds) || householdIds.length === 0) return [];
  const response = await fetch(`${API_BASE_URL}/sync/pull/members`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ household_ids: householdIds }),
  });

  if (!response.ok) {
    throw new Error(`Pull household members failed: ${response.statusText}`);
  }

  const data = unwrapApiData(await response.json());
  return Array.isArray(data.household_members) ? data.household_members : [];
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
        client_time_utc: new Date().toISOString(),
        records,
      }),
    });

    if (!response.ok) {
      throw new Error(`Push sync failed: ${response.statusText}`);
    }

    const result = unwrapApiData(await response.json());
    setClockMetadata(result.clock);
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

export async function syncAll(options = {}) {
  const { onProgress } = options;
  try {
    emitProgress(onProgress, {
      stage: "clock-check",
      message: "Checking server time",
    });
    const clockStatus = await refreshServerClock();
    emitProgress(onProgress, {
      stage: "assignments",
      message: "Refreshing assigned localities",
      clockStatus,
    });
    const assignmentResult = await refreshAssignments();
    emitProgress(onProgress, {
      stage: "push",
      message: "Uploading pending records",
      localities: assignmentResult.localityCodes.length,
      clockStatus,
    });
    const pushResult = await pushSync();
    emitProgress(onProgress, {
      stage: "pull-start",
      message: "Starting household sync batches",
      localities: assignmentResult.localityCodes.length,
      pushed: pushResult.pushed,
      events: pushResult.events,
      clockStatus: getClockStatus(),
    });
    if (getHouseholdCacheInfo().isWebStorage) {
      emitProgress(onProgress, {
        stage: "clear-household-cache",
        message: "Clearing browser household cache",
        localities: assignmentResult.localityCodes.length,
        pushed: pushResult.pushed,
        events: pushResult.events,
      });
      clearHouseholdCacheForSync();
    }
    const pullResult = await pullSync({ onProgress });
    emitProgress(onProgress, {
      stage: "complete",
      message: "Sync complete",
      localities: assignmentResult.localityCodes.length,
      pushed: pushResult.pushed,
      events: pushResult.events,
      pulled: pullResult.pulled,
      pulledOpenTasks: pullResult.pulledOpenTasks,
      pulledHouseholds: pullResult.pulledHouseholds,
      pulledMembers: pullResult.pulledMembers,
      formsUpdated: pullResult.formsUpdated,
      clockStatus: getClockStatus(),
    });
    return {
      success: true,
      clockStatus: getClockStatus(),
      localities: assignmentResult.localityCodes.length,
      pulled: pullResult.pulled,
      pulledOpenTasks: pullResult.pulledOpenTasks,
      pulledHouseholds: pullResult.pulledHouseholds,
      pulledMembers: pullResult.pulledMembers,
      pushed: pushResult.pushed,
      events: pushResult.events,
      formsUpdated: pullResult.formsUpdated,
    };
  } catch (error) {
    console.error("Sync all error:", error);
    throw error;
  }
}
