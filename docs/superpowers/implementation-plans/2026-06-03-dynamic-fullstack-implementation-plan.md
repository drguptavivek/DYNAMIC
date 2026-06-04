# DYNAMIC Fullstack Offline Architecture — Implementation Plan

## Context

The DYNAMIC PreTSING study needs a longitudinal data-capture system with offline Android data collection, a Postgres backend, a Vite React admin app, and shared workflow rules. The architecture design is approved (`docs/superpowers/specs/2026-06-03-dynamic-fullstack-offline-architecture-design.md`).

**Current state**: A working prototype exists but is purely form-first — plain JavaScript, JSON file persistence, no task system, no domain model, no sync, no scheduling. The prototype must be rebuilt on a normalized domain model with immutable form responses, domain events, follow-up tasks, and area-scoped offline sync.

**Stable forms** (questions that contribute to events/tasks are finalized):

- HHQ (76 questions) — household creation, member listing, WQ eligibility
- WQ (123 questions) — woman enrollment, pregnancy detection, reproductive history
- HRF (17 questions) — household rounds, pregnancy detection, new eligible women, roster changes
- PEF (81 questions) — pregnancy enrollment, LMP, USG availability

**Forms likely to update in 20-30 days**: UF, PFF, POF, BAF, SBF, NFF, CDF. VA form JSON is pending.

**Goal**: Transform the prototype into a production-grade system across 8 phases, delivering incremental value at each step.

## Tech Stack

| Layer           | Choice                                         |
| --------------- | ---------------------------------------------- |
| Monorepo        | Turborepo                                      |
| Shared packages | TypeScript + Zod (validation + type inference) |
| Backend API     | Node.js + Express                              |
| Backend ORM     | Drizzle ORM + Postgres                         |
| Backend DB      | PostgreSQL                                     |
| Admin app       | Vite + React                                   |
| Expo ORM        | Drizzle ORM + op-sqlite                        |
| Expo local DB   | SQLite via op-sqlite                           |
| Form renderer   | SurveyJS                                       |

Monorepo package layout:

```
packages/
  shared-domain/       # TypeScript types, Zod schemas, ID construction rules
  shared-workflow/     # Protocol config, workflow rules, task generators
  shared-context/      # Context builders + prefill mappers
apps/
  api/                 # Express backend
  admin/               # Vite React admin
  expo/                # Expo Android app
```

---

## SECTION A: Complete Domain Model

### A1. Study Masters

```sql
-- Mapping frame / study geography
study_sites (
  site_id        INT PRIMARY KEY,
  site_code      TEXT NOT NULL,     -- 'BRL', 'BLB', 'BGM', 'CHN'
  site_name      TEXT NOT NULL
)

study_localities (
  site_id        INT NOT NULL REFERENCES study_sites,
  locality_code  TEXT NOT NULL,
  locality_name  TEXT NOT NULL,
  locality_type  TEXT,              -- 'urban', 'rural'
  PRIMARY KEY (site_id, locality_code)
)

mapping_frame (
  site_id            INT NOT NULL,
  locality_code      TEXT NOT NULL,
  structure_map_id   TEXT NOT NULL,  -- 4-digit
  household_number   TEXT NOT NULL,  -- 2-digit
  household_id       TEXT PRIMARY KEY, -- computed: site_id-locality_code-structure_map_id-household_number
  structure_id       TEXT NOT NULL,    -- computed: site_id-locality_code-structure_map_id
  mapping_status     TEXT DEFAULT 'listed', -- 'listed', 'enrolled', 'empty', 'vacant', 'not_found'
  baseline_enrollment_status TEXT DEFAULT 'pending',
  PRIMARY KEY (household_id)
)
```

### A2. Household

```sql
households (
  household_id              TEXT PRIMARY KEY,
  site_id                   INT NOT NULL,
  locality_code             TEXT NOT NULL,
  structure_map_id          TEXT NOT NULL,
  household_number          TEXT NOT NULL,
  residence_area_type       INT,            -- from hhq_residence_area_type: 1=urban, 2=rural
  address                   TEXT,
  household_head_name       TEXT,
  contact_mobile            TEXT,           -- from hhq_contact_mobile
  consent_status            TEXT,           -- from hhq_consent_study_provide_pis
  result_interview          INT,            -- from hhq_result_interview
  language_questionnaire    INT,            -- from hhq_language_questionnaire
  baseline_enrollment_status TEXT DEFAULT 'pending',
  baseline_completed_date   DATE,
  cohort_status             TEXT,           -- 'enrolled', 'empty_at_baseline', 'refused', 'not_found'
  closed_reason             TEXT,
  religion_head             INT,            -- from hhq_religion_head_household
  caste_category            INT,            -- from hhq_head_household_belong
  household_characteristics JSONB,          -- all page_03 HHQ fields (water, toilet, assets, fuel, etc.)
  sync_status               TEXT DEFAULT 'local',
  created_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ
)
```

### A3. Person / Household Member

```sql
household_members (
  household_member_id  TEXT PRIMARY KEY,    -- household_id + member_number (zero-padded 2)
  household_id         TEXT NOT NULL REFERENCES households,
  member_number        INT NOT NULL,        -- auto-increment within household
  site_id              INT NOT NULL,
  locality_code        TEXT NOT NULL,
  name                 TEXT,                -- from member_name
  relationship_to_head INT,                 -- from member_relationship_to_head
  sex                  INT,                 -- from member_sex
  last_residence_place INT,                 -- from member_last_residence_place
  residence_months     INT,                 -- from member_residence_duration.months
  residence_years      INT,                 -- from member_residence_duration.years
  date_of_birth        DATE,
  date_of_birth_precision TEXT DEFAULT 'inferred_from_age',
  reported_age_years   INT,                 -- from member_age_years
  reported_age_as_of_date DATE,
  dob_inference_rule_version TEXT,
  marital_status       INT,                 -- from member_marital_status
  woman_questionnaire_eligible BOOLEAN DEFAULT false,
  birth_registration_status INT,
  ever_attended_school INT,
  highest_grade_completed INT,
  member_status        TEXT DEFAULT 'active', -- 'active', 'moved_out', 'deceased'
  usual_resident       BOOLEAN DEFAULT true,
  member_source        TEXT DEFAULT 'baseline', -- 'baseline', 'in_migration', 'marriage_in', 'birth'
  sync_status          TEXT DEFAULT 'local',
  created_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ,
  UNIQUE(household_id, member_number)
)
```

### A4. Eligible Woman State

```sql
eligible_women (
  woman_id                  TEXT PRIMARY KEY,  -- = household_member_id
  household_member_id       TEXT NOT NULL REFERENCES household_members,
  household_id              TEXT NOT NULL REFERENCES households,
  site_id                   INT NOT NULL,
  locality_code             TEXT NOT NULL,
  eligibility_start_date    DATE,
  eligibility_source_event_id TEXT,
  wq_status                 TEXT DEFAULT 'pending',  -- 'pending', 'completed', 'not_applicable'
  tracking_status           TEXT DEFAULT 'not_tracked',
  current_eligibility_status TEXT DEFAULT 'eligible',
  eligibility_basis         TEXT,
  woman_permanent_id        TEXT,              -- UUID generated once
  analysis_eligibility_flag TEXT,
  sync_status               TEXT DEFAULT 'local',
  created_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ
)

eligibility_assessments (
  assessment_id          TEXT PRIMARY KEY,
  person_id              TEXT NOT NULL,
  household_id           TEXT NOT NULL,
  assessment_date        DATE NOT NULL,
  age_years_used         INT,
  age_source             TEXT,
  sex_used               INT,
  marital_status_used    INT,
  usual_resident_used    BOOLEAN,
  eligible_wq            BOOLEAN,
  eligible_pregnancy_tracking BOOLEAN,
  created_event_id       TEXT
)
```

### A5. Pregnancy

```sql
pregnancies (
  pregnancy_id              TEXT PRIMARY KEY,   -- UUID (per spec)
  woman_id                  TEXT NOT NULL REFERENCES eligible_women,
  household_member_id       TEXT NOT NULL,
  household_id              TEXT NOT NULL,
  site_id                   INT NOT NULL,
  locality_code             TEXT NOT NULL,
  pregnancy_sequence        INT NOT NULL,        -- pef_pregnancy_rank_since_baseline
  pregnancy_status          TEXT DEFAULT 'active', -- 'active', 'outcome_recorded', 'loss'
  detected_date             DATE,
  enrollment_date           DATE,                 -- pef_enrollment_date
  detection_source          TEXT,                  -- from pef_pregnancy_information_source
  lmp_date                  DATE,
  lmp_precision             TEXT,                  -- 'exact_date', 'days_ago', 'weeks_ago', 'months_ago', 'unknown'
  edd_date                  DATE,
  outcome_recorded_date     DATE,
  gestational_age_at_enrollment INT,              -- from PEF weeks/months questions
  current_conditions        JSONB,                -- diabetes, hypertension, etc. from PEF
  current_symptoms          JSONB,                -- symptoms checklist from PEF
  anthropometrics           JSONB,                -- weight, height, BP from PEF
  source_event_id           TEXT,
  sync_status               TEXT DEFAULT 'local',
  created_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ
)

ultrasound_records (
  ultrasound_id       TEXT PRIMARY KEY,
  pregnancy_id        TEXT NOT NULL REFERENCES pregnancies,
  woman_id            TEXT NOT NULL,
  household_id        TEXT NOT NULL,
  site_id             INT NOT NULL,
  report_date         DATE,
  report_sequence     INT NOT NULL,          -- first, second, third
  gestational_age     INT,                   -- in weeks
  attachment_reference TEXT,
  source_form_response_id TEXT,
  created_at          TIMESTAMPTZ
)
```

