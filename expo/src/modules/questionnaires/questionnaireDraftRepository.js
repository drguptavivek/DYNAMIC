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

export function buildDraftKey({
  formCode,
  formVersion,
  taskId,
  subjectType,
  subjectId,
  deviceId,
  userId,
}) {
  return [
    formCode,
    formVersion,
    taskId,
    subjectType,
    subjectId,
    deviceId,
    userId,
  ].map(normalizePart).join("|");
}

export async function getActiveQuestionnaireDraft(context) {
  const draftKey = buildDraftKey(context);
  const rows = (await readRows())
    .filter((row) => row.draft_key === draftKey && row.draft_status === "active")
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return rows[0] || null;
}

export async function saveQuestionnaireDraft({
  draftId,
  formCode,
  formVersion,
  payload = {},
  completionState = {},
  taskId,
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
    subjectType,
    subjectId,
    deviceId,
    userId,
  });
  const existingIndex = rows.findIndex(
    (row) => row.draft_id === draftId || (row.draft_key === draftKey && row.draft_status === "active"),
  );
  const existing = existingIndex >= 0 ? rows[existingIndex] : null;
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
