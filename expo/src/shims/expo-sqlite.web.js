const STORAGE_KEY = "dynamic_web_sqlite_v2";

function defaultState() {
  return {
    sync_meta: {},
    follow_up_tasks: [],
    task_attempts: [],
    form_responses: [],
    eligible_women: [],
    domain_events_outbox: [],
  };
}

function loadState() {
  if (typeof window === "undefined" || !window.localStorage) return defaultState();
  try {
    return { ...defaultState(), ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function rowFromColumns(columns, values) {
  return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null]));
}

function sortBy(rows, field, direction = "ASC") {
  const multiplier = direction === "DESC" ? -1 : 1;
  return [...rows].sort((a, b) => String(a[field] || "").localeCompare(String(b[field] || "")) * multiplier);
}

class WebDatabase {
  constructor() {
    this.state = loadState();
  }

  persist() {
    saveState(this.state);
  }

  runSync(sql, params = []) {
    const normalized = sql.trim().replace(/\s+/g, " ");

    if (/^(CREATE|PRAGMA|BEGIN|COMMIT|ROLLBACK)\b/i.test(normalized)) {
      return { changes: 0 };
    }

    if (/INSERT OR REPLACE INTO sync_meta/i.test(normalized)) {
      const [key, value] = params;
      this.state.sync_meta[key] = value;
      this.persist();
      return { changes: 1 };
    }

    if (/INSERT OR REPLACE INTO follow_up_tasks/i.test(normalized)) {
      const columns = [
        "id",
        "task_key",
        "household_id",
        "subject_type",
        "subject_id",
        "subject_name",
        "task_type",
        "protocol_visit_label",
        "target_date",
        "window_start",
        "window_end",
        "status",
        "lifecycle_status",
        "failed_attempt_count",
        "max_failed_attempts",
        "requires_final_close_reason",
        "closed_reason",
        "closed_at",
        "form_availability",
        "disabled_reason",
        "assigned_locality_code",
        "rules_version",
        "generation_source",
        "source_event_id",
        "source_form_response_id",
        "sync_status",
        "server_commit_sequence",
        "created_at",
        "updated_at",
      ];
      const row = rowFromColumns(columns, params);
      this.state.follow_up_tasks = [
        row,
        ...this.state.follow_up_tasks.filter(
          (task) =>
            task.id !== row.id &&
            !(task.task_key && row.task_key && task.task_key === row.task_key),
        ),
      ];
      this.persist();
      return { changes: 1 };
    }

    if (/INSERT OR REPLACE INTO eligible_women/i.test(normalized)) {
      const columns = [
        "woman_id",
        "household_member_id",
        "household_id",
        "site_id",
        "locality_code",
        "eligibility_start_date",
        "wq_status",
        "tracking_status",
        "current_eligibility_status",
        "eligibility_basis",
        "sync_status",
        "created_at",
        "updated_at",
      ];
      const row = rowFromColumns(columns, params);
      this.state.eligible_women = [
        row,
        ...this.state.eligible_women.filter((woman) => woman.woman_id !== row.woman_id),
      ];
      this.persist();
      return { changes: 1 };
    }

    if (/INSERT INTO form_responses/i.test(normalized)) {
      const columns = /household_id/i.test(normalized)
        ? [
            "id",
            "task_id",
            "form_code",
            "form_version",
            "household_id",
            "site_id",
            "locality_code",
            "subject_type",
            "subject_id",
            "answers_json",
            "submitted_at",
            "sync_status",
            "device_id",
            "created_at",
          ]
        : [
            "id",
            "task_id",
            "form_code",
            "form_version",
            "answers_json",
            "submitted_at",
            "sync_status",
            "device_id",
            "created_at",
          ];
      this.state.form_responses.push(rowFromColumns(columns, params));
      this.persist();
      return { changes: 1 };
    }

    if (/INSERT INTO task_attempts/i.test(normalized)) {
      const columns = ["id", "task_id", "attempt_number", "outcome", "notes", "attempted_at"];
      this.state.task_attempts.push(rowFromColumns(columns, params));
      this.persist();
      return { changes: 1 };
    }

    if (/INSERT INTO domain_events_outbox/i.test(normalized)) {
      const columns = ["id", "event_type", "payload", "created_at", "sync_status"];
      this.state.domain_events_outbox.push(rowFromColumns(columns, params));
      this.persist();
      return { changes: 1 };
    }

    if (/UPDATE follow_up_tasks SET status = \?, updated_at = \? WHERE id = \?/i.test(normalized)) {
      const [status, updated_at, id] = params;
      let changes = 0;
      this.state.follow_up_tasks = this.state.follow_up_tasks.map((task) => {
        if (task.id !== id) return task;
        changes += 1;
        return { ...task, status, updated_at };
      });
      this.persist();
      return { changes };
    }

    if (
      /UPDATE follow_up_tasks SET failed_attempt_count = \?, lifecycle_status = \?, updated_at = \? WHERE id = \?/i.test(
        normalized,
      )
    ) {
      const [failed_attempt_count, lifecycle_status, updated_at, id] = params;
      let changes = 0;
      this.state.follow_up_tasks = this.state.follow_up_tasks.map((task) => {
        if (task.id !== id) return task;
        changes += 1;
        return { ...task, failed_attempt_count, lifecycle_status, updated_at };
      });
      this.persist();
      return { changes };
    }

    if (
      /UPDATE follow_up_tasks SET status = \?, lifecycle_status = \?, closed_reason = \?, closed_at = \?, sync_status = \?, updated_at = \? WHERE id = \?/i.test(
        normalized,
      )
    ) {
      const [status, lifecycle_status, closed_reason, closed_at, sync_status, updated_at, id] =
        params;
      let changes = 0;
      this.state.follow_up_tasks = this.state.follow_up_tasks.map((task) => {
        if (task.id !== id) return task;
        changes += 1;
        return {
          ...task,
          status,
          lifecycle_status,
          closed_reason,
          closed_at,
          sync_status,
          updated_at,
        };
      });
      this.persist();
      return { changes };
    }

    if (/UPDATE form_responses SET sync_status = 'synced' WHERE id = \?/i.test(normalized)) {
      const [id] = params;
      let changes = 0;
      this.state.form_responses = this.state.form_responses.map((response) => {
        if (response.id !== id) return response;
        changes += 1;
        return { ...response, sync_status: "synced" };
      });
      this.persist();
      return { changes };
    }

    if (/UPDATE domain_events_outbox SET sync_status = \?, updated_at = \? WHERE id = \?/i.test(normalized)) {
      const [sync_status, updated_at, id] = params;
      let changes = 0;
      this.state.domain_events_outbox = this.state.domain_events_outbox.map((event) => {
        if (event.id !== id) return event;
        changes += 1;
        return { ...event, sync_status, updated_at };
      });
      this.persist();
      return { changes };
    }

    if (/DELETE FROM domain_events_outbox WHERE sync_status = 'synced'/i.test(normalized)) {
      const before = this.state.domain_events_outbox.length;
      this.state.domain_events_outbox = this.state.domain_events_outbox.filter(
        (event) => event.sync_status !== "synced",
      );
      this.persist();
      return { changes: before - this.state.domain_events_outbox.length };
    }

    if (/DELETE FROM task_attempts WHERE task_id IN/i.test(normalized)) {
      const syncedTaskIds = new Set(
        this.state.follow_up_tasks
          .filter((task) => ["synced", "confirmed"].includes(task.sync_status))
          .map((task) => task.id),
      );
      const before = this.state.task_attempts.length;
      this.state.task_attempts = this.state.task_attempts.filter(
        (attempt) => !syncedTaskIds.has(attempt.task_id),
      );
      this.persist();
      return { changes: before - this.state.task_attempts.length };
    }

    if (/DELETE FROM follow_up_tasks WHERE sync_status IN \('synced', 'confirmed'\)/i.test(normalized)) {
      const before = this.state.follow_up_tasks.length;
      this.state.follow_up_tasks = this.state.follow_up_tasks.filter(
        (task) => !["synced", "confirmed"].includes(task.sync_status),
      );
      this.persist();
      return { changes: before - this.state.follow_up_tasks.length };
    }

    return { changes: 0 };
  }