### A6. Pregnancy Outcome + Birth/Child

```sql
pregnancy_outcomes (
  pregnancy_outcome_id    TEXT PRIMARY KEY,
  pregnancy_id            TEXT NOT NULL REFERENCES pregnancies,
  outcome_date            DATE NOT NULL,
  outcome_type            TEXT NOT NULL,       -- 'live_birth', 'stillbirth', 'miscarriage', 'abortion', 'ectopic'
  gestational_age_at_outcome INT,              -- in weeks
  live_birth_count        INT DEFAULT 0,
  fetal_loss_count        INT DEFAULT 0,
  source_form_response_id TEXT,
  created_at              TIMESTAMPTZ
)

children (
  child_id              TEXT PRIMARY KEY,      -- = birth_id: pregnancy_id + "-B" + birth_rank
  birth_id              TEXT NOT NULL,          -- same as child_id
  pregnancy_id          TEXT NOT NULL REFERENCES pregnancies,
  woman_id              TEXT NOT NULL,
  household_id          TEXT NOT NULL,
  site_id               INT NOT NULL,
  birth_rank            INT NOT NULL,           -- 1, 2, 3... per pregnancy
  birth_date            DATE,
  birth_status          TEXT,                   -- 'live_birth', 'stillbirth', 'fetal_loss_20plus'
  live_birth_status     BOOLEAN,
  current_vital_status  TEXT DEFAULT 'alive',   -- 'alive', 'deceased', 'unknown'
  death_date            DATE,
  gestational_age_at_birth INT,                 -- in weeks
  sex                   INT,                    -- from BAF
  birth_weight_grams    INT,                    -- from BAF
  source_event_id       TEXT,
  sync_status           TEXT DEFAULT 'local',
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ
)
```

### A7. Visit + Form Response

```sql
visits (
  visit_id             TEXT PRIMARY KEY,        -- UUID
  session_id           TEXT,                    -- UUID, same for combined forms
  site_id              INT NOT NULL,
  locality_code        TEXT NOT NULL,
  household_id         TEXT NOT NULL,
  primary_subject_type TEXT,                    -- 'household', 'woman', 'pregnancy', 'child'
  primary_subject_id   TEXT,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  interviewer_id       TEXT,
  device_id            TEXT,
  actual_mode          TEXT,                    -- 'face_to_face', 'telephonic'
  gps_metadata         JSONB,
  sync_status          TEXT DEFAULT 'local',
  created_at           TIMESTAMPTZ
)

form_responses (
  form_response_id     TEXT PRIMARY KEY,        -- UUID
  response_id          TEXT NOT NULL UNIQUE,    -- idempotency key, UUID from device
  site_id              INT NOT NULL,
  locality_code        TEXT NOT NULL,
  household_id         TEXT,
  visit_id             TEXT REFERENCES visits,
  task_id              TEXT,
  series_id            TEXT,
  sequence_number      INT,
  form_code            TEXT NOT NULL,           -- 'HHQ', 'WQ', 'HRF', 'PEF', 'UF', 'PFF', 'POF', 'BAF', 'SBF', 'NFF', 'CDF', 'VA'
  form_version         TEXT NOT NULL,
  subject_type         TEXT,                    -- 'household', 'person', 'woman', 'pregnancy', 'child'
  subject_id           TEXT,
  lineage_ids_json     JSONB,                   -- {site_id, locality_code, structure_map_id, household_id, household_member_id, woman_id, pregnancy_id, child_id}
  prefill_snapshot_json JSONB,
  prefill_mapper_version TEXT,
  answers_json         JSONB NOT NULL,          -- the full SurveyJS response
  created_offline_at   TIMESTAMPTZ,
  updated_offline_at   TIMESTAMPTZ,
  device_id            TEXT,
  synced_at            TIMESTAMPTZ,
  response_status      TEXT DEFAULT 'primary',  -- 'primary', 'duplicate_task_completion', 'superseded_by_admin'
  created_at           TIMESTAMPTZ
)
```

### A8. Domain Events

```sql
domain_events (
  event_id             TEXT PRIMARY KEY,        -- UUID
  event_type           TEXT NOT NULL,           -- see event type table below
  site_id              INT NOT NULL,
  locality_code        TEXT NOT NULL,
  household_id         TEXT,
  subject_type         TEXT,                    -- 'household', 'person', 'woman', 'pregnancy', 'child'
  subject_id           TEXT,
  visit_id             TEXT,
  task_id              TEXT,
  form_response_id     TEXT,
  event_datetime       TIMESTAMPTZ NOT NULL,
  created_offline_at   TIMESTAMPTZ,
  device_id            TEXT,
  sync_status          TEXT DEFAULT 'local',
  apply_status         TEXT DEFAULT 'applied',  -- 'applied', 'held_duplicate', 'rejected_invalid', 'superseded'
  created_at           TIMESTAMPTZ
)
```

**Event types and what generates them:**

| Event Type                     | Generated When                                                  | Key Fields                                                     | Downstream Task                                                  |
| ------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `household_enrolled`           | HHQ completed with result_interview=1 (completed)               | household_id, baseline_completed_date                          | HRF schedule (bi-monthly from baseline)                          |
| `household_round_completed`    | HRF completed                                                   | household_id, hrf_round_type, hrf_interview_date               | Next HRF planned task                                            |
| `woman_eligible`               | HHQ/WQ/HRF detects eligible woman                               | woman_id, household_member_id                                  | WQ task if not completed                                         |
| `wq_completed`                 | WQ completed                                                    | woman_id                                                       | PEF task if currently pregnant                                   |
| `pregnancy_detected`           | WQ question wq_pregnant=yes OR HRF question hrf_pregnant=yes    | woman_id                                                       | PEF task (immediate)                                             |
| `pregnancy_enrolled`           | PEF completed                                                   | pregnancy_id, enrollment_date, lmp_date                        | PFF schedule (monthly from enrollment), UF task if USG available |
| `usg_report_available`         | PEF questions 12-16 indicate USG exists, or PFF reports new USG | pregnancy_id                                                   | UF task (immediate)                                              |
| `pregnancy_followup_completed` | PFF completed                                                   | pregnancy_id, sequence_number                                  | Next PFF task                                                    |
| `delivery_reported`            | PFF reports delivery                                            | pregnancy_id                                                   | POF task (immediate)                                             |
| `pregnancy_outcome_recorded`   | POF completed                                                   | pregnancy_id, outcome_type, live_birth_count, fetal_loss_count | BAF task per qualifying birth; supersede future PFF              |
| `birth_assessment_completed`   | BAF completed                                                   | child_id, birth_status, vital_status                           | NFF if alive, SBF if stillbirth, CDF if died                     |
| `stillbirth_recorded`          | BAF classifies stillbirth                                       | child_id                                                       | SBF task, VA task at +30 days                                    |
| `newborn_followup_completed`   | NFF completed                                                   | child_id, visit_label                                          | Next NFF task if alive, CDF if died                              |
| `child_death_recorded`         | BAF/NFF reports child death                                     | child_id, death_date                                           | CDF task (immediate), VA task at death_date + 30 days            |
| `verbal_autopsy_due`           | Stillbirth or child death + 30 days                             | child_id                                                       | VA task (disabled until JSON available)                          |
| `verbal_autopsy_completed`     | VA completed                                                    | child_id                                                       | —                                                                |
| `person_dob_updated`           | Admin correction                                                | person_id                                                      | Eligibility recalculation                                        |
| `member_in_migrated`           | HRF detects new member via in-migration                         | household_member_id                                            | Eligibility recalculation                                        |
| `member_married_in`            | HRF detects new member via marriage-in                          | household_member_id                                            | WQ task if eligible                                              |
| `member_out_migrated`          | HRF reports out-migration                                       | household_member_id                                            | Update tracking status                                           |
| `member_deceased`              | HRF reports death                                               | household_member_id                                            | Update tracking status                                           |
| `new_eligible_woman_found`     | HRF detects new eligible woman (age-up or in-migration)         | woman_id                                                       | WQ task                                                          |

### A9. Follow-Up Tasks

