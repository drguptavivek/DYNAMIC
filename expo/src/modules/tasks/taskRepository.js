import { getDb } from "./taskSchema.js";

export function listTasks(filters = {}) {
  const db = getDb();
  const { status, task_type, locality_code, overdue } = filters;

  let sql = "SELECT * FROM follow_up_tasks WHERE 1=1";
  const params = [];

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }

  if (task_type) {
    sql += " AND task_type = ?";
    params.push(task_type);
  }

  if (locality_code) {
    sql += " AND assigned_locality_code = ?";
    params.push(locality_code);
  }

  if (overdue) {
    const today = new Date().toISOString().split("T")[0];
    sql += " AND target_date < ?";
    params.push(today);
  }

  sql += " ORDER BY target_date ASC";

  try {
    const tasks = db.getAllSync(sql, params);
    return tasks || [];
  } catch (error) {
    console.error("Error listing tasks:", error);
    return [];
  }
}

export function getTasksByIdentities(identities) {
  const result = [];
  if (!Array.isArray(identities) || identities.length === 0) return result;

  const uniqueIdentities = Array.from(
    new Set(identities.filter((identity) => identity !== null && identity !== undefined && identity !== "")),
  );
  if (uniqueIdentities.length === 0) return result;

  const db = getDb();
  // Each identity is bound twice (task_key IN ... OR id IN ...), so keep the
  // chunk under the 999-variable limit of older SQLite builds.
  const CHUNK_SIZE = 400;

  for (let i = 0; i < uniqueIdentities.length; i += CHUNK_SIZE) {
    const chunk = uniqueIdentities.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    try {
      const rows = db.getAllSync(
        `SELECT * FROM follow_up_tasks WHERE task_key IN (${placeholders}) OR id IN (${placeholders})`,
        [...chunk, ...chunk],
      );
      result.push(...(rows || []));
    } catch (error) {
      console.error("Error fetching tasks by identities:", error);
    }
  }

  return result;
}

export function getTask(id) {
  const db = getDb();
  try {
    const task = db.getFirstSync("SELECT * FROM follow_up_tasks WHERE id = ?", [id]);
    return task || null;
  } catch (error) {
    console.error("Error getting task:", error);
    return null;
  }
}

export function clearSyncedTaskCache() {
  const db = getDb();
  try {
    db.runSync(
      `DELETE FROM task_attempts
       WHERE task_id IN (
         SELECT id FROM follow_up_tasks
         WHERE sync_status IN ('synced', 'confirmed')
       )`,
    );
    db.runSync("DELETE FROM follow_up_tasks WHERE sync_status IN ('synced', 'confirmed')");
  } catch (error) {
    console.error("Error clearing synced task cache:", error);
    throw error;
  }
}

