/** Persists finalized form attachments and their independent sync state. */

const WEB_STORAGE_KEY = "dynamic_form_attachments_v1";

function webStorage() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function webRows() {
  try {
    return JSON.parse(webStorage()?.getItem(WEB_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeWebRows(rows) {
  webStorage()?.setItem(WEB_STORAGE_KEY, JSON.stringify(rows));
}

async function nativeDb() {
  const { getDb } = await import("../tasks/taskSchema.js");
  return getDb();
}

export async function saveFinalizedAttachments({ response, questionName, value }) {
  const reports = Array.isArray(value?.reports) ? value.reports : [];
  const now = new Date().toISOString();
  const rows = reports.map((report, index) => ({
    attachment_id: report.attachment_id,
    form_response_id: response.id,
    form_code: response.form_code,
    question_name: questionName,
    household_id: response.household_id,
    woman_id: response.subject_id,
    report_sequence: index + 1,
    display_name: String(report.report_name || "").trim(),
    original_file_name: report.original_name || null,
    local_uri: report.local_uri,
    mime_type: report.mime_type || "image/jpeg",
    file_size: Number.isFinite(Number(report.file_size)) ? Number(report.file_size) : null,
    sync_status: "pending",
    sync_error: null,
    server_path: null,
    created_at: now,
    updated_at: now,
  }));

  const storage = webStorage();
  if (storage) {
    const ids = new Set(rows.map((row) => row.attachment_id));
    writeWebRows([...rows, ...webRows().filter((row) => !ids.has(row.attachment_id))]);
    return rows;
  }

  const db = await nativeDb();
  db.runSync("BEGIN");
  try {
    for (const row of rows) {
      db.runSync(
        `INSERT OR REPLACE INTO form_attachments (
          attachment_id, form_response_id, form_code, question_name, household_id, woman_id,
          report_sequence, display_name, original_file_name, local_uri, mime_type, file_size,
          sync_status, sync_error, server_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.attachment_id, row.form_response_id, row.form_code, row.question_name,
          row.household_id, row.woman_id, row.report_sequence, row.display_name,
          row.original_file_name, row.local_uri, row.mime_type, row.file_size,
          row.sync_status, row.sync_error, row.server_path, row.created_at, row.updated_at,
        ],
      );
    }
    db.runSync("COMMIT");
  } catch (error) {
    db.runSync("ROLLBACK");
    throw error;
  }
  return rows;
}

export async function listPendingAttachmentsForResponses(responseIds) {
  if (!Array.isArray(responseIds) || responseIds.length === 0) return [];
  const ids = new Set(responseIds);
  if (webStorage()) {
    return webRows().filter((row) => ids.has(row.form_response_id) && row.sync_status !== "synced");
  }
  const placeholders = responseIds.map(() => "?").join(", ");
  const db = await nativeDb();
  return db.getAllSync(
    `SELECT * FROM form_attachments
     WHERE form_response_id IN (${placeholders}) AND sync_status != 'synced'
     ORDER BY form_response_id, report_sequence`,
    responseIds,
  );
}

export async function markAttachmentSynced(attachmentId, serverPath) {
  const now = new Date().toISOString();
  if (webStorage()) {
    writeWebRows(webRows().map((row) => row.attachment_id === attachmentId
      ? { ...row, sync_status: "synced", sync_error: null, server_path: serverPath, updated_at: now }
      : row));
    return;
  }
  const db = await nativeDb();
  db.runSync(
    `UPDATE form_attachments SET sync_status = 'synced', sync_error = NULL,
      server_path = ?, updated_at = ? WHERE attachment_id = ?`,
    [serverPath, now, attachmentId],
  );
}

export async function markAttachmentUploadError(attachmentId, message) {
  const now = new Date().toISOString();
  if (webStorage()) {
    writeWebRows(webRows().map((row) => row.attachment_id === attachmentId
      ? { ...row, sync_status: "upload_error", sync_error: message, updated_at: now }
      : row));
    return;
  }
  const db = await nativeDb();
  db.runSync(
    `UPDATE form_attachments SET sync_status = 'upload_error', sync_error = ?, updated_at = ?
     WHERE attachment_id = ?`,
    [message, now, attachmentId],
  );
}
