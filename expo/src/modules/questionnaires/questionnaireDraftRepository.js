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

// Test-only seam: lets tests inject a fake SQLite-like db without touching the
// real (native-only) taskSchema/offlineDatabase import chain. Left unset in
// production, so getNativeDatabase() behaves exactly as before.
let nativeDatabaseOverride = null;

export function __setNativeDatabaseForTests(db) {
  nativeDatabaseOverride = db;
}

async function getNativeDatabase() {
  if (nativeDatabaseOverride) return nativeDatabaseOverride;
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

// Narrowed native-only query helpers. These never load the whole table: every
// caller supplies a WHERE clause (even if it is a literal "1=1"), so the hot
// autosave/worklist paths only decode the rows they actually need.
async function queryRows(whereSql, params = [], orderBySql) {
  const db = await getNativeDatabase();
  const sql = `SELECT * FROM questionnaire_drafts WHERE ${whereSql}${
    orderBySql ? ` ORDER BY ${orderBySql}` : ""
  }`;
  return db.getAllSync(sql, params).map(decodeNativeRow);
}

async function queryFirstRow(whereSql, params = [], orderBySql) {
  const db = await getNativeDatabase();
  const sql = `SELECT * FROM questionnaire_drafts WHERE ${whereSql}${
    orderBySql ? ` ORDER BY ${orderBySql}` : ""
  }`;
  const row = db.getFirstSync(sql, params);
  return row ? decodeNativeRow(row) : null;
}

// form_code/form_version/user_id are components of both buildDraftIdentityKey
// and buildDraftHouseholdUserKey (see below), so scoping to
// draft_status='active' AND form_code AND form_version AND user_id is a
// lossless narrowing for every fallback lookup that needs to inspect
// json_payload in JS. Null/'' are folded onto the same bucket ("none") that
// normalizePart() uses for JS key comparisons, so a NULL column still matches
// an unset context field.
function activeScopeWhereSql() {
  // form_code is NOT NULL and always populated, so compare it directly: an
  // expression on the column would stop SQLite using the
  // (draft_status, form_code, ...) index prefix.
  return (
    "draft_status = 'active'" +
    " AND form_code = ?" +
    " AND COALESCE(NULLIF(form_version, ''), 'none') = ?" +
    " AND COALESCE(NULLIF(user_id, ''), 'none') = ?"
  );
}

function activeScopeParams(formCode, formVersion, userId) {
  return [normalizePart(formCode), normalizePart(formVersion), normalizePart(userId)];
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

export async function removeQuestionnaireDraft(draftId) {
  if (!draftId) return false;

  const storage = getWebStorage();
  if (storage) {
    const rows = await readRows();
    const remaining = rows.filter((row) => row.draft_id !== draftId);
    if (remaining.length === rows.length) return false;
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(remaining));
    return true;
  }

  const db = await getNativeDatabase();
  const result = db.runSync("DELETE FROM questionnaire_drafts WHERE draft_id = ?", [draftId]);
  return Number(result?.changes || 0) > 0;
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
  const rawStructureNumber = String(payload?.hhq_structure_map_id || "").trim().toUpperCase();
  if (rawStructureNumber && !/^[A-Z0-9]{1,6}$/.test(rawStructureNumber)) return subjectId;
  const structureNumber = /^\d+$/.test(rawStructureNumber) && rawStructureNumber.length < 4
    ? rawStructureNumber.padStart(4, "0")
    : rawStructureNumber;
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

async function supersedeDuplicateActiveDrafts(draft, candidateRows) {
  const storage = getWebStorage();
  if (storage) {
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
    return;
  }

  const db = await getNativeDatabase();
  const rows =
    candidateRows ||
    (await queryRows(
      activeScopeWhereSql(),
      activeScopeParams(draft.form_code, draft.form_version, draft.user_id),
    ));
  const identityKey = getDraftIdentityKey(draft);
  const householdUserKey = getDraftHouseholdUserKey(draft);
  const duplicates = rows.filter(
    (row) =>
      row.draft_status === "active" &&
      row.draft_id !== draft.draft_id &&
      (getDraftIdentityKey(row) === identityKey || getDraftHouseholdUserKey(row) === householdUserKey),
  );
  if (duplicates.length === 0) return;

  db.runSync("BEGIN");
  try {
    for (const row of duplicates) {
      db.runSync(
        "UPDATE questionnaire_drafts SET draft_status = ?, updated_at = ? WHERE draft_id = ?",
        ["superseded", draft.updated_at, row.draft_id],
      );
    }
    db.runSync("COMMIT");
  } catch (err) {
    db.runSync("ROLLBACK");
    throw err;
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
  const storage = getWebStorage();

  if (storage) {
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

  const draftKey = buildDraftKey(context);
  let matches = await queryRows(
    "draft_key = ? AND draft_status = 'active'",
    [draftKey],
    "updated_at DESC",
  );

  if (matches.length === 0 && context?.keyTaskId !== undefined) {
    const legacyTaskDraftKey = buildDraftKey({
      ...context,
      keyTaskId: undefined,
    });
    matches = await queryRows(
      "draft_key = ? AND draft_status = 'active'",
      [legacyTaskDraftKey],
      "updated_at DESC",
    );
  }

  if (matches.length === 0) {
    const candidates = await queryRows(
      activeScopeWhereSql(),
      activeScopeParams(context?.formCode, context?.formVersion, context?.userId),
      "updated_at DESC",
    );
    const identityKey = buildDraftIdentityKey(context);
    matches = candidates.filter((row) => getDraftIdentityKey(row) === identityKey);

    if (matches.length === 0) {
      const householdUserKey = buildDraftHouseholdUserKey(context);
      matches = candidates.filter((row) => getDraftHouseholdUserKey(row) === householdUserKey);
    }
  }

  let preferredDraft = null;
  if (matches.length === 0 && preferredDraftId) {
    preferredDraft = await queryFirstRow("draft_id = ? AND draft_status = 'active'", [preferredDraftId]);
  }

  const sortedMatches = sortNewestFirst(matches.length ? matches : preferredDraft ? [preferredDraft] : []);
  return sortedMatches[0] || null;
}

export async function getQuestionnaireDraftById(draftId) {
  if (!draftId) return null;

  const storage = getWebStorage();
  if (storage) {
    const rows = await readRows();
    return rows.find((row) => row.draft_id === draftId && row.draft_status === "active") || null;
  }

  return queryFirstRow("draft_id = ? AND draft_status = 'active'", [draftId]);
}

export async function listActiveQuestionnaireDrafts() {
  const storage = getWebStorage();
  if (storage) return dedupeActiveDrafts(await readRows());

  const rows = await queryRows("draft_status = 'active'", [], "updated_at DESC");
  return dedupeActiveDrafts(rows);
}

// Non-payload columns returned by the lightweight summary query below. Kept
// as an explicit list (rather than "SELECT *") so the summary row shape is
// predictable and never accidentally widens to include json_payload.
const SUMMARY_NON_PAYLOAD_COLUMNS = [
  "draft_id",
  "draft_key",
  "form_code",
  "form_version",
  "task_id",
  "subject_type",
  "subject_id",
  "device_id",
  "user_id",
  "completion_state",
  "draft_status",
  "submitted_form_response_id",
  "created_at",
  "updated_at",
];

// The only json_payload keys any draft-to-task matching helper reads: the
// getDraftSiteId/getDraftSubjectId/getDraftHouseholdId/getDraftComparableIds/
// draftMatchesTask helpers in draftPendingForms.js, plus getPayloadHouseholdId
// (used by getDraftIdentityKey/getDraftHouseholdUserKey below, which
// dedupeActiveDrafts relies on). Extracting only these via json_extract lets
// the summary query skip decoding the full (often large) json_payload blob.
const SUMMARY_PAYLOAD_KEYS = [
  "hhq_site_id",
  "site_id",
  "hhq_household_id",
  "household_id",
  "hhq_locality_code",
  "hhq_structure_map_id",
  "hhq_household_number",
  "wq_enter_structure_id_woman",
  "individual_id",
  "woman_id",
  "subject_id",
];

function summaryPayloadAlias(key) {
  return `payload_${key}`;
}

function buildActiveDraftSummarySql() {
  const columnsSql = SUMMARY_NON_PAYLOAD_COLUMNS.join(", ");
  const payloadSql = SUMMARY_PAYLOAD_KEYS.map(
    (key) => `json_extract(json_payload, '$.${key}') AS ${summaryPayloadAlias(key)}`,
  ).join(", ");
  return (
    `SELECT ${columnsSql}, ${payloadSql} FROM questionnaire_drafts` +
    " WHERE draft_status = 'active' ORDER BY updated_at DESC"
  );
}

function decodeSummaryRow(row) {
  const payload = {};
  for (const key of SUMMARY_PAYLOAD_KEYS) {
    const value = row[summaryPayloadAlias(key)];
    if (value !== null && value !== undefined) payload[key] = value;
  }

  const summary = {};
  for (const column of SUMMARY_NON_PAYLOAD_COLUMNS) {
    summary[column] = row[column];
  }
  summary.json_payload = payload;
  summary.completion_state = parseJson(summary.completion_state, {});
  return summary;
}

// Set once a json_extract-based summary query has failed (e.g. a SQLite
// build without the JSON1 extension), so every subsequent call falls back
// straight to the full decode path instead of retrying and re-throwing.
let summaryQueryUnsupported = false;

async function queryActiveDraftSummaryRows() {
  const db = await getNativeDatabase();
  const sql = buildActiveDraftSummarySql();
  const rows = db.getAllSync(sql, []);
  return rows.map(decodeSummaryRow);
}

// Lightweight variant of listActiveQuestionnaireDrafts() for callers that
// only need to match drafts against tasks (worklist enrichment, resolving a
// task's active draft id) rather than read full answer payloads. On native,
// this selects the non-payload columns plus a handful of json_extract'd
// payload keys instead of decoding every row's full json_payload, so it
// avoids JSON.parse-ing potentially large answer blobs on every worklist
// load / task open. Falls back to listActiveQuestionnaireDrafts() if the
// json_extract query is unsupported (e.g. no JSON1) or on the web storage
// path, where there is no payload-decoding cost to avoid.
export async function listActiveQuestionnaireDraftSummaries() {
  const storage = getWebStorage();
  if (storage) return listActiveQuestionnaireDrafts();

  if (summaryQueryUnsupported) return listActiveQuestionnaireDrafts();

  try {
    const rows = await queryActiveDraftSummaryRows();
    return dedupeActiveDrafts(rows);
  } catch (err) {
    summaryQueryUnsupported = true;
    console.warn(
      "listActiveQuestionnaireDraftSummaries: json_extract query failed, falling back to full draft decode",
      err,
    );
    return listActiveQuestionnaireDrafts();
  }
}

export async function listQuestionnaireDraftsForSync(userId) {
  const storage = getWebStorage();
  if (storage) {
    const rows = await readRows();
    return rows.filter((row) => !userId || row.user_id === userId);
  }

  if (!userId) return queryRows("1=1", []);
  return queryRows("user_id = ?", [userId]);
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
  const storage = getWebStorage();
  const rows = storage ? await readRows() : null;
  let merged = 0;

  for (const incoming of drafts) {
    if (!incoming?.draft_id || incoming.draft_status !== "active") continue;
    if (context.userId && incoming.user_id !== context.userId) continue;

    const incomingComparable = {
      ...incoming,
      json_payload: incoming.json_payload || {},
    };
    const incomingHouseholdUserKey = getDraftHouseholdUserKey(incomingComparable);

    let existing;
    if (storage) {
      existing = rows.find(
        (row) =>
          row.draft_id === incoming.draft_id ||
          (row.draft_status === "active" && getDraftHouseholdUserKey(row) === incomingHouseholdUserKey),
      );
    } else {
      existing = await queryFirstRow("draft_id = ?", [incoming.draft_id]);
      if (!existing) {
        const candidates = await queryRows(
          activeScopeWhereSql(),
          activeScopeParams(incoming.form_code, incoming.form_version, incoming.user_id),
        );
        existing =
          candidates.find((row) => getDraftHouseholdUserKey(row) === incomingHouseholdUserKey) || null;
      }
    }
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
  const storage = getWebStorage();
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

  let existing = null;
  let candidateRows = null;

  if (storage) {
    const rows = await readRows();
    const newestRows = sortNewestFirst(rows);
    existing =
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
  } else {
    // At most two SELECTs total: an optional direct draft_id lookup, plus one
    // narrowed active-scope candidate query that is reused below both to find
    // the "existing" draft (draft_key / identity-key / household-key match)
    // and, unchanged, as the duplicate set for supersedeDuplicateActiveDrafts.
    const byId = draftId ? await queryFirstRow("draft_id = ?", [draftId]) : null;
    candidateRows = await queryRows(
      activeScopeWhereSql(),
      activeScopeParams(formCode, formVersion, userId),
      "updated_at DESC",
    );
    existing =
      byId ||
      candidateRows.find(
        (row) =>
          row.draft_key === draftKey ||
          getDraftIdentityKey(row) === draftIdentityKey ||
          getDraftHouseholdUserKey(row) === draftHouseholdUserKey,
      ) ||
      null;
  }

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
  await supersedeDuplicateActiveDrafts(draft, candidateRows);
  return draft;
}

export async function markQuestionnaireDraftSubmitted({ draftId, submittedFormResponseId }) {
  const storage = getWebStorage();
  if (storage) {
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

  const existing = await queryFirstRow("draft_id = ?", [draftId]);
  if (!existing) return null;
  const updated = {
    ...existing,
    draft_status: "submitted",
    submitted_form_response_id: submittedFormResponseId,
    updated_at: nowIso(),
  };
  await persistDraft(updated);
  return updated;
}