```sql
follow_up_tasks (
  task_id                  TEXT PRIMARY KEY,    -- UUID
  task_key                 TEXT NOT NULL,        -- deterministic for merge: household_id + subject_type + subject_id + task_type + protocol_visit_label + target_date + rules_version
  site_id                  INT NOT NULL,
  locality_code            TEXT NOT NULL,
  household_id             TEXT,
  subject_type             TEXT NOT NULL,        -- 'household', 'woman', 'pregnancy', 'child'
  subject_id               TEXT NOT NULL,
  woman_id                 TEXT,
  pregnancy_id             TEXT,
  child_id                 TEXT,
  task_type                TEXT NOT NULL,        -- 'HHQ', 'WQ', 'HRF', 'PEF', 'UF', 'PFF', 'POF', 'BAF', 'SBF', 'NFF', 'CDF', 'VA'
  form_code                TEXT,                 -- the SurveyJS form to open
  expected_forms           TEXT[],               -- array of form codes
  series_id                TEXT,                 -- groups tasks in a repeated series
  sequence_number          INT,                  -- round/visit number within series
  protocol_visit_label     TEXT,                 -- 'HRF-R1', 'PFF-M1', 'NFF-7d', 'NFF-28d', 'NFF-2m', etc.
  generation_source        TEXT NOT NULL,        -- 'scheduled', 'event_triggered', 'unscheduled_opportunity'
  source_event_id          TEXT,
  anchor_event_id          TEXT,
  anchor_date              DATE,
  window_start             DATE,
  target_date              DATE NOT NULL,
  deadline_date            DATE,
  status                   TEXT DEFAULT 'planned', -- 'planned', 'due', 'urgent', 'overdue', 'in_progress', 'completed_on_time', 'completed_late', 'missed', 'postponed', 'not_reachable_closed', 'cancelled', 'superseded'
  priority                 INT DEFAULT 0,
  default_expected_mode    TEXT,                 -- 'face_to_face', 'telephonic'
  allowed_modes            TEXT[],               -- ['face_to_face', 'telephonic']
  mode_rule_strength       TEXT,                 -- 'default', 'required', 'flexible'
  max_failed_attempts      INT,
  failed_attempt_count     INT DEFAULT 0,
  requires_final_close_reason BOOLEAN DEFAULT false,
  task_context_json        JSONB,
  context_builder_version  TEXT,
  prefill_mapper_version   TEXT,
  rules_version            TEXT,
  form_availability        TEXT DEFAULT 'available', -- 'available', 'disabled'
  action_state             TEXT DEFAULT 'enabled',   -- 'enabled', 'disabled'
  disabled_reason          TEXT,                     -- 'va_json_pending', etc.
  completed_visit_id       TEXT,
  completed_at             TIMESTAMPTZ,
  closed_at                TIMESTAMPTZ,
  closed_reason            TEXT,
  superseded_by_event_id   TEXT,
  created_at               TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ,
  UNIQUE(task_key)
)
```

### A10. Task Attempts

```sql
task_attempts (
  attempt_id            TEXT PRIMARY KEY,
  task_id               TEXT NOT NULL REFERENCES follow_up_tasks,
  attempt_number        INT NOT NULL,
  visit_id              TEXT,
  attempted_at          TIMESTAMPTZ NOT NULL,
  attempted_by_user_id  TEXT,
  device_id             TEXT,
  attempted_mode        TEXT,                -- 'face_to_face', 'telephonic'
  outcome               TEXT NOT NULL,       -- 'completed', 'no_answer', 'phone_unreachable', 'household_locked', 'respondent_unavailable', 'refused', 'postponed', 'not_reachable'
  reason_code           TEXT,
  notes                 TEXT,
  next_attempt_date     DATE,
  created_at            TIMESTAMPTZ
)
```

### A11. Admin Corrections + Data Quality Flags

```sql
admin_correction_events (
  correction_event_id   TEXT PRIMARY KEY,
  site_id               INT NOT NULL,
  subject_type          TEXT NOT NULL,
  subject_id            TEXT NOT NULL,
  field_name            TEXT NOT NULL,
  old_value             TEXT,
  new_value             TEXT,
  old_precision         TEXT,
  new_precision         TEXT,
  reason_code           TEXT NOT NULL,
  reason_text           TEXT,
  source_reference      TEXT,
  corrected_by_user_id  TEXT NOT NULL,
  corrected_at          TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ
)

data_quality_flags (
  flag_id               TEXT PRIMARY KEY,
  site_id               INT NOT NULL,
  flag_type             TEXT NOT NULL,        -- 'duplicate_task_completion', 'identity_conflict', etc.
  subject_type          TEXT,
  subject_id            TEXT,
  task_id               TEXT,
  primary_response_id   TEXT,
  duplicate_response_id TEXT,
  severity              TEXT DEFAULT 'warning',
  status                TEXT DEFAULT 'open',  -- 'open', 'reviewed', 'resolved', 'escalated'
  created_at            TIMESTAMPTZ,
  reviewed_by_user_id   TEXT,
  reviewed_at           TIMESTAMPTZ,
  review_note           TEXT
)

person_attribute_history (
  history_id            TEXT PRIMARY KEY,
  person_id             TEXT NOT NULL,
  field_name            TEXT NOT NULL,
  old_value             TEXT,
  old_precision         TEXT,
  new_value             TEXT,
  new_precision         TEXT,
  source_form_response_id TEXT,
  source_event_id       TEXT,
  changed_at            TIMESTAMPTZ NOT NULL,
  changed_by_user_id    TEXT,
  device_id             TEXT
)
```

### A12. Sync/Auth Tables

```sql
users (
  user_id               TEXT PRIMARY KEY,
  username              TEXT NOT NULL UNIQUE,
  display_name          TEXT,
  email                 TEXT,
  role                  TEXT NOT NULL,          -- 'field_worker', 'field_supervisor', 'site_research_scientist', 'central_admin'
  site_id               INT,                    -- null for central_admin
  password_hash         TEXT NOT NULL,
  active                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ
)

devices (
  device_id             TEXT PRIMARY KEY,
  device_name           TEXT,
  user_id               TEXT REFERENCES users,
  last_sync_at          TIMESTAMPTZ,
  registered_at         TIMESTAMPTZ
)

user_area_assignments (
  assignment_id         TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users,
  site_id               INT NOT NULL,
  locality_code         TEXT NOT NULL,
  role                  TEXT NOT NULL,
  active_from           DATE,
  active_to             DATE,
  created_at            TIMESTAMPTZ
)

sync_logs (
  sync_log_id           TEXT PRIMARY KEY,
  device_id             TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  direction             TEXT NOT NULL,           -- 'push', 'pull'
  records_sent          INT,
  records_received      INT,
  conflicts_detected    INT DEFAULT 0,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  status                TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  error_detail          TEXT
)
```

---

### A13. Expo SQLite Schema (op-sqlite + Drizzle)

SQLite type rules vs Postgres: `TIMESTAMPTZ` → `TEXT` (ISO 8601), `JSONB` → `TEXT` (JSON string), `TEXT[]` → `TEXT` (JSON array string), `BOOLEAN` → `INTEGER` (0/1), `INT` → `INTEGER`.

Only operational tables are synced to device. Admin-only tables (admin_correction_events, person_attribute_history, sync_logs, users other than self) remain backend-side.