export function saveTask(task) {
  const db = getDb();
  const now = new Date().toISOString();

  const {
    id,
    task_key,
    household_id,
    subject_type,
    subject_id,
    subject_name,
    task_type,
    protocol_visit_label,
    target_date,
    window_start,
    window_end,
    status = "open",
    lifecycle_status = task.lifecycle_status || status,
    failed_attempt_count = 0,
    max_failed_attempts,
    requires_final_close_reason = false,
    closed_reason,
    closed_at,
    form_availability = "available",
    disabled_reason,
    assigned_locality_code,
    rules_version,
    generation_source,
    source_event_id,
    source_form_response_id,
    sync_status = task.sync_status || "local",
    server_commit_sequence,
    created_at = now,
  } = task;

  try {
    db.runSync(
      `INSERT OR REPLACE INTO follow_up_tasks
       (id, task_key, household_id, subject_type, subject_id, subject_name, task_type,
        protocol_visit_label, target_date, window_start, window_end, status,
        lifecycle_status, failed_attempt_count, max_failed_attempts, requires_final_close_reason,
        closed_reason, closed_at,
        form_availability, disabled_reason, assigned_locality_code, rules_version,
        generation_source, source_event_id, source_form_response_id, sync_status, server_commit_sequence,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        task_key,
        household_id,
        subject_type,
        subject_id,
        subject_name,
        task_type,
        protocol_visit_label,
        target_date,
        window_start,
        window_end,
        status,
        lifecycle_status,
        failed_attempt_count,
        max_failed_attempts,
        requires_final_close_reason ? 1 : 0,
        closed_reason,
        closed_at,
        form_availability,
        disabled_reason,
        assigned_locality_code,
        rules_version,
        generation_source,
        source_event_id,
        source_form_response_id,
        sync_status,
        server_commit_sequence,
        created_at,
        now,
      ],
    );
    return { ...task, created_at, updated_at: now };
  } catch (error) {
    console.error("Error saving task:", error);
    throw error;
  }
}

export function saveTaskBatch(tasks) {
  const db = getDb();
  const now = new Date().toISOString();

  try {
    db.runSync("BEGIN TRANSACTION");
    for (const task of tasks) {
      const {
        id,
        task_key,
        household_id,
        subject_type,
        subject_id,
        subject_name,
        task_type,
        protocol_visit_label,
        target_date,
        window_start,
        window_end,
        status = "open",
        lifecycle_status = task.lifecycle_status || status,
        failed_attempt_count = 0,
        max_failed_attempts,
        requires_final_close_reason = false,
        closed_reason,
        closed_at,
        form_availability = "available",
        disabled_reason,
        assigned_locality_code,
        rules_version,
        generation_source,
        source_event_id,
        source_form_response_id,
        sync_status = task.sync_status || "local",
        server_commit_sequence,
        created_at = now,
      } = task;

      db.runSync(
        `INSERT OR REPLACE INTO follow_up_tasks
         (id, task_key, household_id, subject_type, subject_id, subject_name, task_type,
          protocol_visit_label, target_date, window_start, window_end, status,
          lifecycle_status, failed_attempt_count, max_failed_attempts, requires_final_close_reason,
          closed_reason, closed_at,
          form_availability, disabled_reason, assigned_locality_code, rules_version,
          generation_source, source_event_id, source_form_response_id, sync_status, server_commit_sequence,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          task_key,
          household_id,
          subject_type,
          subject_id,
          subject_name,
          task_type,
          protocol_visit_label,
          target_date,
          window_start,
          window_end,
          status,
          lifecycle_status,
          failed_attempt_count,
          max_failed_attempts,
          requires_final_close_reason ? 1 : 0,
          closed_reason,
          closed_at,
          form_availability,
          disabled_reason,
          assigned_locality_code,
          rules_version,
          generation_source,
          source_event_id,
          source_form_response_id,
          sync_status,
          server_commit_sequence,
          created_at,
          now,
        ],
      );
    }
    db.runSync("COMMIT");
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error saving task batch:", error);
    throw error;
  }
}

export function saveEligibleWoman(woman) {
  const db = getDb();
  const now = new Date().toISOString();
  const row = {
    woman_id: woman.woman_id,
    household_member_id: woman.household_member_id,
    household_id: woman.household_id,
    site_id: woman.site_id ?? null,
    locality_code: woman.locality_code || null,
    eligibility_start_date: woman.eligibility_start_date || null,
    wq_status: woman.wq_status || "pending",
    tracking_status: woman.tracking_status || "not_tracked",
    current_eligibility_status: woman.current_eligibility_status || "eligible",
    eligibility_basis: woman.eligibility_basis || null,
    sync_status: woman.sync_status || "local",
    created_at: woman.created_at || now,
    updated_at: woman.updated_at || now,
  };

  try {
    db.runSync(
      `INSERT OR REPLACE INTO eligible_women
       (woman_id, household_member_id, household_id, site_id, locality_code,
        eligibility_start_date, wq_status, tracking_status, current_eligibility_status,
        eligibility_basis, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.woman_id,
        row.household_member_id,
        row.household_id,
        row.site_id,
        row.locality_code,
        row.eligibility_start_date,
        row.wq_status,
        row.tracking_status,
        row.current_eligibility_status,
        row.eligibility_basis,
        row.sync_status,
        row.created_at,
        row.updated_at,
      ],
    );
    return row;
  } catch (error) {
    console.error("Error saving eligible woman:", error);
    throw error;
  }
}

export function saveEligibleWomenBatch(women = []) {
  if (!Array.isArray(women) || women.length === 0) return;
  const db = getDb();

  try {
    db.runSync("BEGIN TRANSACTION");
    for (const woman of women) {
      saveEligibleWoman(woman);
    }
    db.runSync("COMMIT");
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error saving eligible women batch:", error);
    throw error;
  }
}

export function savePregnancy(pregnancy) {
  const db = getDb();
  const now = new Date().toISOString();
  const row = {
    pregnancy_id: pregnancy.pregnancy_id,
    woman_id: pregnancy.woman_id,
    household_member_id: pregnancy.household_member_id || pregnancy.woman_id,
    household_id: pregnancy.household_id,
    site_id: pregnancy.site_id ?? null,
    locality_code: pregnancy.locality_code || null,
    pregnancy_sequence: pregnancy.pregnancy_sequence || 1,
    pregnancy_status: pregnancy.pregnancy_status || "active",
    detected_date: pregnancy.detected_date || null,
    enrollment_date: pregnancy.enrollment_date || null,
    usg_available: pregnancy.usg_available ? 1 : 0,
    source_form_response_id: pregnancy.source_form_response_id || null,
    source_event_id: pregnancy.source_event_id || null,
    sync_status: pregnancy.sync_status || "local",
    created_at: pregnancy.created_at || now,
    updated_at: pregnancy.updated_at || now,
  };

  try {
    db.runSync(
      `INSERT OR REPLACE INTO pregnancies
       (pregnancy_id, woman_id, household_member_id, household_id, site_id, locality_code,
        pregnancy_sequence, pregnancy_status, detected_date, enrollment_date, usg_available,
        source_form_response_id, source_event_id, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.pregnancy_id,
        row.woman_id,
        row.household_member_id,
        row.household_id,
        row.site_id,
        row.locality_code,
        row.pregnancy_sequence,
        row.pregnancy_status,
        row.detected_date,
        row.enrollment_date,
        row.usg_available,
        row.source_form_response_id,
        row.source_event_id,
        row.sync_status,
        row.created_at,
        row.updated_at,
      ],
    );
    return row;
  } catch (error) {
    console.error("Error saving pregnancy:", error);
    throw error;
  }
}

