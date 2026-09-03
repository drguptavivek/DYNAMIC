/**
 * Initializes task, workflow, response, draft, and outbox tables on the shared offline database.
 */
import { getOfflineDatabase } from "../storage/offlineDatabase";
import { deriveDraftIndexFields } from "../questionnaires/draftPendingForms.js";

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
      server_response_status TEXT,
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
      updated_at TEXT NOT NULL,
      household_id TEXT,
      site_id TEXT,
      locality_code TEXT,
      woman_id TEXT,
      structure_map_id TEXT,
      household_number TEXT,
      answer_count INTEGER,
      respondent_label TEXT
    )
  `);

  db.runSync(`
    CREATE INDEX IF NOT EXISTS questionnaire_drafts_key_status_idx
    ON questionnaire_drafts (draft_key, draft_status, updated_at)
  `);

  db.runSync(`
    CREATE INDEX IF NOT EXISTS questionnaire_drafts_active_scope_idx
    ON questionnaire_drafts (draft_status, form_code, user_id, updated_at)
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
    CREATE TABLE IF NOT EXISTS app_timings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      meta TEXT,
      at TEXT NOT NULL,
      app_version TEXT,
      device_id TEXT
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
    "ALTER TABLE form_responses ADD COLUMN server_response_status TEXT",
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
    "ALTER TABLE questionnaire_drafts ADD COLUMN household_id TEXT",
    "ALTER TABLE questionnaire_drafts ADD COLUMN site_id TEXT",
    "ALTER TABLE questionnaire_drafts ADD COLUMN locality_code TEXT",
    "ALTER TABLE questionnaire_drafts ADD COLUMN woman_id TEXT",
    "ALTER TABLE questionnaire_drafts ADD COLUMN structure_map_id TEXT",
    "ALTER TABLE questionnaire_drafts ADD COLUMN household_number TEXT",
    "ALTER TABLE questionnaire_drafts ADD COLUMN answer_count INTEGER",
    "ALTER TABLE questionnaire_drafts ADD COLUMN respondent_label TEXT",
  ]) {
    try {
      db.runSync(statement);
    } catch {
      // Column already exists on upgraded local stores.
    }
  }

  for (const statement of [
    "CREATE INDEX IF NOT EXISTS follow_up_tasks_status_target_date_idx ON follow_up_tasks (status, target_date)",
    "CREATE INDEX IF NOT EXISTS follow_up_tasks_locality_status_idx ON follow_up_tasks (assigned_locality_code, status)",
    "CREATE INDEX IF NOT EXISTS follow_up_tasks_sync_status_idx ON follow_up_tasks (sync_status)",
    "CREATE INDEX IF NOT EXISTS follow_up_tasks_household_id_idx ON follow_up_tasks (household_id)",
    "CREATE INDEX IF NOT EXISTS form_responses_sync_status_submitted_at_idx ON form_responses (sync_status, submitted_at)",
    "CREATE INDEX IF NOT EXISTS form_responses_household_id_idx ON form_responses (household_id)",
    "CREATE INDEX IF NOT EXISTS task_attempts_task_id_idx ON task_attempts (task_id)",
    "CREATE INDEX IF NOT EXISTS app_timings_name_at_idx ON app_timings (name, at)",
    "CREATE INDEX IF NOT EXISTS questionnaire_drafts_status_household_idx ON questionnaire_drafts (draft_status, household_id)",
    "CREATE INDEX IF NOT EXISTS questionnaire_drafts_status_woman_idx ON questionnaire_drafts (draft_status, woman_id)",
    "CREATE INDEX IF NOT EXISTS questionnaire_drafts_status_site_locality_idx ON questionnaire_drafts (draft_status, site_id, locality_code)",
  ]) {
    try {
      db.runSync(statement);
    } catch {
      // Index target column missing on an unexpected schema variant; skip rather than brick startup.
    }
  }

  schemaInitialized = true;
  return db;
}

// One-time backfill (guarded by sync_meta) that populates the
// questionnaire_drafts index columns (household_id, site_id, locality_code,
// woman_id, structure_map_id, household_number, answer_count,
// respondent_label) for rows written before those columns existed. Runs
// inside a single transaction and is safe to call on an empty table; a
// second call (or a second process launch, since the meta key persists) is
// a no-op because it checks sync_meta before doing any work.
//
// Deliberately NOT wired into initTaskDb() itself: initTaskDb()/getDb() is
// shared by every table on the offline database (follow_up_tasks,
// form_responses, eligible_women, ...), so running this here would add an
// extra SELECT (and possibly UPDATE/COMMIT) to every caller of getDb(), not
// just questionnaire-draft callers. Instead, questionnaireDraftRepository.js
// calls this once, lazily, the first time its native code path actually
// touches the database.
const QUESTIONNAIRE_DRAFTS_INDEX_BACKFILL_META_KEY = "questionnaire_drafts_index_backfill_v1";

export function runQuestionnaireDraftIndexBackfill(db) {
  const metaRow = db.getFirstSync("SELECT value FROM sync_meta WHERE key = ?", [
    QUESTIONNAIRE_DRAFTS_INDEX_BACKFILL_META_KEY,
  ]);
  if (metaRow) return;

  const rows = db.getAllSync(
    `SELECT draft_id, json_payload, subject_id, household_id, site_id, locality_code,
      woman_id, structure_map_id, household_number, answer_count, respondent_label
     FROM questionnaire_drafts
     WHERE household_id IS NULL AND woman_id IS NULL AND answer_count IS NULL`,
    [],
  );

  if (rows.length > 0) {
    db.runSync("BEGIN");
    try {
      for (const row of rows) {
        let payload;
        try {
          payload = JSON.parse(row.json_payload || "") || {};
        } catch {
          payload = {};
        }
        const derived = deriveDraftIndexFields({ ...row, json_payload: payload });
        db.runSync(
          `UPDATE questionnaire_drafts SET
            household_id = ?, site_id = ?, locality_code = ?, woman_id = ?,
            structure_map_id = ?, household_number = ?, answer_count = ?, respondent_label = ?
           WHERE draft_id = ?`,
          [
            derived.household_id,
            derived.site_id,
            derived.locality_code,
            derived.woman_id,
            derived.structure_map_id,
            derived.household_number,
            derived.answer_count,
            derived.respondent_label,
            row.draft_id,
          ],
        );
      }
      db.runSync("COMMIT");
    } catch (err) {
      db.runSync("ROLLBACK");
      throw err;
    }
  }

  db.runSync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", [
    QUESTIONNAIRE_DRAFTS_INDEX_BACKFILL_META_KEY,
    "1",
  ]);
}

export function getDb() {
  return initTaskDb();
}