```sql
-- Synced from server (read-mostly, replaced/updated on pull)
mapping_frame_local (
  household_id         TEXT PRIMARY KEY,
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  structure_map_id     TEXT NOT NULL,
  household_number     TEXT NOT NULL,
  mapping_status       TEXT DEFAULT 'listed',
  baseline_enrollment_status TEXT DEFAULT 'pending',
  updated_at           TEXT
)

households_local (
  household_id         TEXT PRIMARY KEY,
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  structure_map_id     TEXT NOT NULL,
  household_number     TEXT NOT NULL,
  household_head_name  TEXT,
  contact_mobile       TEXT,
  consent_status       TEXT,
  result_interview     INTEGER,
  cohort_status        TEXT,
  baseline_completed_date TEXT,
  household_characteristics TEXT,   -- JSON
  sync_status          TEXT DEFAULT 'synced',
  updated_at           TEXT
)

household_members_local (
  household_member_id  TEXT PRIMARY KEY,
  household_id         TEXT NOT NULL,
  member_number        INTEGER NOT NULL,
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  name                 TEXT,
  sex                  INTEGER,
  date_of_birth        TEXT,
  date_of_birth_precision TEXT,
  reported_age_years   INTEGER,
  marital_status       INTEGER,
  member_status        TEXT DEFAULT 'active',
  usual_resident       INTEGER DEFAULT 1,
  woman_questionnaire_eligible INTEGER DEFAULT 0,
  member_source        TEXT DEFAULT 'baseline',
  sync_status          TEXT DEFAULT 'synced',
  updated_at           TEXT
)

eligible_women_local (
  woman_id             TEXT PRIMARY KEY,
  household_member_id  TEXT NOT NULL,
  household_id         TEXT NOT NULL,
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  eligibility_start_date TEXT,
  wq_status            TEXT DEFAULT 'pending',
  tracking_status      TEXT DEFAULT 'not_tracked',
  current_eligibility_status TEXT DEFAULT 'eligible',
  sync_status          TEXT DEFAULT 'synced',
  updated_at           TEXT
)

pregnancies_local (
  pregnancy_id         TEXT PRIMARY KEY,
  woman_id             TEXT NOT NULL,
  household_member_id  TEXT NOT NULL,
  household_id         TEXT NOT NULL,
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  pregnancy_sequence   INTEGER NOT NULL,
  pregnancy_status     TEXT DEFAULT 'active',
  detected_date        TEXT,
  enrollment_date      TEXT,
  lmp_date             TEXT,
  edd_date             TEXT,
  outcome_recorded_date TEXT,
  sync_status          TEXT DEFAULT 'synced',
  updated_at           TEXT
)

ultrasound_records_local (
  ultrasound_id        TEXT PRIMARY KEY,
  pregnancy_id         TEXT NOT NULL,
  woman_id             TEXT NOT NULL,
  household_id         TEXT NOT NULL,
  report_date          TEXT,
  report_sequence      INTEGER NOT NULL,
  gestational_age      INTEGER,
  source_form_response_id TEXT,
  sync_status          TEXT DEFAULT 'synced',
  created_at           TEXT
)

children_local (
  child_id             TEXT PRIMARY KEY,
  pregnancy_id         TEXT NOT NULL,
  woman_id             TEXT NOT NULL,
  household_id         TEXT NOT NULL,
  site_id              INTEGER NOT NULL,
  birth_rank           INTEGER NOT NULL,
  birth_date           TEXT,
  birth_status         TEXT,
  live_birth_status    INTEGER,
  current_vital_status TEXT DEFAULT 'alive',
  death_date           TEXT,
  sync_status          TEXT DEFAULT 'synced',
  updated_at           TEXT
)

follow_up_tasks_local (
  task_id              TEXT PRIMARY KEY,
  task_key             TEXT NOT NULL UNIQUE,
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  household_id         TEXT,
  subject_type         TEXT NOT NULL,
  subject_id           TEXT NOT NULL,
  woman_id             TEXT,
  pregnancy_id         TEXT,
  child_id             TEXT,
  task_type            TEXT NOT NULL,
  form_code            TEXT,
  expected_forms       TEXT,             -- JSON array
  series_id            TEXT,
  sequence_number      INTEGER,
  protocol_visit_label TEXT,
  generation_source    TEXT NOT NULL,
  source_event_id      TEXT,
  anchor_date          TEXT,
  window_start         TEXT,
  target_date          TEXT NOT NULL,
  deadline_date        TEXT,
  status               TEXT DEFAULT 'planned',
  priority             INTEGER DEFAULT 0,
  default_expected_mode TEXT,
  allowed_modes        TEXT,             -- JSON array
  max_failed_attempts  INTEGER,
  failed_attempt_count INTEGER DEFAULT 0,
  requires_final_close_reason INTEGER DEFAULT 0,
  task_context_json    TEXT,             -- JSON
  context_builder_version TEXT,
  prefill_mapper_version TEXT,
  rules_version        TEXT,
  form_availability    TEXT DEFAULT 'available',
  action_state         TEXT DEFAULT 'enabled',
  disabled_reason      TEXT,
  completed_at         TEXT,
  closed_at            TEXT,
  closed_reason        TEXT,
  sync_status          TEXT DEFAULT 'synced',
  updated_at           TEXT
)

task_attempts_local (
  attempt_id           TEXT PRIMARY KEY,
  task_id              TEXT NOT NULL,
  attempt_number       INTEGER NOT NULL,
  attempted_at         TEXT NOT NULL,
  attempted_by_user_id TEXT,
  device_id            TEXT,
  attempted_mode       TEXT,
  outcome              TEXT NOT NULL,
  reason_code          TEXT,
  notes                TEXT,
  next_attempt_date    TEXT,
  sync_status          TEXT DEFAULT 'synced',
  created_at           TEXT
)

-- Locally generated, pending sync
domain_events_local (
  event_id             TEXT PRIMARY KEY,
  event_type           TEXT NOT NULL,
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  household_id         TEXT,
  subject_type         TEXT,
  subject_id           TEXT,
  task_id              TEXT,
  form_response_id     TEXT,
  event_datetime       TEXT NOT NULL,
  created_offline_at   TEXT NOT NULL,
  device_id            TEXT,
  sync_status          TEXT DEFAULT 'pending',  -- 'pending', 'synced'
  apply_status         TEXT DEFAULT 'applied'
)

form_responses_local (
  form_response_id     TEXT PRIMARY KEY,
  response_id          TEXT NOT NULL UNIQUE,    -- idempotency key
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  household_id         TEXT,
  visit_id             TEXT,
  task_id              TEXT,
  series_id            TEXT,
  sequence_number      INTEGER,
  form_code            TEXT NOT NULL,
  form_version         TEXT NOT NULL,
  subject_type         TEXT,
  subject_id           TEXT,
  lineage_ids_json     TEXT,             -- JSON
  prefill_snapshot_json TEXT,            -- JSON
  prefill_mapper_version TEXT,
  answers_json         TEXT NOT NULL,    -- JSON
  created_offline_at   TEXT NOT NULL,
  device_id            TEXT,
  sync_status          TEXT DEFAULT 'pending',
  response_status      TEXT DEFAULT 'primary'
)

visits_local (
  visit_id             TEXT PRIMARY KEY,
  site_id              INTEGER NOT NULL,
  locality_code        TEXT NOT NULL,
  household_id         TEXT NOT NULL,
  primary_subject_type TEXT,
  primary_subject_id   TEXT,
  started_at           TEXT,
  completed_at         TEXT,
  interviewer_id       TEXT,
  device_id            TEXT,
  actual_mode          TEXT,
  sync_status          TEXT DEFAULT 'pending'
)

-- Outbox: all local records pending push
outbox (
  outbox_id            TEXT PRIMARY KEY,
  record_type          TEXT NOT NULL,   -- 'form_response'|'domain_event'|'task'|'task_attempt'|'visit'
  record_id            TEXT NOT NULL,   -- ID of the record in its local table
  idempotency_key      TEXT NOT NULL UNIQUE,
  payload_json         TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  sync_status          TEXT DEFAULT 'pending',  -- 'pending'|'synced'|'failed'
  retry_count          INTEGER DEFAULT 0,
  last_attempted_at    TEXT,
  error_detail         TEXT
)

-- Sync state key-value store
sync_state (
  key                  TEXT PRIMARY KEY,
  value                TEXT NOT NULL
)
-- Keys used:
--   sync_cursor                  : opaque server cursor from last pull
--   last_sync_at                 : ISO timestamp of last completed sync
--   protocol_config_version      : cached rules_version string
--   user_area_assignments        : JSON array of {site_id, locality_code}

-- Protocol config cache
protocol_config_cache (
  rules_version        TEXT PRIMARY KEY,
  config_json          TEXT NOT NULL,
  cached_at            TEXT NOT NULL
)

-- Form JSON cache
form_json_cache (
  form_code            TEXT NOT NULL,
  version              TEXT NOT NULL,
  checksum             TEXT NOT NULL,
  form_json            TEXT NOT NULL,
  cached_at            TEXT NOT NULL,
  PRIMARY KEY (form_code, version)
)
```

**Form versioning policy**: If a form version update (checksum mismatch) is detected during a pull, the app downloads the new version but continues any in-progress completion using the cached version it opened with. The saved `form_response.form_version` field records which version was used. The new version takes effect only for the next task opening.

---

## SECTION B: Complete API Surface

### B0. API Conventions

**Base URL**: `/api/v1` (version prefix for future compatibility)

**Authentication**: All endpoints require `Authorization: Bearer <jwt>` except `/api/auth/login`.