  getFirstSync(sql, params = []) {
    const normalized = sql.trim().replace(/\s+/g, " ");

    if (/SELECT COUNT\(\*\) AS total FROM form_responses WHERE sync_status = 'pending'/i.test(normalized)) {
      return {
        total: this.state.form_responses.filter((row) => row.sync_status === "pending").length,
      };
    }

    if (/SELECT value FROM sync_meta WHERE key = \?/i.test(normalized)) {
      return { value: this.state.sync_meta[params[0]] ?? null };
    }

    if (/SELECT \* FROM follow_up_tasks WHERE id = \?/i.test(normalized)) {
      return this.state.follow_up_tasks.find((task) => task.id === params[0]) || null;
    }

    if (/SELECT \* FROM households WHERE household_id = \?/i.test(normalized)) return null;
    if (/SELECT \* FROM household_members WHERE individual_id = \?/i.test(normalized)) return null;

    return null;
  }

  getAllSync(sql, params = []) {
    const normalized = sql.trim().replace(/\s+/g, " ");

    if (/SELECT \* FROM follow_up_tasks WHERE 1=1/i.test(normalized)) {
      let rows = [...this.state.follow_up_tasks];
      let paramIndex = 0;
      if (/status = \?/i.test(normalized)) {
        const status = params[paramIndex++];
        rows = rows.filter((row) => row.status === status);
      }
      if (/task_type = \?/i.test(normalized)) {
        const taskType = params[paramIndex++];
        rows = rows.filter((row) => row.task_type === taskType);
      }
      if (/assigned_locality_code = \?/i.test(normalized)) {
        const assignedLocalityCode = params[paramIndex++];
        rows = rows.filter((row) => row.assigned_locality_code === assignedLocalityCode);
      }
      if (/target_date < \?/i.test(normalized)) {
        const targetDate = params[paramIndex++];
        rows = rows.filter((row) => row.target_date < targetDate);
      }
      return sortBy(rows, "target_date");
    }

    if (/SELECT \* FROM form_responses WHERE sync_status = 'pending'/i.test(normalized)) {
      const rows = sortBy(
        this.state.form_responses.filter((row) => row.sync_status === "pending"),
        "created_at",
      );
      if (/LIMIT \?/i.test(normalized)) return rows.slice(0, Number(params.at(-1)) || rows.length);
      return rows;
    }

    if (/^SELECT id, form_code, form_version, household_id, site_id, locality_code, subject_type, subject_id, submitted_at, sync_status, sync_error, sync_error_at, server_response_status, created_at, updated_at FROM form_responses/i.test(normalized)) {
      let rows = [...this.state.form_responses];
      if (/sync_status = \?/i.test(normalized)) {
        rows = rows.filter((row) => row.sync_status === params[0]);
      }
      return sortBy(rows, "submitted_at", "DESC").map((row) => ({
        id: row.id,
        form_code: row.form_code,
        form_version: row.form_version,
        household_id: row.household_id,
        site_id: row.site_id,
        locality_code: row.locality_code,
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        submitted_at: row.submitted_at,
        sync_status: row.sync_status,
        sync_error: row.sync_error,
        sync_error_at: row.sync_error_at,
        server_response_status: row.server_response_status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    }

    if (/SELECT \* FROM form_responses WHERE 1=1/i.test(normalized)) {
      let rows = [...this.state.form_responses];
      if (/sync_status = \?/i.test(normalized)) {
        rows = rows.filter((row) => row.sync_status === params[0]);
      }
      return sortBy(rows, "submitted_at", "DESC");
    }

    if (/SELECT \* FROM task_attempts WHERE task_id = \?/i.test(normalized)) {
      return sortBy(
        this.state.task_attempts.filter((row) => row.task_id === params[0]),
        "attempted_at",
        "DESC",
      );
    }

    if (/SELECT \* FROM domain_events_outbox WHERE sync_status = 'pending'/i.test(normalized)) {
      return sortBy(this.state.domain_events_outbox.filter((row) => row.sync_status === "pending"), "created_at");
    }

    if (/SELECT \* FROM domain_events_outbox WHERE sync_status = 'synced'/i.test(normalized)) {
      return sortBy(
        this.state.domain_events_outbox.filter((row) => row.sync_status === "synced"),
        "created_at",
        "DESC",
      );
    }

    return [];
  }
}

const db = new WebDatabase();

export function openDatabaseSync() {
  return db;
}

export async function openDatabaseAsync() {
  return db;
}

/**
 * Drops the in-memory tables and re-persists an empty state. Local device data
 * resets call this so a later persist() cannot resurrect stale rows that were
 * loaded into memory before the reset.
 */
export function resetWebDatabase() {
  db.state = defaultState();
  db.persist();
}
