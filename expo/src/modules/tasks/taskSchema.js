/**
 * Initializes task, workflow, response, draft, and outbox tables on the shared offline database.
 */
import { getOfflineDatabase } from "../storage/offlineDatabase";

let schemaInitialized = false;

export function initTaskDb() {
  const db = getOfflineDatabase();
  if (schemaInitialized) return db;

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
      lifecycle_status TEXT DEFAULT 'open',
      failed_attempt_count INTEGER DEFAULT 0,
      max_failed_attempts INTEGER,
      requires_final_close_reason INTEGER DEFAULT 0,
      closed_reason TEXT,
      closed_at TEXT,
      form_availability TEXT DEFAULT 'available',
      disabled_reason TEXT,
      assigned_locality_code TEXT,
      rules_version TEXT,
      generation_source TEXT,
      source_event_id TEXT,
      source_form_response_id TEXT,
      sync_status TEXT DEFAULT 'local',
      server_commit_sequence INTEGER,
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
      household_id TEXT,
      site_id INTEGER,
      locality_code TEXT,
      subject_type TEXT,
      subject_id TEXT,
      answers_json TEXT NOT NULL,
      submitted_at TEXT,
      sync_status TEXT DEFAULT 'pending',
      sync_error TEXT,
      sync_error_at TEXT,
      device_id TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  db.runSync(`
    CREATE TABLE IF NOT EXISTS questionnaire_drafts (
      draft_id TEXT PRIMARY KEY,
      draft_key TEXT NOT NULL,
      form_code TEXT NOT NULL,
      form_version TEXT,
      task_id TEXT,
      subject_type TEXT,
      subject_id TEXT,
      device_id TEXT,
      user_id TEXT,
      json_payload TEXT NOT NULL,
      completion_state TEXT NOT NULL,
      draft_status TEXT NOT NULL DEFAULT 'active',
      submitted_form_response_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.runSync(`
    CREATE INDEX IF NOT EXISTS questionnaire_drafts_key_status_idx
    ON questionnaire_drafts (draft_key, draft_status, updated_at)
  `);

  db.runSync(`
    CREATE TABLE IF NOT EXISTS eligible_women (
      woman_id TEXT PRIMARY KEY,
      household_member_id TEXT NOT NULL,
      household_id TEXT NOT NULL,
      site_id INTEGER,
      locality_code TEXT,
      eligibility_start_date TEXT,
      wq_status TEXT DEFAULT 'pending',
      tracking_status TEXT DEFAULT 'not_tracked',
      current_eligibility_status TEXT DEFAULT 'eligible',
      eligibility_basis TEXT,
      sync_status TEXT DEFAULT 'local',
      created_at TEXT,
      updated_at TEXT
    )
  `);

  db.runSync(`
    CREATE TABLE IF NOT EXISTS pregnancies (
      pregnancy_id TEXT PRIMARY KEY,
      woman_id TEXT NOT NULL,
      household_member_id TEXT,
      household_id TEXT NOT NULL,
      site_id INTEGER,
      locality_code TEXT,
      pregnancy_sequence INTEGER,
      pregnancy_status TEXT DEFAULT 'active',
      detected_date TEXT,
      enrollment_date TEXT,
      usg_available INTEGER DEFAULT 0,
      source_form_response_id TEXT,
      source_event_id TEXT,
      sync_status TEXT DEFAULT 'local',
      created_at TEXT,
      updated_at TEXT
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
      sync_status TEXT DEFAULT 'pending',
      updated_at TEXT
    )
  `);

  for (const statement of [
    "ALTER TABLE form_responses ADD COLUMN household_id TEXT",
    "ALTER TABLE form_responses ADD COLUMN site_id INTEGER",
    "ALTER TABLE form_responses ADD COLUMN locality_code TEXT",
    "ALTER TABLE form_responses ADD COLUMN subject_type TEXT",
    "ALTER TABLE form_responses ADD COLUMN subject_id TEXT",
    "ALTER TABLE form_responses ADD COLUMN sync_error TEXT",
    "ALTER TABLE form_responses ADD COLUMN sync_error_at TEXT",
    "ALTER TABLE pregnancies ADD COLUMN usg_available INTEGER DEFAULT 0",
    "ALTER TABLE pregnancies ADD COLUMN source_form_response_id TEXT",
    "ALTER TABLE pregnancies ADD COLUMN source_event_id TEXT",
    "ALTER TABLE follow_up_tasks ADD COLUMN lifecycle_status TEXT DEFAULT 'open'",
    "ALTER TABLE follow_up_tasks ADD COLUMN failed_attempt_count INTEGER DEFAULT 0",
    "ALTER TABLE follow_up_tasks ADD COLUMN max_failed_attempts INTEGER",
    "ALTER TABLE follow_up_tasks ADD COLUMN requires_final_close_reason INTEGER DEFAULT 0",
    "ALTER TABLE follow_up_tasks ADD COLUMN closed_reason TEXT",
    "ALTER TABLE follow_up_tasks ADD COLUMN closed_at TEXT",
    "ALTER TABLE follow_up_tasks ADD COLUMN generation_source TEXT",
    "ALTER TABLE follow_up_tasks ADD COLUMN source_event_id TEXT",
    "ALTER TABLE follow_up_tasks ADD COLUMN source_form_response_id TEXT",
    "ALTER TABLE follow_up_tasks ADD COLUMN sync_status TEXT DEFAULT 'local'",
    "ALTER TABLE follow_up_tasks ADD COLUMN server_commit_sequence INTEGER",
    "ALTER TABLE form_responses ADD COLUMN updated_at TEXT",
    "ALTER TABLE domain_events_outbox ADD COLUMN updated_at TEXT",
  ]) {
    try {
      db.runSync(statement);
    } catch {
      // Column already exists on upgraded local stores.
    }
  }

  schemaInitialized = true;
  return db;
}

export function getDb() {
  return initTaskDb();
}