**Error response format** (all 4xx/5xx):

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {}
  }
}
```

| HTTP Status | Code               | When                                                              |
| ----------- | ------------------ | ----------------------------------------------------------------- |
| 400         | `BAD_REQUEST`      | Malformed request body or missing required fields                 |
| 401         | `UNAUTHORIZED`     | Missing or invalid JWT                                            |
| 403         | `FORBIDDEN`        | Valid JWT but insufficient role or wrong site                     |
| 404         | `NOT_FOUND`        | Resource does not exist                                           |
| 409         | `CONFLICT`         | Duplicate idempotency key (already accepted), task already closed |
| 422         | `VALIDATION_ERROR` | Business rule violation; `details` contains field-level reasons   |
| 500         | `INTERNAL_ERROR`   | Unexpected server error                                           |

**Success shape**: Resources returned directly. Lists use `{items: [...], total?: N}`.

### B1. Authentication

| Method | Path                | Request                | Response                                                                     | Notes                                                                        |
| ------ | ------------------- | ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| POST   | `/api/auth/login`   | `{username, password}` | `{token, refresh_token, expires_in: 172800, user: {user_id, role, site_id}}` | JWT; access token TTL = 2 days                                               |
| GET    | `/api/auth/me`      | —                      | `{user_id, username, role, site_id, area_assignments}`                       | Current user info                                                            |
| POST   | `/api/auth/refresh` | `{refresh_token}`      | `{token, refresh_token, expires_in: 172800}`                                 | Refresh token TTL = 30 days; re-login required if refresh token also expired |

### B2. Masters (Admin-managed reference data)

| Method | Path                                              | Request                                                                           | Response                                                                                                    | Role                                   |
| ------ | ------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| GET    | `/api/masters/sites`                              | —                                                                                 | `{sites: [{site_id, site_code, site_name}]}`                                                                | All authenticated                      |
| GET    | `/api/masters/sites/:site_id`                     | —                                                                                 | `{site_id, site_code, site_name, localities: [...]}`                                                        | All authenticated                      |
| POST   | `/api/masters/sites`                              | `{site_code, site_name}`                                                          | `{site_id, ...}`                                                                                            | central_admin                          |
| PUT    | `/api/masters/sites/:site_id`                     | `{site_code?, site_name?}`                                                        | `{site_id, ...}`                                                                                            | central_admin                          |
| GET    | `/api/masters/localities`                         | `?site_id=`                                                                       | `{localities: [{site_id, locality_code, locality_name, locality_type}]}`                                    | All authenticated                      |
| POST   | `/api/masters/localities`                         | `{site_id, locality_code, locality_name, locality_type}`                          | `{...}`                                                                                                     | central_admin                          |
| PUT    | `/api/masters/localities/:site_id/:locality_code` | `{locality_name?, locality_type?}`                                                | `{...}`                                                                                                     | central_admin                          |
| GET    | `/api/masters/mapping-frame`                      | `?site_id=&locality_code=&status=`                                                | `{frame: [{household_id, structure_map_id, household_number, mapping_status, baseline_enrollment_status}]}` | Admin roles                            |
| POST   | `/api/masters/mapping-frame`                      | `{site_id, locality_code, structure_map_id, household_number}`                    | `{household_id, ...}`                                                                                       | central_admin, site_research_scientist |
| POST   | `/api/masters/mapping-frame/bulk`                 | `{site_id, locality_code, rows: [{structure_map_id, household_number}, ...]}`     | `{created: N, skipped: N, errors: [...]}`                                                                   | central_admin, site_research_scientist |
| POST   | `/api/masters/mapping-frame/import-csv`           | multipart CSV file (columns: `locality_code, structure_map_id, household_number`) | `{created: N, skipped: N, errors: [{row, reason}]}`                                                         | central_admin                          |
| PUT    | `/api/masters/mapping-frame/:household_id/status` | `{mapping_status, baseline_enrollment_status}`                                    | `{...}`                                                                                                     | site_research_scientist, central_admin |

### B3. Domain Entity CRUD (Admin app)

| Method | Path                                    | Request                                           | Response                                                                                                          | Role        |
| ------ | --------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| GET    | `/api/households`                       | `?site_id=&locality_code=&search=&cohort_status=` | `{households: [{household_id, household_head_name, baseline_completed_date, cohort_status}]}`                     | Admin roles |
| GET    | `/api/households/:household_id`         | —                                                 | Full household record + members + women + pregnancies + children + recent tasks + events + flags                  | Admin roles |
| GET    | `/api/households/:household_id/members` | —                                                 | `{members: [{household_member_id, name, sex, age, marital_status, member_status, woman_questionnaire_eligible}]}` | Admin roles |
| GET    | `/api/persons/:person_id`               | —                                                 | Full person record + eligibility history + linked events                                                          | Admin roles |
| GET    | `/api/women`                            | `?site_id=&household_id=&tracking_status=`        | `{women: [{woman_id, name, wq_status, tracking_status}]}`                                                         | Admin roles |
| GET    | `/api/women/:woman_id`                  | —                                                 | Full woman record + pregnancies + eligibility assessments                                                         | Admin roles |
| GET    | `/api/pregnancies/:pregnancy_id`        | —                                                 | Full pregnancy + USG records + PFF history + outcome                                                              | Admin roles |
| GET    | `/api/children/:child_id`               | —                                                 | Full child + NFF history + BAF outcome + death/VA if applicable                                                   | Admin roles |

### B4. Form Responses (Read-only for admin)

| Method | Path                               | Request                                         | Response                                                                                                                    | Role        |
| ------ | ---------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| GET    | `/api/form-responses`              | `?household_id=&form_code=&subject_id=&status=` | `{responses: [{form_response_id, form_code, form_version, subject_type, subject_id, response_status, created_offline_at}]}` | Admin roles |
| GET    | `/api/form-responses/:response_id` | —                                               | Full form response with answers_json, prefill_snapshot, lineage_ids                                                         | Admin roles |

### B5. Tasks (Admin monitoring)

| Method | Path                           | Request                                                                 | Response                                                                                                                                           | Role        |
| ------ | ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| GET    | `/api/tasks`                   | `?site_id=&locality_code=&household_id=&status=&task_type=&subject_id=` | `{tasks: [{task_id, task_key, task_type, subject_type, subject_id, status, target_date, deadline_date, protocol_visit_label, form_availability}]}` | Admin roles |
| GET    | `/api/tasks/:task_id`          | —                                                                       | Full task with task_context_json, attempts, linked form responses                                                                                  | Admin roles |
| GET    | `/api/tasks/:task_id/attempts` | —                                                                       | `{attempts: [{attempt_id, attempt_number, outcome, attempted_at, attempted_mode, notes}]}`                                                         | Admin roles |
| GET    | `/api/tasks/summary`           | `?site_id=&group_by=task_type`                                          | `{summary: [{task_type, planned, due, urgent, overdue, completed, missed}]}`                                                                       | Admin roles |

### B6. Corrections (Admin workflow)

| Method | Path                              | Request                                                                       | Response                                                                                                                                 | Role                                              |
| ------ | --------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/corrections`                | `?site_id=&subject_type=&subject_id=`                                         | `{corrections: [{correction_event_id, subject_type, subject_id, field_name, old_value, new_value, corrected_by_user_id, corrected_at}]}` | Admin roles                                       |
| POST   | `/api/corrections`                | `{subject_type, subject_id, field_name, new_value, reason_code, reason_text}` | `{correction_event_id, ...}` + triggers recalculation                                                                                    | site_research_scientist (own site), central_admin |
| GET    | `/api/corrections/:correction_id` | —                                                                             | Full correction with before/after                                                                                                        | Admin roles                                       |

### B7. Data Quality Flags

| Method | Path                            | Request                                                                           | Response                                                                                  | Role                                              |
| ------ | ------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/flags`                    | `?site_id=&flag_type=&status=&severity=`                                          | `{flags: [{flag_id, flag_type, subject_type, subject_id, severity, status, created_at}]}` | Admin roles                                       |
| GET    | `/api/flags/:flag_id`           | —                                                                                 | Full flag with primary and duplicate response details                                     | Admin roles                                       |
| PUT    | `/api/flags/:flag_id/review`    | `{status: 'reviewed', review_note}`                                               | `{flag_id, status}`                                                                       | site_research_scientist (own site), central_admin |
| PUT    | `/api/flags/:flag_id/escalate`  | `{review_note}`                                                                   | `{flag_id, status: 'escalated'}`                                                          | site_research_scientist                           |
| PUT    | `/api/flags/:flag_id/arbitrate` | `{action: 'keep_primary' \| 'promote_duplicate' \| 'both_retained', review_note}` | `{flag_id, status: 'resolved'}`                                                           | central_admin only                                |

### B8. Sync API (Expo ↔ Backend)

| Method | Path               | Request                                                                                                                                                                                                           | Response                                                                                                                                                                                                                              | Role         |
| ------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| POST   | `/api/sync/push`   | `{device_id, user_id, records: [{type: 'form_response', data: {...}}, {type: 'domain_event', data: {...}}, {type: 'task', data: {...}}, {type: 'task_attempt', data: {...}}, {type: 'visit', data: {...}}, ...]}` | `{accepted: N, duplicates: [{response_id, task_id}], held_events: [event_id], conflicts: [...]}`                                                                                                                                      | field_worker |
| GET    | `/api/sync/pull`   | `?site_id=&locality_codes=a,b,c&since=<sync_cursor>&page_size=500&page_token=<opaque>`                                                                                                                            | `{sync_cursor, next_page_token?, mapping_frame, households, household_members, eligible_women, pregnancies, children, tasks, task_attempts, task_contexts, protocol_config_version, form_versions: [{form_code, version, checksum}]}` | field_worker |
| GET    | `/api/sync/status` | —                                                                                                                                                                                                                 | `{last_sync_at, device_id}`                                                                                                                                                                                                           | field_worker |

**Sync cursor**: `sync_cursor` is an opaque server-issued token (internally a server timestamp or sequence). Clients must treat it as opaque and pass it unchanged in the `since=` param on the next pull. On first sync, omit `since`. The server returns records updated after the cursor's position.

**App sync sequence**:

1. Read own area assignments from `GET /api/auth/me` → `area_assignments`
2. If `protocol_config_version` in pull response differs from cached version, call `GET /api/protocol/config` and re-download changed form JSONs via `GET /api/protocol/forms/batch?codes=HHQ,...`
3. After push, immediately issue a pull (with same `sync_cursor`) to receive merged/corrected state from backend

**Pull pagination**: Use `page_size` (default 500) and `next_page_token` for large initial bootstraps. Pull is complete when `next_page_token` is absent.

**Pull mapping_frame**: Includes all listed/enrolled/empty frame entries for the requested localities. Field workers need this to see households not yet enrolled at baseline and to validate household IDs offline.

**Pull task_attempts**: Includes all attempts for tasks in the pull scope. Required so the app can display attempt counts and determine whether a task has reached its max-failed-attempts threshold (a task-type rule, not a global constant).

### B9. Protocol Config (Read-only, synced to devices)

| Method | Path                             | Request                 | Response                                       | Role              |
| ------ | -------------------------------- | ----------------------- | ---------------------------------------------- | ----------------- |
| GET    | `/api/protocol/config`           | `?version=current`      | `ProtocolConfig` (see shape below)             | All authenticated |
| GET    | `/api/protocol/forms`            | —                       | `{forms: [{form_code, version, checksum}]}`    | All authenticated |
| GET    | `/api/protocol/forms/:form_code` | —                       | Full SurveyJS JSON for the form                | All authenticated |
| GET    | `/api/protocol/forms/batch`      | `?codes=HHQ,WQ,HRF,...` | `{forms: [{form_code, version, json: {...}}]}` | All authenticated |

**ProtocolConfig TypeScript shape** (Zod-validated, stored in `protocol_config_cache` on device):

```typescript
type FormCode =
  | "HHQ"
  | "WQ"
  | "HRF"
  | "PEF"
  | "UF"
  | "PFF"
  | "POF"
  | "BAF"
  | "SBF"
  | "NFF"
  | "CDF"
  | "VA";

interface ProtocolConfig {
  rules_version: string; // e.g. '2026.1'
  study_end_date: string; // ISO date e.g. '2030-08-31'
  schedule_rules: TaskScheduleRule[];
  attempt_rules: AttemptDispositionRule[];
  mode_rules: ModeRule[];
  contextual_actions: ContextualActionDef[];
  form_availability: Record<FormCode, "available" | "disabled">;
}

interface TaskScheduleRule {
  rule_id: string;
  task_type: FormCode;
  subject_type: "household" | "woman" | "pregnancy" | "child";
  anchor_event_type: string;
  anchor_date_field: string;
  target_offset_value: number;
  target_offset_unit: "days" | "calendar_months";
  window_start_offset_days: number; // negative = before target
  deadline_offset_days: number; // positive = after target
  repeat_interval_value?: number;
  repeat_interval_unit?: "days" | "calendar_months";
  repeat_until_condition?: string; // e.g. 'study_end' | 'pregnancy_outcome'
  expected_forms: FormCode[];
  mode_rule_id: string;
  rules_version: string;
}

