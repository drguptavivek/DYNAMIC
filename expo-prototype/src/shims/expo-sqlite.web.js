const STORAGE_KEY = "dynamic_web_sqlite_v1";

function defaultState() {
  return {
    sync_meta: {},
    follow_up_tasks: [],
    task_attempts: [],
    form_responses: [],
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
        "form_availability",
        "disabled_reason",
        "assigned_locality_code",
        "rules_version",
        "created_at",
        "updated_at",
      ];
      const row = rowFromColumns(columns, params);
      this.state.follow_up_tasks = [
        row,
        ...this.state.follow_up_tasks.filter((task) => task.id !== row.id),
      ];
      this.persist();
      return { changes: 1 };
    }

    if (/INSERT INTO form_responses/i.test(normalized)) {
      const columns = [
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

    return { changes: 0 };
  }

  getFirstSync(sql, params = []) {
    const normalized = sql.trim().replace(/\s+/g, " ");

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
      if (/status = \?/i.test(normalized)) rows = rows.filter((row) => row.status === params[paramIndex++]);
      if (/task_type = \?/i.test(normalized)) rows = rows.filter((row) => row.task_type === params[paramIndex++]);
      if (/assigned_locality_code = \?/i.test(normalized)) {
        rows = rows.filter((row) => row.assigned_locality_code === params[paramIndex++]);
      }
      if (/target_date < \?/i.test(normalized)) rows = rows.filter((row) => row.target_date < params[paramIndex++]);
      return sortBy(rows, "target_date");
    }

    if (/SELECT \* FROM form_responses WHERE sync_status = 'pending'/i.test(normalized)) {
      return sortBy(this.state.form_responses.filter((row) => row.sync_status === "pending"), "created_at");
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