export function savePregnancyBatch(pregnancies = []) {
  if (!Array.isArray(pregnancies) || pregnancies.length === 0) return;
  const db = getDb();

  try {
    db.runSync("BEGIN TRANSACTION");
    for (const pregnancy of pregnancies) {
      savePregnancy(pregnancy);
    }
    db.runSync("COMMIT");
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error saving pregnancy batch:", error);
    throw error;
  }
}

export function completeTask(taskId, formCode, formVersion, answersJson, deviceId) {
  const now = new Date().toISOString();
  return saveFormResponse({
    id: `${taskId}-${now}`,
    task_id: taskId,
    form_code: formCode,
    form_version: formVersion,
    answers_json: answersJson,
    submitted_at: now,
    sync_status: "pending",
    device_id: deviceId,
    created_at: now,
  });
}

export function saveFormResponse(response) {
  const db = getDb();
  const now = new Date().toISOString();
  const responseId = response.id || response.submission_id || `${response.form_code}-${now}`;
  const submittedAt = response.submitted_at || now;
  const answersJson =
    typeof response.answers_json === "string"
      ? response.answers_json
      : JSON.stringify(response.answers_json || response.json_payload || {});

  try {
    db.runSync("BEGIN TRANSACTION");

    db.runSync(
      `INSERT INTO form_responses
       (id, task_id, form_code, form_version, household_id, site_id, locality_code,
        subject_type, subject_id, answers_json, submitted_at, sync_status, sync_error,
        sync_error_at, server_response_status, device_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        responseId,
        response.task_id || null,
        response.form_code,
        response.form_version,
        response.household_id || null,
        response.site_id ?? null,
        response.locality_code || null,
        response.subject_type || null,
        response.subject_id || null,
        answersJson,
        submittedAt,
        response.sync_status || "pending",
        response.sync_error || null,
        response.sync_error_at || null,
        response.server_response_status || null,
        response.device_id || "unknown",
        response.created_at || now,
        response.updated_at || now,
      ],
    );

    if (response.task_id) {
      db.runSync("UPDATE follow_up_tasks SET status = ?, updated_at = ? WHERE id = ?", [
        "completed",
        now,
        response.task_id,
      ]);
    }

    db.runSync("COMMIT");
    return { ...response, id: responseId, submitted_at: submittedAt, created_at: response.created_at || now };
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error saving form response:", error);
    throw error;
  }
}

function normalizePulledFormResponse(response) {
  const now = new Date().toISOString();
  const responseId = response.id || response.response_id || response.form_response_id || response.submission_id;
  const answersJson =
    typeof response.answers_json === "string"
      ? response.answers_json
      : JSON.stringify(response.answers_json || response.json_payload || {});

  return {
    id: responseId,
    task_id: response.task_id || null,
    form_code: response.form_code,
    form_version: response.form_version || "",
    household_id: response.household_id || null,
    site_id: response.site_id ?? null,
    locality_code: response.locality_code || null,
    subject_type: response.subject_type || null,
    subject_id: response.subject_id || null,
    answers_json: answersJson,
    submitted_at: response.submitted_at || response.created_offline_at || response.synced_at || response.created_at || now,
    sync_status: response.sync_status || "synced",
    sync_error: response.sync_error || null,
    sync_error_at: response.sync_error_at || null,
    server_response_status: response.server_response_status || null,
    device_id: response.device_id || "server",
    created_at: response.created_at || response.synced_at || now,
    updated_at: response.updated_at || response.synced_at || response.created_at || now,
  };
}

export function saveSyncedFormResponsesBatch(responses = []) {
  if (!Array.isArray(responses) || responses.length === 0) return 0;
  const db = getDb();
  let saved = 0;

  try {
    db.runSync("BEGIN TRANSACTION");
    for (const response of responses) {
      const row = normalizePulledFormResponse(response || {});
      if (!row.id || !row.form_code) continue;

      db.runSync(
        `INSERT INTO form_responses
         (id, task_id, form_code, form_version, household_id, site_id, locality_code,
          subject_type, subject_id, answers_json, submitted_at, sync_status, sync_error,
          sync_error_at, server_response_status, device_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          task_id = excluded.task_id,
          form_code = excluded.form_code,
          form_version = excluded.form_version,
          household_id = excluded.household_id,
          site_id = excluded.site_id,
          locality_code = excluded.locality_code,
          subject_type = excluded.subject_type,
          subject_id = excluded.subject_id,
          answers_json = excluded.answers_json,
          submitted_at = excluded.submitted_at,
          sync_status = excluded.sync_status,
          sync_error = excluded.sync_error,
          sync_error_at = excluded.sync_error_at,
          server_response_status = excluded.server_response_status,
          device_id = excluded.device_id,
          updated_at = excluded.updated_at`,
        [
          row.id,
          row.task_id,
          row.form_code,
          row.form_version,
          row.household_id,
          row.site_id,
          row.locality_code,
          row.subject_type,
          row.subject_id,
          row.answers_json,
          row.submitted_at,
          row.sync_status,
          row.sync_error,
          row.sync_error_at,
          row.server_response_status,
          row.device_id,
          row.created_at,
          row.updated_at,
        ],
      );
      saved += 1;
    }
    db.runSync("COMMIT");
    return saved;
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error saving synced form responses:", error);
    throw error;
  }
}

export function saveDomainEvent(event, createdAt) {
  const db = getDb();
  try {
    db.runSync(
      `INSERT OR REPLACE INTO domain_events_outbox
       (id, event_type, payload, created_at, sync_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.event_id,
        event.event_type,
        JSON.stringify(event),
        createdAt || event.recorded_at || new Date().toISOString(),
        "pending",
        new Date().toISOString(),
      ],
    );
  } catch (error) {
    console.error("Error saving domain event:", error);
    throw error;
  }
}

export function saveAttempt(attempt) {
  const db = getDb();
  const {
    id,
    task_id,
    attempt_number,
    outcome,
    notes,
    attempted_at = new Date().toISOString(),
  } = attempt;

  try {
    db.runSync(
      `INSERT INTO task_attempts
       (id, task_id, attempt_number, outcome, notes, attempted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, task_id, attempt_number, outcome, notes, attempted_at],
    );
  } catch (error) {
    console.error("Error saving attempt:", error);
    throw error;
  }
}

export function saveTaskAttempt(attempt, taskState) {
  const db = getDb();
  const attemptedAt = attempt.attempted_at || new Date().toISOString();

  try {
    db.runSync("BEGIN TRANSACTION");
    db.runSync(
      `INSERT INTO task_attempts
       (id, task_id, attempt_number, outcome, notes, attempted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        attempt.id,
        attempt.task_id,
        attempt.attempt_number,
        attempt.outcome,
        attempt.notes,
        attemptedAt,
      ],
    );
    const taskUpdate = db.runSync(
      `UPDATE follow_up_tasks
       SET failed_attempt_count = ?, lifecycle_status = ?, updated_at = ?
       WHERE id = ?`,
      [
        taskState.failed_attempt_count,
        taskState.lifecycle_status,
        attemptedAt,
        attempt.task_id,
      ],
    );
    if (taskUpdate.changes !== 1) {
      throw new Error(`Task ${attempt.task_id} was not found while saving attempt`);
    }
    db.runSync("COMMIT");
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error saving task attempt:", error);
    throw error;
  }
}

export function saveTaskClosure(taskId, taskState) {
  const db = getDb();
  const updatedAt = taskState.closed_at || new Date().toISOString();

  try {
    const result = db.runSync(
      `UPDATE follow_up_tasks
       SET status = ?, lifecycle_status = ?, closed_reason = ?, closed_at = ?,
           sync_status = ?, updated_at = ?
       WHERE id = ?`,
      [
        taskState.status,
        taskState.lifecycle_status,
        taskState.closed_reason,
        taskState.closed_at,
        taskState.sync_status,
        updatedAt,
        taskId,
      ],
    );
    if (result.changes !== 1) {
      throw new Error(`Task ${taskId} was not found while saving final close reason`);
    }
  } catch (error) {
    console.error("Error saving task closure:", error);
    throw error;
  }
}

export function getPendingResponses() {
  const db = getDb();
  try {
    const responses = db.getAllSync(
      "SELECT * FROM form_responses WHERE sync_status = 'pending' ORDER BY created_at ASC",
      [],
    );
    return responses || [];
  } catch (error) {
    console.error("Error getting pending responses:", error);
    throw error;
  }
}

export function listFormResponses(filters = {}) {
  const db = getDb();
  const { sync_status } = filters;
  const params = [];
  let sql = "SELECT * FROM form_responses WHERE 1=1";

  if (sync_status) {
    sql += " AND sync_status = ?";
    params.push(sync_status);
  }

  sql += " ORDER BY submitted_at DESC, created_at DESC";

  try {
    return db.getAllSync(sql, params) || [];
  } catch (error) {
    console.error("Error listing form responses:", error);
    return [];
  }
}

export function markResponseSynced(id) {
  const db = getDb();
  try {
    db.runSync(
      "UPDATE form_responses SET sync_status = 'synced', sync_error = NULL, sync_error_at = NULL WHERE id = ?",
      [id],
    );
  } catch (error) {
    console.error("Error marking response synced:", error);
    throw error;
  }
}

export function markResponseUploadError(id, message) {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    db.runSync(
      "UPDATE form_responses SET sync_status = 'upload_error', sync_error = ?, sync_error_at = ? WHERE id = ?",
      [message || "Upload failed", now, id],
    );
  } catch (error) {
    console.error("Error marking response upload error:", error);
    throw error;
  }
}

