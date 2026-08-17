/**
 * Persists mutable questionnaire drafts in browser storage or the shared native SQLite database.
 */
const DRAFT_STORAGE_KEY = "dynamic_questionnaire_drafts_v1";

function getWebStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

function nowIso() {
  return new Date().toISOString();
}

function createDraftId(formCode) {
  const randomId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${formCode}-draft-${randomId}`;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "") || fallback;
  } catch {
    return fallback;
  }
}

async function getNativeDatabase() {
  const { getDb } = await import("../tasks/taskSchema.js");
  return getDb();
}

function decodeNativeRow(row) {
  return {
    ...row,
    json_payload: parseJson(row.json_payload, {}),
    completion_state: parseJson(row.completion_state, {}),
  };
}

async function readRows() {
  const storage = getWebStorage();
  if (storage) {
    const rows = parseJson(storage.getItem(DRAFT_STORAGE_KEY), []);
    return Array.isArray(rows) ? rows : [];
  }

  const db = await getNativeDatabase();
  return db.getAllSync("SELECT * FROM questionnaire_drafts").map(decodeNativeRow);
}

async function persistDraft(draft) {
  const storage = getWebStorage();
  if (storage) {
    const rows = await readRows();
    const index = rows.findIndex((row) => row.draft_id === draft.draft_id);
    if (index >= 0) rows[index] = draft;
    else rows.unshift(draft);
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(rows));
    return;
  }

  const db = await getNativeDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO questionnaire_drafts (
      draft_id, draft_key, form_code, form_version, task_id, subject_type, subject_id,
      device_id, user_id, json_payload, completion_state, draft_status,
      submitted_form_response_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      draft.draft_id,
      draft.draft_key,
      draft.form_code,
      draft.form_version || null,
      draft.task_id || null,
      draft.subject_type || null,
      draft.subject_id || null,
      draft.device_id,
      draft.user_id,
      JSON.stringify(draft.json_payload || {}),
      JSON.stringify(draft.completion_state || {}),
      draft.draft_status,
      draft.submitted_form_response_id || null,
      draft.created_at,
      draft.updated_at,
    ],
  );
}

function normalizePart(value) {
  return value === undefined || value === null || value === "" ? "none" : String(value);
}

function getHouseholdIdFromDraft(draft) {
  const candidate = getPayloadHouseholdId(draft?.json_payload || {}, draft?.subject_id);
  const parts = String(candidate || "").split("-");
  return parts.length >= 4 ? parts.slice(0, 4).join("-") : candidate || null;
}

function normalizeHouseholdIdPart(value, width) {
  const text = String(value || "").trim();
  return text && width ? text.padStart(width, "0") : text;
}

function getPayloadHouseholdId(payload, subjectId) {
  if (payload?.hhq_household_id) return payload.hhq_household_id;
  const siteId = normalizeHouseholdIdPart(payload?.hhq_site_id);
  const localityCode = normalizeHouseholdIdPart(payload?.hhq_locality_code, 2);
  const structureNumber = normalizeHouseholdIdPart(payload?.hhq_structure_map_id, 4);
  const householdNumber = normalizeHouseholdIdPart(payload?.hhq_household_number, 2);
  if (siteId && localityCode && structureNumber && householdNumber) {
    return [siteId, localityCode, structureNumber, householdNumber].join("-");
  }
  return subjectId;
}

function buildDraftIdentityKey({
  formCode,
  formVersion,
  subjectId,
  deviceId,
  userId,
  payload,
}) {
  const householdId = getPayloadHouseholdId(payload, subjectId);
  return [
    formCode,
    formVersion,
    householdId,
    deviceId,
    userId,
  ].map(normalizePart).join("|");
}

function buildDraftHouseholdUserKey({
  formCode,
  formVersion,
  subjectId,
  userId,
  payload,
}) {
  const householdId = getPayloadHouseholdId(payload, subjectId);
  return [
    formCode,
    formVersion,
    householdId,
    userId,
  ].map(normalizePart).join("|");
}

function getDraftIdentityKey(draft) {
  return buildDraftIdentityKey({
    formCode: draft?.form_code,
    formVersion: draft?.form_version,
    subjectId: draft?.subject_id,
    deviceId: draft?.device_id,
    userId: draft?.user_id,
    payload: draft?.json_payload || {},
  });
}

function getDraftHouseholdUserKey(draft) {
  return buildDraftHouseholdUserKey({
    formCode: draft?.form_code,
    formVersion: draft?.form_version,
    subjectId: draft?.subject_id,
    userId: draft?.user_id,
    payload: draft?.json_payload || {},
  });
}

function sortNewestFirst(rows) {
  return [...rows].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

function dedupeActiveDrafts(rows) {
  const seen = new Set();
  const drafts = [];
  for (const row of sortNewestFirst(rows)) {
    if (row.draft_status !== "active") continue;
    const identityKey = getDraftHouseholdUserKey(row);
    if (seen.has(identityKey)) continue;
    seen.add(identityKey);
    drafts.push(row);
  }
  return drafts;
}

async function supersedeDuplicateActiveDrafts(draft) {
  const rows = await readRows();
  const identityKey = getDraftIdentityKey(draft);
  const householdUserKey = getDraftHouseholdUserKey(draft);
  const duplicates = rows.filter(
    (row) =>
      row.draft_status === "active" &&
      row.draft_id !== draft.draft_id &&
      (getDraftIdentityKey(row) === identityKey || getDraftHouseholdUserKey(row) === householdUserKey),
  );
  for (const row of duplicates) {
    await persistDraft({
      ...row,
      draft_status: "superseded",
      updated_at: draft.updated_at,
    });
  }
}

export function buildDraftKey({
  formCode,
  formVersion,
  taskId,
  keyTaskId,
  subjectType,
  subjectId,
  deviceId,
  userId,
}) {
  const taskKeyPart = keyTaskId === undefined ? taskId : keyTaskId;
  return [
    formCode,
    formVersion,
    taskKeyPart,
    subjectType,
    subjectId,
    deviceId,
    userId,
  ].map(normalizePart).join("|");
}

export async function getActiveQuestionnaireDraft(context) {
  const preferredDraftId = context?.preferredDraftId || context?.draftId;
  const rows = await readRows();
  const preferredDraft = preferredDraftId
    ? rows.find((row) => row.draft_id === preferredDraftId && row.draft_status === "active")
    : null;
  const draftKey = buildDraftKey(context);
  let matches = rows.filter((row) => row.draft_key === draftKey && row.draft_status === "active");

  if (matches.length === 0 && context?.keyTaskId !== undefined) {
    const legacyTaskDraftKey = buildDraftKey({
      ...context,
      keyTaskId: undefined,
    });
    matches = rows.filter(
      (row) => row.draft_key === legacyTaskDraftKey && row.draft_status === "active",
    );
  }

  if (matches.length === 0) {
    const identityKey = buildDraftIdentityKey(context);
    matches = rows.filter(
      (row) => row.draft_status === "active" && getDraftIdentityKey(row) === identityKey,
    );
  }

  if (matches.length === 0) {
    const householdUserKey = buildDraftHouseholdUserKey(context);
    matches = rows.filter(
      (row) => row.draft_status === "active" && getDraftHouseholdUserKey(row) === householdUserKey,
    );
  }

  const sortedMatches = sortNewestFirst(matches.length ? matches : preferredDraft ? [preferredDraft] : []);
  return sortedMatches[0] || null;
}

export async function getQuestionnaireDraftById(draftId) {
  if (!draftId) return null;
  const rows = await readRows();
  return rows.find((row) => row.draft_id === draftId && row.draft_status === "active") || null;
}

export async function listActiveQuestionnaireDrafts() {
  return dedupeActiveDrafts(await readRows());
}

export async function listQuestionnaireDraftsForSync(userId) {
  const rows = await readRows();
  return rows.filter((row) => !userId || row.user_id === userId);
}

export function toDraftSyncRecord(draft) {
  const householdId = getHouseholdIdFromDraft(draft);
  const [siteId, localityCode] = String(householdId || "").split("-");
  return {
    draft_id: draft.draft_id,
    form_code: draft.form_code,
    form_version: draft.form_version,
    task_id: draft.task_id,
    subject_type: draft.subject_type,
    subject_id: draft.subject_id,
    household_id: householdId,
    site_id: Number.parseInt(siteId, 10),
    locality_code: localityCode,
    user_id: draft.user_id,
    device_id: draft.device_id,
    json_payload: draft.json_payload || {},
    completion_state: draft.completion_state || {},
    draft_status: draft.draft_status,
    submitted_form_response_id: draft.submitted_form_response_id || null,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
  };
}

export async function mergeServerQuestionnaireDrafts(drafts, context = {}) {
  if (!Array.isArray(drafts)) return 0;
  const rows = await readRows();
  let merged = 0;

  for (const incoming of drafts) {
    if (!incoming?.draft_id || incoming.draft_status !== "active") continue;
    if (context.userId && incoming.user_id !== context.userId) continue;

    const incomingComparable = {
      ...incoming,
      json_payload: incoming.json_payload || {},
    };
    const incomingHouseholdUserKey = getDraftHouseholdUserKey(incomingComparable);
    const existing = rows.find(
      (row) =>
        row.draft_id === incoming.draft_id ||
        (row.draft_status === "active" && getDraftHouseholdUserKey(row) === incomingHouseholdUserKey),
    );
    if (existing && String(existing.updated_at) >= String(incoming.updated_at)) continue;

    const draft = {
      draft_id: existing?.draft_id || incoming.draft_id,
      draft_key: buildDraftKey({
        formCode: incoming.form_code,
        formVersion: incoming.form_version,
        taskId: incoming.task_id,
        subjectType: incoming.subject_type,
        subjectId: incoming.subject_id,
        deviceId: context.deviceId || incoming.device_id,
        userId: incoming.user_id,
      }),
      form_code: incoming.form_code,
      form_version: incoming.form_version || null,
      task_id: incoming.task_id || null,
      subject_type: incoming.subject_type || null,
      subject_id: incoming.subject_id || null,
      device_id: context.deviceId || incoming.device_id,
      user_id: incoming.user_id,
      json_payload: incoming.json_payload || {},
      completion_state: incoming.completion_state || {},
      draft_status: "active",
      submitted_form_response_id: null,
      created_at: incoming.created_at,
      updated_at: incoming.updated_at,
    };
    await persistDraft(draft);
    await supersedeDuplicateActiveDrafts(draft);
    merged += 1;
  }
  return merged;
}

export async function saveQuestionnaireDraft({
  draftId,
  formCode,
  formVersion,
  payload = {},
  completionState = {},
  taskId,
  keyTaskId,
  subjectType,
  subjectId,
  deviceId = "unknown",
  userId = "unknown",
}) {
  const rows = await readRows();
  const timestamp = nowIso();
  const draftKey = buildDraftKey({
    formCode,
    formVersion,
    taskId,
    keyTaskId,
    subjectType,
    subjectId,
    deviceId,
    userId,
  });
  const draftIdentityKey = buildDraftIdentityKey({
    formCode,
    formVersion,
    subjectId,
    deviceId,
    userId,
    payload,
  });
  const draftHouseholdUserKey = buildDraftHouseholdUserKey({
    formCode,
    formVersion,
    subjectId,
    userId,
    payload,
  });
  const newestRows = sortNewestFirst(rows);
  const existing =
    newestRows.find((row) => row.draft_id === draftId) ||
    newestRows.find(
      (row) =>
        row.draft_status === "active" &&
        (
          row.draft_key === draftKey ||
          getDraftIdentityKey(row) === draftIdentityKey ||
          getDraftHouseholdUserKey(row) === draftHouseholdUserKey
        ),
    ) ||
    null;
  const draft = {
    draft_id: existing?.draft_id || draftId || createDraftId(formCode),
    draft_key: draftKey,
    form_code: formCode,
    form_version: formVersion,
    task_id: taskId || null,
    subject_type: subjectType || null,
    subject_id: subjectId || null,
    device_id: deviceId,
    user_id: userId,
    json_payload: payload || {},
    completion_state: completionState || {},
    draft_status: "active",
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  };

  await persistDraft(draft);
  await supersedeDuplicateActiveDrafts(draft);
  return draft;
}

export async function markQuestionnaireDraftSubmitted({ draftId, submittedFormResponseId }) {
  const rows = await readRows();
  const index = rows.findIndex((row) => row.draft_id === draftId);
  if (index < 0) return null;
  const updated = {
    ...rows[index],
    draft_status: "submitted",
    submitted_form_response_id: submittedFormResponseId,
    updated_at: nowIso(),
  };
  await persistDraft(updated);
  return updated;
}