interface AttemptDispositionRule {
  task_type: FormCode;
  max_failed_attempts: number;
  requires_final_close_reason: boolean;
  allowed_close_reasons: string[];
}

interface ModeRule {
  rule_id: string;
  task_type: FormCode;
  default_mode: "face_to_face" | "telephonic";
  allowed_modes: ("face_to_face" | "telephonic")[];
  mode_rule_strength: "default" | "required" | "flexible";
  exception_reason_required: boolean;
}

interface ContextualActionDef {
  action_key: string;
  label: string;
  subject_type: "household" | "woman" | "pregnancy" | "child";
  allowed_when: string; // rule expression evaluated against subject state
  creates_event_type?: string;
  creates_task_type?: FormCode;
  opens_form?: FormCode;
}
```

### B10. User/Device Admin

| Method | Path                                             | Request                                                    | Response                                                                                            | Role                                   |
| ------ | ------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| GET    | `/api/users`                                     | `?role=&site_id=`                                          | `{users: [{user_id, username, display_name, role, site_id, active}]}`                               | central_admin                          |
| POST   | `/api/users`                                     | `{username, display_name, email, role, site_id, password}` | `{user_id, ...}`                                                                                    | central_admin                          |
| PUT    | `/api/users/:user_id`                            | `{display_name?, role?, site_id?, active?}`                | `{user_id, ...}`                                                                                    | central_admin                          |
| GET    | `/api/users/:user_id/assignments`                | —                                                          | `{assignments: [{assignment_id, site_id, locality_code, active_from, active_to}]}`                  | central_admin                          |
| POST   | `/api/users/:user_id/assignments`                | `{site_id, locality_code, active_from, active_to}`         | `{assignment_id, ...}`                                                                              | central_admin                          |
| DELETE | `/api/users/:user_id/assignments/:assignment_id` | —                                                          | 204                                                                                                 | central_admin                          |
| GET    | `/api/devices`                                   | `?user_id=`                                                | `{devices: [{device_id, device_name, user_id, last_sync_at}]}`                                      | central_admin                          |
| POST   | `/api/devices`                                   | `{device_id, device_name, user_id}`                        | `{device_id, ...}`                                                                                  | central_admin                          |
| POST   | `/api/devices/register`                          | `{device_id, device_name}`                                 | `{device_id, user_id, registered_at}`                                                               | field_worker (own device only)         |
| GET    | `/api/sync-logs`                                 | `?device_id=&user_id=&since=`                              | `{logs: [{sync_log_id, device_id, direction, records_sent, records_received, status, started_at}]}` | central_admin, site_research_scientist |

### B11. Event Stream / History (Admin longitudinal view)

| Method | Path                                     | Request                                                | Response                                                                                        | Role        |
| ------ | ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------- |
| GET    | `/api/events`                            | `?household_id=&subject_type=&subject_id=&event_type=` | `{events: [{event_id, event_type, subject_type, subject_id, event_datetime, apply_status}]}`    | Admin roles |
| GET    | `/api/households/:household_id/timeline` | —                                                      | `{timeline: [{type: 'event' \| 'form_response', timestamp, event_type?, form_code?, summary}]}` | Admin roles |

---

## SECTION C: Form → Event → Task Mapping (Stable Forms)

### C1. HHQ Completion

**Trigger**: Form code `HHQ` saved with `hhq_result_interview = 1` (completed)

**Events generated**:

1. `household_enrolled` — always when HHQ completed
2. `woman_eligible` — for each member where `member_woman_questionnaire_eligible = true`

**Domain state changes**:

- Create/update `households` row with all page_01 and page_03 fields
- Create `household_members` rows for each row in `hhq_household_members`
- Set `baseline_completed_date` = `hhq_interview_date`
- Set `cohort_status` = 'enrolled'

**Tasks generated**:

- HRF series: bi-monthly from `baseline_completed_date` through study end (labels: HRF-R1, HRF-R2, HRF-R3, ...)
- WQ task: one per eligible woman, immediate, event-triggered

**HHQ fields that drive events** (using SurveyJS `name` values):
| Field | Event Logic |
|---|---|
| `hhq_result_interview` | = 1 → `household_enrolled` |
| `member_woman_questionnaire_eligible` | = true per member → `woman_eligible` for each |
| `hhq_interview_date` | anchor for HRF schedule |

### C2. WQ Completion

**Trigger**: Form code `WQ` saved

**Events generated**:

1. `wq_completed` — always
2. `pregnancy_detected` — if `wq_pregnant = 1` (yes)

**Domain state changes**:

- Update `eligible_women.wq_status` = 'completed'
- Create/update pregnancy-related fields from reproductive history

**Tasks generated**:

- PEF task: immediate, event-triggered if `wq_pregnant = 1`

**WQ fields that drive events**:
| Field | Event Logic |
|---|---|
| `wq_pregnant` | = 1 → `pregnancy_detected` |
| `wq_last_menstrual_period_start_date_given` | LMP for pregnancy dating |

### C3. HRF Completion

**Trigger**: Form code `HRF` saved

**Events generated**:

1. `household_round_completed` — always
2. `pregnancy_detected` — if `hrf_pregnant = 1` (yes)
3. `new_eligible_woman_found` — for each new woman in `hrf_new_eligible_women` panel
4. `member_in_migrated` / `member_married_in` — if `hrf_since_last_interaction_any_new` indicates roster changes

**Domain state changes**:

- Create new `household_members` for in-migration/marriage-in
- Update `eligible_women` for new eligible women
- Recalculate eligibility for all household members

**Tasks generated**:

- Next HRF task (scheduled, bi-monthly, does NOT shift if late)
- PEF task: immediate if pregnancy detected
- WQ task: for each new eligible woman

**HRF fields that drive events**:
| Field | Event Logic |
|---|---|
| `hrf_pregnant` | = 1 → `pregnancy_detected` |
| `hrf_since_last_interaction_any_new` | = 1 → check for roster changes |
| `hrf_new_eligible_women` | panel rows → `new_eligible_woman_found` per row |
| `hrf_potential_person_eligible_pregnancy` | eligibility flag for new women |
| `hrf_interview_date` | timestamp for round completion |

### C4. PEF Completion

**Trigger**: Form code `PEF` saved with `pef_pregnancy_confirmed = 1`

**Events generated**:

1. `pregnancy_enrolled` — always
2. `usg_report_available` — if `pef_any_time_during_pregnancy_ultrasound = 1` AND `pef_first_ultrasound_report` is available

**Domain state changes**:

- Create `pregnancies` row with enrollment_date, lmp_date, edd_date
- Set `pregnancy_sequence` = `pef_pregnancy_rank_since_baseline`
- Store conditions (diabetes, hypertension, etc.) and symptoms

**Tasks generated**:

- PFF series: monthly from `pef_enrollment_date` through pregnancy outcome or study end (labels: PFF-M1, PFF-M2, PFF-M3, ...)
- UF task: immediate if USG report available
- First PFF task target = enrollment_date + 1 calendar month

**PEF fields that drive events**:
| Field | Event Logic |
|---|---|
| `pef_pregnancy_confirmed` | = 1 → `pregnancy_enrolled` |
| `pef_any_time_during_pregnancy_ultrasound` | = 1 → check USG availability |
| `pef_first_ultrasound_report` | available → `usg_report_available` |
| `pef_enrollment_date` | anchor for PFF schedule |
| `pef_last_menstrual_period_start_answer_only` | LMP for EDD calculation |
| `pef_pregnancy_rank_since_baseline` | pregnancy sequence |
| `pef_pregnancy_id` | stored as display/reference ID |

### C5. UF Completion (Ultrasound Form)

> **Draft JSON exists; questions may update. Trigger and domain state are stable.**

**Trigger**: UF task opened (generated by `usg_report_available` event)

**Events generated**: None — UF is a data-capture form only

**Domain state changes**:

- Create `ultrasound_records` row: `report_date`, `gestational_age`, `report_sequence`, `attachment_reference`
- Link to `pregnancy_id` via `source_form_response_id`

**Tasks generated**: None — PFF schedule was already generated by PEF

---

### C6. PFF Completion (Pregnancy Follow-Up Form)

> **Draft JSON exists; questions may update. Trigger and task generation are stable.**

**Trigger**: Form code `PFF` saved for active pregnancy

**Events generated**:

1. `pregnancy_followup_completed` — always
2. `delivery_reported` — if `pff_delivered = 1`
3. `usg_report_available` — if `pff_new_usg_report = 1` and no prior UF recorded

**Domain state changes**:

- Update `pregnancies.pregnancy_status` if delivery indicated
- Create `ultrasound_records` if new USG reported

**Tasks generated**:

- Next PFF task (scheduled, does NOT shift if late; current round only)
- POF task: immediate if `delivery_reported` event generated
- UF task: immediate if `usg_report_available` event generated

---

### C7. POF Completion (Pregnancy Outcome Form)

> **Draft JSON exists; questions may update. Trigger and downstream task generation are stable.**

**Trigger**: Form code `POF` saved

**Events generated**:

1. `pregnancy_outcome_recorded` — always; carries `outcome_type`, `live_birth_count`, `fetal_loss_count`

**Domain state changes**:

- Create `pregnancy_outcomes` row
- Update `pregnancies.pregnancy_status` = 'outcome_recorded', `outcome_recorded_date`
- Create `children` row for each qualifying birth (live birth or fetal loss ≥ 20 weeks / 140 days)

**Tasks generated**:

- BAF task: one per qualifying birth (immediate, event-triggered)
- Supersede all future planned/due PFF tasks for this pregnancy → status `superseded`
- SBF task: if any child has `birth_status = 'stillbirth'` (immediate)

---

### C8. BAF Completion (Birth Assessment Form)

> **Draft JSON exists; questions may update. Classification logic and downstream tasks are stable.**

**Trigger**: Form code `BAF` saved for a qualifying birth

**Events generated**:

1. `birth_assessment_completed` — always; carries `birth_status`, `current_vital_status`
2. `stillbirth_recorded` — if `baf_birth_outcome = stillbirth`
3. `child_death_recorded` — if `baf_vital_status_at_assessment = deceased`

**Domain state changes**:

- Update `children` row: `sex`, `birth_weight_grams`, `birth_status`, `live_birth_status`, `current_vital_status`, `death_date` (if applicable)

**Tasks generated**:

- NFF schedule: if `live_birth_status = true` AND child alive — all NFF visits through study end (labels: 7d, 28d, 2m ... per D3)
- SBF task: if `stillbirth_recorded` (immediate)
- CDF task: if `child_death_recorded` (immediate)
- VA task: if `stillbirth_recorded` or `child_death_recorded` — target = event date + 30 days (disabled until VA JSON available)

---

### C9. SBF Completion (Stillbirth Form)

> **Draft JSON exists; questions may update.**

**Trigger**: Form code `SBF` saved (opened from SBF task after stillbirth)

**Events generated**:

1. `stillbirth_recorded` — if not already recorded from BAF

**Domain state changes**:

- Update `children` row with stillbirth details (gestational age at birth, circumstances)

**Tasks generated**:

- VA task: if not already generated — target = stillbirth date + 30 days (disabled until VA JSON available)

---

### C10. NFF Completion (Newborn Follow-Up Form)

> **Draft JSON exists; questions may update. Schedule anchoring and missed-round rules are stable.**

**Trigger**: Form code `NFF` saved for the current due NFF task

**Events generated**:

1. `newborn_followup_completed` — always; carries `protocol_visit_label`, `child_vital_status`
2. `child_death_recorded` — if `nff_child_died = 1`

**Domain state changes**:

- Update `children.current_vital_status` if death reported
- Update `children.death_date` if death reported

**Tasks generated**:

- Next NFF task (scheduled per D3; does NOT shift if late; current round only)
- CDF task: immediate if `child_death_recorded`
- VA task: if `child_death_recorded` — target = death_date + 30 days (disabled until VA JSON available)
- Supersede remaining NFF tasks if child deceased

---

### C11. CDF Completion (Child Death Form)

> **Draft JSON exists; questions may update.**

**Trigger**: Form code `CDF` saved (opened from CDF task after child death)

**Events generated**:

1. `child_death_recorded` — if not already recorded from NFF/BAF

**Domain state changes**:

- Update `children.current_vital_status` = 'deceased', `death_date`
- Supersede all remaining planned NFF tasks for this child

**Tasks generated**:

- VA task: if not already generated — target = death_date + 30 days (disabled until VA JSON available)

---

### C12. VA Completion (Verbal Autopsy)

> **VA SurveyJS JSON is pending (~4 weeks). Task generation is active. Form opening is disabled until JSON is available.**

**Trigger**: VA task becomes available (form JSON loaded and `form_availability = 'available'`)

**Events generated**:

1. `verbal_autopsy_completed` — always

**Domain state changes**:

- Update VA task status to completed
- Link `form_response_id` to child record

**Tasks generated**: None — VA is terminal in the workflow

---

### D1. HRF Schedule

```
anchor: household.baseline_completed_date
target: anchor + N * 2 calendar months (N = 1, 2, 3, ...)
window_start: target - 14 days
deadline: target + 14 days
label: HRF-R{N}
generation: deterministic, generate all through protocol_config.study_end_date
late rule: late completion does NOT shift future HRF dates
missed rule: if round N is past deadline, mark missed; next contact does round N+1 (current due)
mode: default telephonic; face-to-face allowed when combined with household visit; no exception reason required
```

### D2. PFF Schedule

```
anchor: pregnancy.enrollment_date
target: anchor + N calendar months (N = 1, 2, 3, ...)
window_start: target - 7 days
deadline: target + 7 days
label: PFF-M{N}
generation: deterministic through expected delivery or study end
late rule: late completion does NOT shift future PFF dates
supersede: when POF is completed, all future planned PFF for that pregnancy → status 'superseded'
missed rule: if month N is past deadline, mark missed; next contact does month N+1 (current due)
mode: flexible; show previous visit mode; document actual mode
```

### D3. NFF Schedule

```
anchor: child.birth_date
fixed labels and offsets:
  7d    = anchor + 7 days
  28d   = anchor + 28 days
  2m    = anchor + 2 calendar months
  3m    = anchor + 3 calendar months
  4.5m  = anchor + 4 calendar months + 15 days
  6m    = anchor + 6 calendar months
  7.5m  = anchor + 7 calendar months + 15 days
  9m    = anchor + 9 calendar months
  10.5m = anchor + 10 calendar months + 15 days
  12m   = anchor + 12 calendar months
  14m   = anchor + 14 calendar months
  16m   = anchor + 16 calendar months
