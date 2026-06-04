import * as SQLite from "expo-sqlite";

let dbInstance = null;

export function initTaskDb() {
  if (dbInstance) return dbInstance;

  const db = SQLite.openDatabaseSync("dynamic_offline.db");

  db.runSync(`
    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id TEXT PRIMARY KEY,
      task_key TEXT UNIQUE,
      household_id TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_name TEXT,
      task_type TEXT NOT NULL,
      protocol_visit_label TEXT,
      target_date TEXT,
      window_start TEXT,
      window_end TEXT,
      status TEXT DEFAULT 'open',
      form_availability TEXT DEFAULT 'available',
      disabled_reason TEXT,
      assigned_locality_code TEXT,
      rules_version TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  db.runSync(`
    CREATE TABLE IF NOT EXISTS task_attempts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES follow_up_tasks(id),
      attempt_number INTEGER,
      outcome TEXT,
      notes TEXT,
      attempted_at TEXT
    )
  `);

  db.runSync(`
    CREATE TABLE IF NOT EXISTS form_responses (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES follow_up_tasks(id),
      form_code TEXT NOT NULL,
      form_version TEXT,
      answers_json TEXT NOT NULL,
      submitted_at TEXT,
      sync_status TEXT DEFAULT 'pending',
      device_id TEXT,
      created_at TEXT
    )
  `);

  db.runSync(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.runSync(`
    CREATE TABLE IF NOT EXISTS domain_events_outbox (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    )
  `);

  dbInstance = db;
  return db;
}

export function getDb() {
  if (!dbInstance) {
    return initTaskDb();
  }
  return dbInstance;
}
