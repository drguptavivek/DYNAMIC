import { recordServerTime } from "./trustedClock.js";
import { startTiming } from "../../lib/perfLog.js";
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
import { CHUNK_SIZE, forEachChunk } from "../../lib/yieldToUi.js";
import {
  buildPushRecords,
  classifyDraftSyncErrors,
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

function getLastFormResponseSyncAt() {
  const value = getMeta("last_form_response_sync_at");
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    setMeta("last_form_response_sync_at", "");
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

function setLastFormResponseSyncAt(timestamp) {
  try {
    setMeta("last_form_response_sync_at", timestamp);
  } catch (error) {
    console.error("Error setting last_form_response_sync_at:", error);
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
    // Server time is the strongest evidence of "real" time; raise the
    // device's trusted high-water mark so a later rewind is detectable.
    recordServerTime(clock.server_time_utc).catch(() => {});
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
    setMeta(`form_json_${String(form.form_code).toUpperCase()}`, JSON.stringify(form.json));
  }
  // Bump the generation so getCachedProtocolForm's stamp check below no
  // longer matches, forcing a fresh SQLite read for whatever codes changed
  // (and, harmlessly, for any code sharing the same checksum-less state).
  protocolFormCacheGeneration += 1;
}

// getCachedProtocolForm reads a 200-350 KB JSON blob from sync_meta. It is
// called on every questionnaire open (often twice - see
// runtimeFormCatalog.getRuntimeFormByCode), so the parsed result is cached
// per form code behind a cheap "stamp": the checksum recorded for that code
// in form_versions plus a module-level generation counter bumped whenever
// cacheProtocolForms() writes new form JSON. SQLite is only touched again
// when the stamp changes (or the cache is empty/cleared).
let protocolFormCacheGeneration = 0;
const protocolFormCache = new Map();

export function getCachedProtocolForm(formCode) {
  const normalizedCode = String(formCode || "").toUpperCase();
  const metaKey = `form_json_${normalizedCode}`;
  const versionEntry = getCachedFormVersions().find(
    (entry) => String(entry?.form_code).toUpperCase() === normalizedCode,
  );
  const checksum = versionEntry?.checksum || null;
  const cached = protocolFormCache.get(metaKey);

  if (checksum) {
    const stamp = `${checksum}:${protocolFormCacheGeneration}`;
    if (cached && cached.stamp === stamp) {
      return cached.parsed;
    }
    const value = getMeta(metaKey);
    if (!value) {
      protocolFormCache.delete(metaKey);
      return null;
    }
    try {
      const parsed = JSON.parse(value);
      protocolFormCache.set(metaKey, { stamp, raw: value, parsed });
      return parsed;
    } catch (error) {
      console.error("Error parsing cached protocol form:", error);
      return null;
    }
  }

  // Legacy fallback: form_versions has no checksum entry for this code (e.g.
  // a form cached before form_versions existed, or synced out of band), so
  // there's no cheap stamp to compare against. Do the old raw-string read
  // and compare only once (a cache miss, i.e. first call or right after
  // clearProtocolFormCache); once resolved, trust the cache without hitting
  // SQLite again until it's explicitly invalidated.
  const legacyStamp = `legacy:${protocolFormCacheGeneration}`;
  if (cached && cached.stamp === legacyStamp) {
    return cached.parsed;
  }
  const value = getMeta(metaKey);
  if (!value) {
    protocolFormCache.delete(metaKey);
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    protocolFormCache.set(metaKey, { stamp: legacyStamp, raw: value, parsed });
    return parsed;
  } catch (error) {
    console.error("Error parsing cached protocol form:", error);
    return null;
  }
}

export function clearProtocolFormCache() {
  protocolFormCache.clear();
  protocolFormCacheGeneration += 1;
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
  const responseStatusBackfillNeeded = getMeta("form_response_status_backfill_v1") !== "complete";
  const lastFormResponseSync = responseStatusBackfillNeeded ? null : getLastFormResponseSyncAt();
  const localities = getAssignedLocalities();
  const currentUser = authStore.getUser();
  const isFieldWorker = currentUser?.role === "field_worker";

  const baseParams = new URLSearchParams();
  baseParams.set("device_id", getMeta("device_id") || "unregistered-device");
  if (lastSync) {
    baseParams.append("since", lastSync);
  }
  baseParams.append("form_response_since", lastFormResponseSync || new Date(0).toISOString());
  // Field-worker household assignments are the authoritative scope for pull.
  // Locality assignments are only a legacy fallback and can omit newly
  // assigned households (especially after bulk assignment).
  if (localities.length > 0 && !isFieldWorker) {
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
    let pulledFormResponses = 0;
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
        pulledFormResponses,
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
        form_responses: formResponses = [],
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
          pulledFormResponses,
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
            pulledFormResponses,
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
        await forEachChunk(tasks, CHUNK_SIZE, async (chunk) => {
          reconcilePulledTasks(chunk);
        });
        pulledTasks += tasks.length;
        pulledOpenTasks += countOpenPulledTasks(tasks);
      }

      if (eligibleWomen.length > 0) {
        await forEachChunk(eligibleWomen, CHUNK_SIZE, async (chunk) => {
          taskRepository.saveEligibleWomenBatch(chunk);
        });
        pulledEligibleWomen += eligibleWomen.length;
      }

      if (pregnancies.length > 0) {
        await forEachChunk(pregnancies, CHUNK_SIZE, async (chunk) => {
          taskRepository.savePregnancyBatch(chunk);
        });
        pulledPregnancies += pregnancies.length;
      }

      if (formResponses.length > 0) {
        await forEachChunk(formResponses, CHUNK_SIZE, async (chunk) => {
          pulledFormResponses += taskRepository.saveSyncedFormResponsesBatch(chunk);
        });
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
          pulledFormResponses,
          formsUpdated,
        });
      }
    } while (nextPageToken);

    const nextCursor = lastData ? selectNextPullCursor(lastData, lastSync) : null;
    if (nextCursor) {
      setLastSyncAt(nextCursor);
      setLastFormResponseSyncAt(nextCursor);
    }
    if (responseStatusBackfillNeeded) {
      setMeta("form_response_status_backfill_v1", "complete");
    }

    return {
      pulled: pulledTasks,
      pulledOpenTasks,
      pulledHouseholds,
      pulledMembers,
      pulledEligibleWomen,
      pulledPregnancies,
      pulledFormResponses,
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

const PUSH_FORM_RESPONSE_BATCH_SIZE = 100;

async function pushRecordBatch({ token, deviceId, formResponses = [], domainEvents = [] }) {
  const records = buildPushRecords({ formResponses, domainEvents });
  if (records.length === 0) {
    return { pushed: 0, events: 0, uploadErrors: 0 };
  }

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
  const serverDuplicates = Array.isArray(result.duplicates) ? result.duplicates : [];
  const classifiedRecords = Array.isArray(result.classified_records) ? result.classified_records : [];
  const uploadErrorById = new Map();

  for (const id of serverDuplicates) {
    uploadErrorById.set(id, "Record already exists on the server");
  }
  for (const item of classifiedRecords) {
    if (!item?.id) continue;
    const status = item.status || "upload_error";
    if (status === "duplicate" || status === "held_for_review" || status === "invalid_rejected") {
      uploadErrorById.set(item.id, item.error || `Server classified this form as ${status}`);
    }
  }
  for (const item of serverErrors) {
    if (item?.id) {
      uploadErrorById.set(item.id, item.error || "Server rejected this form");
    }
  }

  const uploadErrorItems = [];
  const syncedIds = [];
  for (const item of formResponses) {
    if (uploadErrorById.has(item.id)) {
      uploadErrorItems.push({ id: item.id, message: uploadErrorById.get(item.id) });
    } else if (acceptedIds.has(item.id)) {
      syncedIds.push(item.id);
    }
  }

  taskRepository.markResponsesUploadErrorBatch(uploadErrorItems);
  taskRepository.markResponsesSyncedBatch(syncedIds);
  const { markQuestionnaireSubmissionSynced, markQuestionnaireSubmissionUploadError } =
    await import("../questionnaires/questionnaireSubmissionRepository.js");
  for (const item of uploadErrorItems) {
    markQuestionnaireSubmissionUploadError(item.id, item.message);
  }
  for (const id of syncedIds) {
    markQuestionnaireSubmissionSynced(id);
  }

  const { markEventSynced } = await import("../events/eventOutbox.js");
  const pendingEventIds = new Set(domainEvents.map((event) => event.id));
  const handledEventErrorIds = new Set();
  for (const event of domainEvents) {
    if (acceptedIds.has(event.id)) {
      markEventSynced(event.id);
    }
  }

  for (const item of serverErrors) {
    const message = String(item?.error || "");
    if (
      item?.id &&
      pendingEventIds.has(item.id) &&
      message.includes("Domain event does not match a server-promoted canonical event")
    ) {
      markEventSynced(item.id);
      handledEventErrorIds.add(item.id);
    }
  }

  const unhandledErrors = serverErrors.filter(
    (item) =>
      !formResponses.some((responseItem) => responseItem.id === item.id) &&
      !handledEventErrorIds.has(item.id),
  );
  if (unhandledErrors.length > 0) {
    const errorText = unhandledErrors.map((item) => `${item.id}: ${item.error}`).join("; ");
    throw new Error(`Push sync accepted ${acceptedIds.size} records with errors: ${errorText}`);
  }

  const processedResponseIds = new Set([
    ...syncedIds,
    ...uploadErrorItems.map((item) => item.id),
  ]);
  const processedEventIds = new Set([
    ...domainEvents.filter((event) => acceptedIds.has(event.id)).map((event) => event.id),
    ...handledEventErrorIds,
  ]);
  if (
    processedResponseIds.size < formResponses.length ||
    processedEventIds.size < domainEvents.length
  ) {
    throw new Error("Push sync made no progress for one or more records; pending records were not classified by the server");
  }

  return {
    pushed: syncedIds.length,
    events: processedEventIds.size,
    uploadErrors: uploadErrorItems.length,
  };
}

export async function pushSync() {
  const token = authStore.getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const pendingResponseCount = await taskRepository.countPendingResponses();
  const { getPendingEvents } = await import("../events/eventOutbox.js");
  const pendingEvents = getPendingEvents();

  const {
    listQuestionnaireDraftsForSync,
    removeQuestionnaireDraft,
    toDraftSyncRecord,
  } = await import("../questionnaires/questionnaireDraftRepository.js");
  const user = authStore.getUser();
  const drafts = await listQuestionnaireDraftsForSync(user?.user_id || user?.id);

  if (pendingResponseCount === 0 && pendingEvents.length === 0 && drafts.length === 0) {
    return { pushed: 0, events: 0, drafts: 0, staleDraftsRemoved: 0 };
  }

  try {
    const deviceId = getMeta("device_id") || "unregistered-device";
    let syncedDrafts = 0;
    let staleDraftsRemoved = 0;
    if (drafts.length > 0) {
      const draftResponse = await fetch(`${API_BASE_URL}/sync/drafts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_id: deviceId,
          drafts: drafts.map(toDraftSyncRecord),
        }),
      });
      if (!draftResponse.ok) {
        throw new Error(`Draft sync failed: ${draftResponse.statusText}`);
      }
      const draftResult = unwrapApiData(await draftResponse.json());
      const draftErrors = Array.isArray(draftResult.errors) ? draftResult.errors : [];
      const { staleDraftIds, blockingErrors } = classifyDraftSyncErrors(draftErrors);
      for (const draftId of staleDraftIds) {
        if (await removeQuestionnaireDraft(draftId)) {
          staleDraftsRemoved += 1;
        }
      }
      if (blockingErrors.length > 0) {
        throw new Error(
          `Draft sync rejected ${blockingErrors.length} record(s): ${blockingErrors
            .map((item) => `${item.id}: ${item.error}`)
            .join("; ")}`,
        );
      }
      syncedDrafts = Number(draftResult.synced || 0);
    }

    let pushed = 0;
    let events = 0;
    let uploadErrors = 0;
    let eventsSent = false;
    while (true) {
      const pendingBatch = await taskRepository.getPendingResponseBatch(PUSH_FORM_RESPONSE_BATCH_SIZE);
      if (pendingBatch.length === 0) {
        if (!eventsSent && pendingEvents.length > 0) {
          const eventResult = await pushRecordBatch({
            token,
            deviceId,
            formResponses: [],
            domainEvents: pendingEvents,
          });
          pushed += eventResult.pushed;
          events += eventResult.events;
          uploadErrors += eventResult.uploadErrors;
          eventsSent = true;
        }
        break;
      }

      const batchResult = await pushRecordBatch({
        token,
        deviceId,
        formResponses: pendingBatch,
        domainEvents: eventsSent ? [] : pendingEvents,
      });
      pushed += batchResult.pushed;
      events += batchResult.events;
      uploadErrors += batchResult.uploadErrors;
      eventsSent = true;
    }

    return {
      pushed,
      events,
      uploadErrors,
      drafts: syncedDrafts,
      staleDraftsRemoved,
    };
  } catch (error) {
    console.error("Push sync error:", error);
    throw error;
  }
}

export async function syncAll(options = {}) {
  const { onProgress } = options;
  const endSync = startTiming("sync.all");
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
      uploadErrors: pushResult.uploadErrors,
      staleDraftsRemoved: pushResult.staleDraftsRemoved,
      clockStatus: getClockStatus(),
    });
    if (getHouseholdCacheInfo().isWebStorage) {
      emitProgress(onProgress, {
        stage: "clear-household-cache",
        message: "Clearing browser household cache",
        localities: assignmentResult.localityCodes.length,
        pushed: pushResult.pushed,
        events: pushResult.events,
        uploadErrors: pushResult.uploadErrors,
      });
      clearHouseholdCacheForSync();
    }
    const pullResult = await pullSync({ onProgress });
    const draftParams = new URLSearchParams({
      device_id: getMeta("device_id") || "unregistered-device",
    });
    const draftResponse = await fetch(`${API_BASE_URL}/sync/drafts?${draftParams.toString()}`, {
      headers: { Authorization: `Bearer ${authStore.getToken()}` },
    });
    if (!draftResponse.ok) {
      throw new Error(`Draft pull failed: ${draftResponse.statusText}`);
    }
    const pulledDraftData = unwrapApiData(await draftResponse.json());
    const { mergeServerQuestionnaireDrafts } = await import(
      "../questionnaires/questionnaireDraftRepository.js"
    );
    const currentUser = authStore.getUser();
    const pulledDrafts = await mergeServerQuestionnaireDrafts(pulledDraftData.drafts, {
      userId: currentUser?.user_id || currentUser?.id,
      deviceId: getMeta("device_id"),
    });
    emitProgress(onProgress, {
      stage: "complete",
      message: "Sync complete",
      localities: assignmentResult.localityCodes.length,
      pushed: pushResult.pushed,
      events: pushResult.events,
      uploadErrors: pushResult.uploadErrors,
      pulled: pullResult.pulled,
      pulledOpenTasks: pullResult.pulledOpenTasks,
      pulledHouseholds: pullResult.pulledHouseholds,
      pulledMembers: pullResult.pulledMembers,
      pulledFormResponses: pullResult.pulledFormResponses,
      formsUpdated: pullResult.formsUpdated,
      draftsPushed: pushResult.drafts || 0,
      draftsPulled: pulledDrafts,
      staleDraftsRemoved: pushResult.staleDraftsRemoved || 0,
      clockStatus: getClockStatus(),
    });
    const result = {
      success: true,
      clockStatus: getClockStatus(),
      localities: assignmentResult.localityCodes.length,
      pulled: pullResult.pulled,
      pulledOpenTasks: pullResult.pulledOpenTasks,
      pulledHouseholds: pullResult.pulledHouseholds,
      pulledMembers: pullResult.pulledMembers,
      pulledFormResponses: pullResult.pulledFormResponses,
      pushed: pushResult.pushed,
      events: pushResult.events,
      uploadErrors: pushResult.uploadErrors,
      formsUpdated: pullResult.formsUpdated,
      draftsPushed: pushResult.drafts || 0,
      draftsPulled: pulledDrafts,
      staleDraftsRemoved: pushResult.staleDraftsRemoved || 0,
    };
    endSync({
      ok: true,
      pulled: pullResult.pulled,
      pushed: pushResult.pushed,
      households: pullResult.pulledHouseholds,
      formsUpdated: pullResult.formsUpdated,
    });
    return result;
  } catch (error) {
    endSync({ ok: false, error: error?.name || "Error" });
    console.error("Sync all error:", error);
    throw error;
  }
}
