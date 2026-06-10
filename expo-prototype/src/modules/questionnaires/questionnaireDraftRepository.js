const DRAFT_STORAGE_KEY = "dynamic_questionnaire_drafts_v1";

function getStorage() {
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

function readRows() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    return JSON.parse(storage.getItem(DRAFT_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeRows(rows) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(rows));
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
  const rows = readRows()
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
  const rows = readRows();
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

  if (existingIndex >= 0) {
    rows[existingIndex] = draft;
  } else {
    rows.unshift(draft);
  }
  writeRows(rows);
  return draft;
}

export async function markQuestionnaireDraftSubmitted({ draftId, submittedFormResponseId }) {
  const rows = readRows();
  const index = rows.findIndex((row) => row.draft_id === draftId);
  if (index < 0) return null;
  const updated = {
    ...rows[index],
    draft_status: "submitted",
    submitted_form_response_id: submittedFormResponseId,
    updated_at: nowIso(),
  };
  rows[index] = updated;
  writeRows(rows);
  return updated;
}