export function markResponsesSyncedBatch(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const db = getDb();

  try {
    db.runSync("BEGIN TRANSACTION");
    for (const id of ids) {
      db.runSync(
        "UPDATE form_responses SET sync_status = 'synced', sync_error = NULL, sync_error_at = NULL WHERE id = ?",
        [id],
      );
    }
    db.runSync("COMMIT");
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error marking responses synced batch:", error);
    throw error;
  }
}

export function markResponsesUploadErrorBatch(items = []) {
  if (!Array.isArray(items) || items.length === 0) return;
  const db = getDb();
  const now = new Date().toISOString();

  try {
    db.runSync("BEGIN TRANSACTION");
    for (const item of items) {
      db.runSync(
        "UPDATE form_responses SET sync_status = 'upload_error', sync_error = ?, sync_error_at = ? WHERE id = ?",
        [item?.message || "Upload failed", now, item?.id],
      );
    }
    db.runSync("COMMIT");
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error marking responses upload error batch:", error);
    throw error;
  }
}

export function getTaskAttempts(taskId) {
  const db = getDb();
  try {
    const attempts = db.getAllSync(
      "SELECT * FROM task_attempts WHERE task_id = ? ORDER BY attempted_at DESC",
      [taskId],
    );
    return attempts || [];
  } catch (error) {
    console.error("Error getting task attempts:", error);
    return [];
  }
}
