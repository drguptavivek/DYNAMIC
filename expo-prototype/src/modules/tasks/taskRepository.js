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
    form_availability = "available",
    disabled_reason,
    assigned_locality_code,
    rules_version,
    created_at = now,
  } = task;

  try {
    db.runSync(
      `INSERT OR REPLACE INTO follow_up_tasks
       (id, task_key, household_id, subject_type, subject_id, subject_name, task_type,
        protocol_visit_label, target_date, window_start, window_end, status,
        form_availability, disabled_reason, assigned_locality_code, rules_version,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        form_availability,
        disabled_reason,
        assigned_locality_code,
        rules_version,
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
        form_availability = "available",
        disabled_reason,
        assigned_locality_code,
        rules_version,
        created_at = now,
      } = task;

      db.runSync(
        `INSERT OR REPLACE INTO follow_up_tasks
         (id, task_key, household_id, subject_type, subject_id, subject_name, task_type,
          protocol_visit_label, target_date, window_start, window_end, status,
          form_availability, disabled_reason, assigned_locality_code, rules_version,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          form_availability,
          disabled_reason,
          assigned_locality_code,
          rules_version,
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

export function completeTask(taskId, formCode, formVersion, answersJson, deviceId) {
  const db = getDb();
  const now = new Date().toISOString();

  try {
    db.runSync("BEGIN TRANSACTION");

    const responseId = `${taskId}-${now}`;
    db.runSync(
      `INSERT INTO form_responses
       (id, task_id, form_code, form_version, answers_json, submitted_at, sync_status, device_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [responseId, taskId, formCode, formVersion, answersJson, now, "pending", deviceId, now],
    );

    db.runSync("UPDATE follow_up_tasks SET status = ?, updated_at = ? WHERE id = ?", [
      "completed",
      now,
      taskId,
    ]);

    db.runSync("COMMIT");
  } catch (error) {
    db.runSync("ROLLBACK");
    console.error("Error completing task:", error);
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

export function markResponseSynced(id) {
  const db = getDb();
  try {
    db.runSync("UPDATE form_responses SET sync_status = 'synced' WHERE id = ?", [id]);
  } catch (error) {
    console.error("Error marking response synced:", error);
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