after 16m: every 2 calendar months (18m, 20m, 22m, ...) until study end

window_start: target - 7 days for face-to-face, target - 3 days for telephonic
deadline: target + 7 days
generation: deterministic through study end
mode:
  default face-to-face: 7d, 28d, 2m, 3m, 6m, 9m, 12m
  default telephonic: 4.5m, 7.5m, 10.5m, 14m, 16m, 18m+
  telephonic allowed for face-to-face if mother/child outside study area
```

### D4. VA Schedule

```
anchor: stillbirth or child death event date
target: anchor + 30 days
window_start: target - 3 days
deadline: target + 14 days
label: VA-{event_type}
form_availability: 'disabled' (va_json_pending) until VA SurveyJS JSON exists (~4 weeks from 2026-06-03)
action_state: 'disabled'
```

### D5. Mode Rules (All Form Types)

| Form | Default Mode        | Allowed Modes            | Rule Strength | Exception Reason Required                 |
| ---- | ------------------- | ------------------------ | ------------- | ----------------------------------------- |
| HHQ  | face_to_face        | face_to_face only        | required      | —                                         |
| WQ   | face_to_face        | face_to_face only        | required      | —                                         |
| HRF  | telephonic          | telephonic, face_to_face | default       | no                                        |
| PEF  | face_to_face        | face_to_face only        | required      | —                                         |
| UF   | face_to_face        | face_to_face only        | required      | —                                         |
| PFF  | flexible            | telephonic, face_to_face | flexible      | no                                        |
| POF  | face_to_face        | face_to_face, telephonic | default       | yes if telephonic                         |
| BAF  | face_to_face        | face_to_face only        | required      | —                                         |
| SBF  | face_to_face        | face_to_face only        | required      | —                                         |
| NFF  | protocol-determined | see D3                   | conditional   | yes if default is F2F but telephonic used |
| CDF  | face_to_face        | face_to_face only        | required      | —                                         |
| VA   | face_to_face        | face_to_face only        | required      | —                                         |

---

## SECTION E: Contextual Action Registry

Actions available per subject type and state:

| Action Key              | Label                           | Subject Type | Allowed When                      | Creates Event              | Opens Form       |
| ----------------------- | ------------------------------- | ------------ | --------------------------------- | -------------------------- | ---------------- |
| `start_hrf`             | Start household round           | household    | enrolled, no open HRF task        | `household_round_started`  | HRF              |
| `record_roster_change`  | Record roster change            | household    | enrolled                          | `member_in_migrated` etc.  | HRF              |
| `new_eligible_woman`    | New eligible woman found        | household    | enrolled                          | `new_eligible_woman_found` | WQ               |
| `start_wq`              | Start Woman's Questionnaire     | woman        | eligible, WQ not completed        | —                          | WQ               |
| `pregnancy_reported`    | Pregnancy reported              | woman        | WQ completed, no active pregnancy | `pregnancy_detected`       | PEF              |
| `currently_unavailable` | Currently unavailable           | woman        | any                               | —                          | (close task)     |
| `start_pff`             | Start current PFF               | pregnancy    | active, has due PFF task          | —                          | PFF              |
| `usg_available`         | USG report available            | pregnancy    | active, no USG recorded yet       | `usg_report_available`     | UF               |
| `delivery_reported`     | Delivery/outcome reported       | pregnancy    | active                            | `delivery_reported`        | POF              |
| `pregnancy_loss`        | Pregnancy loss reported         | pregnancy    | active                            | `delivery_reported`        | POF              |
| `start_nff`             | Start current NFF               | child        | alive, has due NFF task           | —                          | NFF              |
| `child_died`            | Child died                      | child        | alive                             | `child_death_recorded`     | CDF              |
| `mother_child_outside`  | Mother/child outside study area | child        | alive                             | —                          | (mode exception) |

---

## SECTION F: Implementation Phases

### Phase 1 — TypeScript Foundation + Shared Domain

**Deliverable**: All normalized domain types and tables exist; nothing works end-to-end yet.

- Create monorepo structure: `packages/shared`, `apps/api`, `apps/admin`, `apps/expo`
- Implement all Section A SQL tables in Postgres (study_sites, study_localities, mapping_frame, households, household_members, eligible_women, eligibility_assessments, pregnancies, ultrasound_records, pregnancy_outcomes, children, visits, form_responses, domain_events, follow_up_tasks, task_attempts, admin_correction_events, data_quality_flags, person_attribute_history, users, devices, user_area_assignments, sync_logs)
- Define TypeScript domain types in `packages/shared/domain` mirroring all SQL tables
- Implement DOB precision logic and inference rules
- Implement deterministic ID construction rules (household_id, household_member_id, child_id)
- Set up database migrations (e.g., with node-pg-migrate or Drizzle)
- Baseline tests: ID construction, DOB inference, type round-trips

**Does not yet include**: API, workflow rules, sync, UI

---

### Phase 2 — Protocol Config + Workflow Rules

**Deliverable**: All schedule rules and event-to-task rules run correctly in shared TypeScript; protocol config is versioned and testable.

- Implement `packages/shared/protocol-config`:
  - Versioned `task_schedule_rules` (HRF, PFF, NFF, VA windows, deadlines, mode rules)
  - `attempt_disposition_rules` per task type (max failed attempts, close reason requirements)
  - `form_availability` map (VA disabled until JSON exists)
  - `contextual_action_registry` (Section E)
- Implement `packages/shared/workflow-rules`:
  - HHQ → `household_enrolled`, HRF schedule generation, `woman_eligible` per member
  - WQ → `wq_completed`, `pregnancy_detected` if `wq_pregnant=1`
  - HRF → `household_round_completed`, `pregnancy_detected`, `new_eligible_woman_found`, roster events
  - PEF → `pregnancy_enrolled`, PFF schedule generation, `usg_report_available` if USG present
  - Downstream rules: POF→BAF tasks, BAF→NFF/SBF/CDF/VA tasks, NFF→next NFF or CDF
  - Missed-round logic for HRF, PFF, NFF (mark expired, serve current due only)
  - Task supersede logic (POF completion supersedes future PFF)
- Unit tests: each event type generates correct tasks with correct dates, labels, windows

**Depends on**: Phase 1

---

### Phase 3 — Context Builders + Prefill Mappers

**Deliverable**: Every form type has a context builder and a prefill mapper; read-only lineage fields are defined per form.

- Implement `packages/shared/context-builders`:
  - `buildHrfContext()`, `buildWqContext()`, `buildPefContext()`, `buildPffContext()`, `buildUfContext()`, `buildPofContext()`, `buildBafContext()`, `buildSbfContext()`, `buildNffContext()`, `buildCdfContext()`, `buildVaContext()`
  - Output shape: `{display: {title, subtitle, warnings}, identifiers, prior, alerts}`
- Implement `packages/shared/prefill-mappers`:
  - `mapHrfPrefill()` through `mapVaPrefill()`
  - Read-only lineage fields per form: site_id, locality_code, structure_map_id, household_id, household_member_id, woman_id, pregnancy_id, child_id, task_id, protocol_visit_label
  - Store `prefill_snapshot_json` alongside each form response
- Only implement context builders and prefill mappers for stable forms (HHQ, WQ, HRF, PEF) fully in this phase; stub remaining forms (UF, PFF, POF, BAF, SBF, NFF, CDF, VA) ready for completion when PDFs stabilize

**Depends on**: Phase 1 (domain types)

---

### Phase 4 — Backend Postgres + Domain API

**Deliverable**: Full REST API running; admin app and Expo app can make authenticated calls; sync push/pull work end-to-end against real Postgres.

- Implement Node/Express (or Fastify) API server in `apps/api`
- Authentication: B1 login, `/api/auth/me` (returns `area_assignments`), JWT refresh
- Masters API: B2 (sites, localities, mapping frame)
- Domain entity read API: B3 (households, members, women, pregnancies, children)
- Form responses read API: B4
- Tasks read and summary API: B5
- Corrections API: B6 (apply correction → immediate eligibility/task recalculation)
- Data quality flags API: B7 (site-scoped review, escalate, central arbitration)
- **Sync API: B8**
  - `POST /api/sync/push`: accept `form_response`, `domain_event`, `task`, `task_attempt`, `visit` record types; idempotency by response_id/attempt_id; duplicate detection; return `{accepted, duplicates, held_events, conflicts}`
  - `GET /api/sync/pull`: paginated (`page_size`, `page_token`); returns `mapping_frame`, `households`, `household_members`, `eligible_women`, `pregnancies`, `children`, `tasks`, `task_attempts`, `task_contexts`, `protocol_config_version`, `form_versions`; `sync_cursor` is opaque server-issued token
  - Device self-registration: `POST /api/devices/register` for `field_worker` role (own device)
- Protocol config API: B9 including `GET /api/protocol/forms/batch?codes=...`
- User/device admin API: B10
- Event stream API: B11
- Integration tests: push/pull round-trip, duplicate detection, correction recalculation

**Depends on**: Phase 1; can run in parallel with Phases 2 and 3

---

### Phase 5 — Expo Domain Store + Task-Based UI

**Deliverable**: Android app has a working offline-capable SQLite domain store and all required screens; forms open only from tasks or valid trigger buttons.

- Implement SQLite schema in Expo mirroring backend domain tables (households, household_members, eligible_women, pregnancies, children, follow_up_tasks, task_attempts, domain_events, form_responses, mapping_frame, outbox)
- Implement offline task generation using shared workflow rules (Phase 2)
- Implement context builders and prefill mappers (Phase 3) running locally
- **App sync sequence**: read assignments from `/api/auth/me` → push outbox → pull with cursor + locality_codes → apply to SQLite → on version mismatch fetch protocol config + batch form JSONs
- **Screens**: household-centered worklist, person/event-centered worklist, household visit screen, household detail, woman detail, pregnancy detail, child detail, task detail + attempt recording, SurveyJS form screen, sync status screen
- **No global open-any-form menu**: forms open only from scheduled tasks, event-triggered tasks, or contextual trigger buttons
- Contextual trigger buttons per Section E registry; VA task visible but disabled (`va_json_pending`)
- Missed-round display: mark expired tasks missed before showing current due
- Task attempt recording with task-type disposition rules and final close reason when configured
- SurveyJS form screen: receives form JSON, prefill values, read-only lineage fields, task context; on completion writes immutable form response + generates domain events + generates tasks + writes outbox records

**Depends on**: Phases 2, 3, 4

---

### Phase 6 — Offline Sync

**Deliverable**: Bidirectional area-scoped sync is reliable under real field conditions including offline periods, retried pushes, and multi-device completions.

- End-to-end push/pull cycle working in Expo against real API
- Outbox retry logic: exponential backoff, resume on reconnect
- Sync cursor management: persist cursor in SQLite; on first install omit `since=`; after push immediately pull with same cursor
- Pull pagination: handle `next_page_token` loop for large initial bootstraps
- Offline duplicate completion: accept and mark duplicate, create data_quality_flag, hold conflicting events
- Correction state flow-back: corrected domain state from admin returns via pull and is applied to local SQLite
- Area assignment change detection: re-read assignments from `/api/auth/me` on each sync; drop records for removed localities, fetch records for added localities
- Form JSON cache management: compare `form_versions` checksums; batch-download changed forms only
- Sync status screen: shows last sync time, outbox queue size, any held/duplicate flags visible to field worker
- Stress/integration tests: two devices completing same task offline, sync ordering, large initial pull

**Depends on**: Phases 4 and 5

---

### Phase 7 — Vite React Admin App

**Deliverable**: Research Scientists and central admin can view longitudinal records, apply corrections, review data quality flags, and monitor sync/task status.

- Masters and mapping frame management (B2)
- Household/person search and longitudinal view (B3, B11 timeline)
- Correction workflow: search subject → open longitudinal view → edit allowed core field → show before/after → require reason → save correction event → immediate recalculation (B6)
- Data quality flags: site-scoped review, escalate, central arbitration (B7)
- Task/schedule monitor: due, urgent, overdue, missed, postponed; VA visible even while disabled in Android
- Sync monitor: devices, outbox/inbox status, failed sync records, duplicate completions, held events (B10 sync-logs)
- User/device/area-assignment admin (B10)
- Role enforcement: Site Research Scientist (own site, no duplicate promotion); Central Admin (all sites, arbitration)

**Depends on**: Phase 4

---

### Phase 8 — Integration Testing + Production Readiness

**Deliverable**: System is ready for field pilot; all components pass end-to-end tests; no data-loss paths.

- End-to-end tests: full HHQ→WQ→PEF→PFF→POF→BAF→NFF workflow across two devices with offline periods and one admin correction mid-study
- VA task lifecycle: generate on stillbirth, visible+disabled in Android, admin monitors, enable when JSON arrives
- Duplicate completion arbitration: two devices complete same PFF offline; sync; flag created; SRS reviews; central admin arbitrates
- Correction recalculation: admin corrects DOB → eligibility recalculates → affected tasks regenerate → corrected state flows to device on next pull
- Performance: pull response under 5 seconds for 500 households with 50 pages
- Security audit: role enforcement, area scoping, JWT expiry/refresh
- Protocol config versioning: change a schedule rule, bump version, verify devices refresh on next sync

**Depends on**: All phases

---

**Dependency graph**: Phase 1 → Phase 2 → Phase 3 (serial); Phase 1 → Phase 4 (parallel with 2 and 3); Phase 2 + Phase 3 + Phase 4 → Phase 5; Phase 4 + Phase 5 → Phase 6; Phase 4 → Phase 7; All → Phase 8.
