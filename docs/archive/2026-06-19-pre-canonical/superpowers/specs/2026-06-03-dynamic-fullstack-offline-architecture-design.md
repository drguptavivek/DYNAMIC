# DYNAMIC Fullstack Offline Architecture Design

Date: 2026-06-03

Status: design approved through brainstorming

Target stack:

- TypeScript / Node API
- Postgres backend database
- Vite React admin app
- Expo Android app with SQLite
- SurveyJS as the form renderer

Source references reviewed:

- `Refs/FLOW.md`
- `Refs/Unique_Ids.md`
- `Refs/pretesing forms/dynamic_flowchart_v2.pdf`
- `Refs/pretesing forms/forms_summary table_v2026.05.17.pdf`
- current bundled SurveyJS JSON files in `expo-prototype/src/data/forms/`

## Scope

This design covers the full DYNAMIC longitudinal data-capture workflow:

- HHQ: Baseline Household Questionnaire
- WQ: Baseline Woman's Questionnaire
- HRF: Household Rounds Form
- PEF: Pregnancy Enrollment Form
- UF: Ultrasound Form
- PFF: Pregnancy Follow-Up Form
- POF: Pregnancy Outcome Form
- BAF: Birth Assessment Form
- SBF: Stillbirth Form
- NFF: Newborn Follow-Up Form
- CDF: Child Death Form
- VA: Verbal Autopsy

The VA domain/task workflow is included now. The VA SurveyJS questionnaire JSON is pending, so generated VA tasks must be visible but disabled in the Android app until the JSON exists.

Out of scope for this first design:

- analysis exports
- advanced dashboards and indicators
- per-household staff assignment
- randomization or allocation logic
- final production infrastructure details

## Core Position

SurveyJS JSON is the questionnaire rendering layer, not the core longitudinal data model.

The system must have a normalized domain model for household, person, eligible woman, pregnancy, child, visit, event, task, attempt, draft, correction, and sync state. SurveyJS form responses are immutable evidence linked to that domain model.

The core pattern is:

```text
normalized domain state
  + mutable SurveyJS form drafts
  + immutable SurveyJS form responses
  + domain events
  + generated follow-up tasks
  + task attempts
  + admin correction events
```

Do not build a form-first JSONB-only database. It will not safely support household rounds, age-up eligibility, pregnancy episodes, child follow-up schedules, VA due dates, offline task generation, or duplicate offline completions.

## System Components

### Expo Android App

Responsibilities:

- area-scoped offline data collection
- SQLite local domain store
- SurveyJS form rendering
- local form drafts with 30-second autosave and explicit Save Draft
- Side Navigation / Table of Contents and progress bar for SurveyJS forms
- contextual trigger buttons
- task and opportunity worklists
- local workflow rule execution
- local task generation after form completion
- task attempt recording
- offline outbox and sync

The Android app must not edit locked core identity/cohort fields after capture.

The Android app must not create correction requests. Corrections are handled outside the field workflow by Research Scientists in the admin app.

### TypeScript / Node API

Responsibilities:

- authentication and role enforcement
- area-scoped sync APIs
- validation and ingestion of offline outbox records
- idempotency and duplicate detection
- workflow rule replay and task merge
- admin correction application
- data-quality flag generation
- serving protocol rules, masters, and form versions

### Postgres

Responsibilities:

- normalized operational domain tables
- immutable form response storage as JSONB
- task, attempt, event, and sync logs
- admin correction and data-quality flag state
- site and area scoping

### Vite React Admin App

Responsibilities:

- site-scoped review and correction workflow
- masters and mapping frame management
- household/person/woman/pregnancy/child longitudinal views
- task and sync monitoring
- duplicate/offline conflict review
- user, device, and area-assignment administration for central users

## Entity Model

### Core Subject Chain

```text
household
  -> person / household_member
    -> eligible_woman_state
      -> pregnancy
        -> ultrasound_record
        -> pregnancy outcome
          -> birth / child
            -> stillbirth record
            -> child death record
            -> verbal autopsy task/form
```

### Household

The household is created from the mapping/listing frame and confirmed by HHQ. HHQ must not create arbitrary households outside the mapped frame.

Key fields:

- `household_id`
- `site_id`
- `locality_code`
- `structure_map_id`
- `household_number`
- `baseline_enrollment_status`
- `baseline_completed_date`
- `cohort_status`
- `closed_reason`

ID rule:

```text
household_id = site_id + locality_code + structure_map_id + household_number
```

Households empty, vacant, not found, or otherwise not enrolled at baseline remain outside future follow-up even if later occupied.

Household splits do not create new household IDs or split events. Use non-analytic notes only if field context is needed.

### Person / Household Member

The person/member row is the durable roster identity under a household.

Key fields:

- `person_id`
- `household_member_id`
- `household_id`
- `site_id`
- `locality_code`
- `member_number`
- `name`
- `sex`
- `marital_status_current`
- `usual_resident_status`
- `member_status`
- `date_of_birth`
- `date_of_birth_precision`
- `date_of_birth_source`
- `reported_age_years`
- `reported_age_as_of_date`
- `dob_inference_rule_version`

ID rule:

```text
household_member_id = household_id + member_number
person_id = household_member_id unless a future permanent person UUID is introduced
```

Household member number is read-only auto-increment within the household listing.

Temporary pregnancy/delivery visitors are not added to the roster and cannot become eligible from that household.

### Date Of Birth Policy

Current HHQ and HRF member rows capture completed age, not exact DOB. WQ captures birth month and year plus completed age. Birth/child forms capture child birth date.

The app/domain model should capture and improve DOB over time:

```text
date_of_birth_precision:
  exact_day
  month_year
  year_only
  inferred_from_age
  unknown
```

Precedence:

```text
exact_day > month_year > year_only > inferred_from_age > unknown
```

When only completed age is available:

```text
date_of_birth = interview_date - reported_age_years calendar years
date_of_birth_precision = inferred_from_age
reported_age_years = captured age
reported_age_as_of_date = interview_date
```

When better DOB precision is later available, update `person.date_of_birth` immediately and preserve the older value in history.

Completed forms remain immutable. DOB changes recalculate current eligibility and future tasks immediately, but already completed data collection is not undone. Analysis handles eligibility inconsistencies.

### Person Attribute History

Every admin correction or higher-precision update records a history row:

- `history_id`
- `person_id`
- `field_name`
- `old_value`
- `old_precision`
- `new_value`
- `new_precision`
- `source_form_response_id`
- `source_event_id`
- `changed_at`
- `changed_by_user_id`
- `device_id`

### Eligible Woman State

Eligible woman is a tracked role/state derived from a household member, not a separate human identity.

Key fields:

- `woman_id`
- `household_member_id`
- `household_id`
- `site_id`
- `locality_code`
- `eligibility_start_date`
- `eligibility_source_event_id`
- `wq_status`
- `tracking_status`
- `current_eligibility_status`
- `eligibility_basis_at_enrollment`
- `analysis_eligibility_flag`

Woman ID rule:

```text
woman_id = household_member_id
```

Eligibility is recalculated at every household contact and after admin corrections.

Age-up eligibility is supported. If a female usual resident becomes 18-49 and ever-married, generate a WQ due task if WQ is not already completed.

### Eligibility Assessment

Store each eligibility evaluation:

- `eligibility_assessment_id`
- `person_id`
- `household_id`
- `assessment_date`
- `age_years_used`
- `age_source`
- `sex_used`
- `marital_status_used`
- `usual_resident_status_used`
- `eligible_wq`
- `eligible_pregnancy_tracking`
- `created_event_id`

### Pregnancy

Pregnancy is an episode under an eligible woman.

Key fields:

- `pregnancy_id`
- `woman_id`
- `household_member_id`
- `household_id`
- `site_id`
- `locality_code`
- `pregnancy_sequence`
- `pregnancy_status`
- `detected_date`
- `enrollment_date`
- `lmp_date`
- `edd_date`
- `outcome_recorded_date`
- `source_event_id`

Use a generated UUID as the internal primary key, while preserving deterministic display/rank fields for field recognition and analysis.

Do not create duplicate active pregnancies for the same woman without a review flag.

### Ultrasound Record

Ultrasound records belong to pregnancy.

Key fields:

- `ultrasound_id`
- `pregnancy_id`
- `woman_id`
- `household_id`
- `site_id`
- `report_date`
- `report_sequence`
- `gestational_age`
- `attachment_reference`
- `source_form_response_id`

The workflow supports UF opening from PEF or any PFF when the first USG report becomes available.

### Pregnancy Outcome

Pregnancy outcome closes the pregnancy episode and creates qualifying birth/fetal records.

Key fields:

- `pregnancy_outcome_id`
- `pregnancy_id`
- `outcome_date`
- `outcome_type`
- `gestational_age_at_outcome`
- `live_birth_count`
- `fetal_loss_count`
- `source_form_response_id`

Abortion or fetal death under 20 weeks ends the downstream birth-assessment path unless protocol later defines another form.

### Birth / Child

Birth/fetus/child records are created from qualifying pregnancy outcomes and birth assessment workflow.

Key fields:

- `child_id`
- `birth_id`
- `pregnancy_id`
- `woman_id`
- `household_id`
- `site_id`
- `birth_rank`
- `birth_date`
- `birth_status`
- `live_birth_status`
- `current_vital_status`
- `death_date`
- `source_event_id`

One child/birth record is created for each live birth or qualifying fetal loss at or above 20 weeks / 140 days.

### Visit

Visit is the interview/contact/session layer.

One visit can contain one or more form responses when tasks are combined during the same household contact.

Key fields:

- `visit_id`
- `session_id`
- `site_id`
- `locality_code`
- `household_id`
- `primary_subject_type`
- `primary_subject_id`
- `started_at`
- `completed_at`
- `interviewer_id`
- `device_id`
- `actual_mode`
- `gps_metadata`
- `sync_status`

### Form Response

Form response is immutable evidence captured through SurveyJS.

Key fields:

- `form_response_id`
- `response_id`
- `site_id`
- `locality_code`
- `household_id`
- `visit_id`
- `task_id`
- `series_id`
- `sequence_number`
- `form_code`
- `form_version`
- `subject_type`
- `subject_id`
- `lineage_ids_json`
- `prefill_snapshot_json`
- `prefill_mapper_version`
- `answers_json`
- `created_offline_at`
- `updated_offline_at`
- `device_id`
- `synced_at`
- `response_status`

Response status values:

- `primary`
- `duplicate_task_completion`
- `superseded_by_admin`

The PDF `Variable ID` remains the canonical question code in `sourceCode`. Globally unique analysis-safe keys are form-prefixed where needed.

### Form Draft

Form draft is mutable working state captured before final SurveyJS submission.

Drafts are stored separately from immutable form responses. Do not represent drafts as `form_responses.response_status = draft`.

Key fields:

- `form_draft_id`
- `draft_key`
- `site_id`
- `locality_code`
- `household_id`
- `visit_id`
- `task_id`
- `form_code`
- `form_version`
- `subject_type`
- `subject_id`
- `lineage_ids_json`
- `prefill_snapshot_json`
- `prefill_mapper_version`
- `answers_json`
- `completion_state_json`
- `validation_state_json`
- `draft_status`
- `created_offline_at`
- `updated_offline_at`
- `device_id`
- `created_by_user_id`
- `last_saved_by_user_id`
- `submitted_form_response_id`

Draft status values:

- `active`
- `submitted`
- `discarded`
- `superseded`

Draft rules:

- Drafts can exist only for a valid task or valid contextual trigger.
- Autosave writes locally every 30 seconds when the form is dirty.
- Explicit Save Draft writes locally immediately.
- The app saves before backgrounding, closing, or navigating away when unsaved changes exist.
- Drafts stay local on the field device and are not uploaded.
- Drafts do not complete tasks, generate domain events, update normalized domain state, or trigger follow-up scheduling.
- Preview is available anytime from the current saved draft.
- The field user must preview the saved draft before finalizing the form.
- Only finalized forms are uploaded.
- Finalize/Submit creates an immutable form response and then marks the local draft `submitted`.
- When a different final response completes the same task, remaining active drafts for that task are marked `superseded`.

### Domain Event

Domain events record meaningful state changes and trigger workflow rules.

Key fields:

- `event_id`
- `event_type`
- `site_id`
- `locality_code`
- `household_id`
- `subject_type`
- `subject_id`
- `visit_id`
- `task_id`
- `form_response_id`
- `event_datetime`
- `created_offline_at`
- `device_id`
- `sync_status`
- `apply_status`

Apply status values:

- `applied`
- `held_duplicate`
- `rejected_invalid`
- `superseded`

Examples:

- `household_enrolled`
- `household_round_completed`
- `person_dob_updated`
- `woman_eligible`
- `pregnancy_detected`
- `pregnancy_enrolled`
- `usg_report_available`
- `pregnancy_followup_completed`
- `delivery_reported`
- `pregnancy_outcome_recorded`
- `birth_assessment_completed`
- `stillbirth_recorded`
- `newborn_followup_completed`
- `child_death_recorded`
- `verbal_autopsy_due`
- `verbal_autopsy_completed`

### Follow-Up Task

Follow-up task is the core operational work item.

Use one generic task table for household, woman, pregnancy, child, and VA work.

Key fields:

- `task_id`
- `task_key`
- `site_id`
- `locality_code`
- `household_id`
- `subject_type`
- `subject_id`
- `woman_id`
- `pregnancy_id`
- `child_id`
- `task_type`
- `form_code`
- `expected_forms`
- `series_id`
- `sequence_number`
- `protocol_visit_label`
- `generation_source`
- `source_event_id`
- `anchor_event_id`
- `anchor_date`
- `window_start`
- `target_date`
- `deadline_date`
- `status`
- `priority`
- `default_expected_mode`
- `allowed_modes`
- `mode_rule_strength`
- `max_failed_attempts`
- `failed_attempt_count`
- `requires_final_close_reason`
- `task_context_json`
- `context_builder_version`
- `prefill_mapper_version`
- `rules_version`
- `form_availability`
- `action_state`
- `disabled_reason`
- `completed_visit_id`
- `completed_at`
- `closed_at`
- `closed_reason`
- `superseded_by_event_id`

Status values:

- `planned`
- `due`
- `urgent`
- `overdue`
- `in_progress`
- `completed_on_time`
- `completed_late`
- `missed`
- `postponed`
- `not_reachable_closed`
- `cancelled`
- `superseded`

Generation source values:

- `scheduled`
- `event_triggered`
- `unscheduled_opportunity`

Task key must be deterministic enough for offline/backend merge:

```text
task_key = household_id + subject_type + subject_id + task_type + protocol_visit_label + target_date + rules_version
```

### Task Attempt

Task attempts preserve failed contacts and disposition history.

Key fields:

- `attempt_id`
- `task_id`
- `attempt_number`
- `visit_id`
- `attempted_at`
- `attempted_by_user_id`
- `device_id`
- `attempted_mode`
- `outcome`
- `reason_code`
- `notes`
- `next_attempt_date`

Attempt outcomes:

- `completed`
- `no_answer`
- `phone_unreachable`
- `household_locked`
- `respondent_unavailable`
- `refused`
- `postponed`
- `not_reachable`

Maximum failed attempts are task-type rules, not a global constant. After the configured maximum, the app allows or asks the field user to close with a final reason. It does not auto-close.

### Admin Correction Event

No correction request queue is created from Android.

Admin corrections are handled by Research Scientists and central admins in the Vite admin app.

Key fields:

- `correction_event_id`
- `site_id`
- `subject_type`
- `subject_id`
- `field_name`
- `old_value`
- `new_value`
- `old_precision`
- `new_precision`
- `reason_code`
- `reason_text`
- `source_reference`
- `corrected_by_user_id`
- `corrected_at`

Admin corrections immediately recalculate eligibility, state, and future tasks. Completed form responses remain immutable.

### Data Quality Flag

Data quality flags are used for offline duplicate completions and other review items.

Key fields:

- `flag_id`
- `site_id`
- `flag_type`
- `subject_type`
- `subject_id`
- `task_id`
- `primary_response_id`
- `duplicate_response_id`
- `severity`
- `status`
- `created_at`
- `reviewed_by_user_id`
- `reviewed_at`
- `review_note`

Initial required flag:

- `duplicate_task_completion`

Future compatible flags:

- `identity_conflict`
- `eligibility_changed_after_completion`
- `two_active_pregnancies_possible_duplicate`
- `birth_count_mismatch`
- `task_completed_after_closed`

## Workflow Rules

Workflow rules must live in a shared TypeScript package used by both Expo and backend.

Suggested package areas:

```text
shared/domain
shared/workflow-rules
shared/context-builders
shared/prefill-mappers
shared/protocol-config
```

Rules generate tasks from domain events and state. The backend replays the same rules during sync and merges tasks by deterministic `task_key`.

### No Ad Hoc Forms

There are no ad hoc forms.

Forms can open from:

1. scheduled follow-up tasks
2. event-triggered immediate tasks
3. unscheduled opportunity events created by contextual trigger buttons

An unscheduled opportunity event is not "open any form". It is a valid domain event that permits a protocol-defined task/form now.

### Contextual Trigger Buttons

The app should expose state-aware trigger buttons from both:

- household visit screen
- dedicated household, woman, pregnancy, and child detail screens

Use one shared action registry:

```text
contextual_action_registry:
  action_key
  label
  subject_type
  allowed_when(subject_state)
  creates_event_type
  creates_task_type
  opens_form
```

Examples:

Household card:

- start household round
- record roster change
- new eligible woman found
- pregnancy reported

Woman card:

- start WQ
- pregnancy detected
- currently unavailable

Pregnancy card:

- start current PFF
- USG report available
- delivery/outcome reported
- pregnancy loss reported

Child card:

- start current NFF
- child died
- mother/child outside study area

The buttons must be subject-specific. A delivery button on a pregnancy card already knows the `pregnancy_id`.

### Task Dates

Every task has:

- `anchor_date`
- `window_start`
- `target_date`
- `deadline_date`

Operational states are date-derived and status-derived:

- `planned`: before window start
- `due`: window start through target date
- `urgent`: after target date but before deadline
- `overdue`: after deadline

Detailed follow-up-window decisions and unresolved asymmetric-window questions are maintained in `docs/superpowers/Follow-up-windows.md`.

### Global Form-Type Deadline Rules

Task windows and deadlines are global by form/task type. They are not site-specific.

Use versioned protocol config:

```text
task_schedule_rule:
  rule_id
  task_type
  subject_type
  anchor_event_type
  anchor_date_field
  target_offset_value
  target_offset_unit
  window_start_offset_value
  window_start_offset_unit
  deadline_offset_value
  deadline_offset_unit
  repeat_interval_value
  repeat_interval_unit
  repeat_until_condition
  expected_forms
  mode_rule
  rules_version
  active_from
  active_to
```

### HRF Schedule

HRF is household-relative, anchored to baseline HHQ completion.

```text
anchor_date = household.baseline_completed_date
HRF round 1 target = anchor_date + 2 calendar months
HRF round 2 target = anchor_date + 4 calendar months
HRF round 3 target = anchor_date + 6 calendar months
continue until study end
```

Late HRF completion does not shift future HRF rounds.

If an HRF is missed completely, the next household contact completes the current due round, not the missed round. Older expired rounds are marked missed.

### PFF Schedule

PFF is pregnancy-relative, anchored to PEF completion / pregnancy enrollment date.

```text
anchor_date = pregnancy.enrollment_date
PFF M1 target = anchor_date + 1 calendar month
PFF M2 target = anchor_date + 2 calendar months
PFF M3 target = anchor_date + 3 calendar months
continue until pregnancy outcome or study end
```

Late PFF completion does not shift future PFF dates.

When POF is completed, all future planned PFF tasks for that pregnancy are superseded.

If one monthly PFF is missed, the next visit completes the current due PFF only, not the missed one.

PFF mode is flexible. The app should show previous visit mode and document current actual mode.

### NFF Schedule

NFF is child-relative, anchored to birth date.

Use calendar-month scheduling for month-labelled visits.

Fixed early labels:

```text
7d = birth_date + 7 days
28d = birth_date + 28 days
2m = birth_date + 2 calendar months
3m = birth_date + 3 calendar months
4.5m = birth_date + 4 calendar months + 15 days
6m = birth_date + 6 calendar months
7.5m = birth_date + 7 calendar months + 15 days
9m = birth_date + 9 calendar months
10.5m = birth_date + 10 calendar months + 15 days
12m = birth_date + 12 calendar months
14m = birth_date + 14 calendar months
16m = birth_date + 16 calendar months
```

After 16m:

```text
continue every 2 calendar months until study end
labels: 18m, 20m, 22m, ...
```

NFF tasks store both:

- `sequence_number`
- `protocol_visit_label`

Mode is protocol-controlled but conditional:

- default face-to-face: 7d, 28d, 2m, 3m, 6m, 9m, 12m
- default telephonic: 4.5m, 7.5m, 10.5m, 14m, 16m, 18m and later
- telephonic is allowed for a default face-to-face NFF if mother/child is outside the study area

The app records actual mode and whether an exception applies.

### VA Schedule

VA is generated after stillbirth or child death.

```text
target_date = stillbirth/death event date + 30 days
window_start = target_date - 3 days
deadline = target_date + 14 days
```

VA task generation is active now. VA form opening is disabled until VA SurveyJS JSON is available.

Android behavior:

- VA task is visible in household and event worklists
- action state is disabled
- disabled reason is `va_json_pending`
- field users cannot complete or close VA while the form JSON is unavailable

Admin behavior:

- VA tasks are visible in monitoring
- VA schedule status can become planned, due, urgent, or overdue

### Immediate Event-Triggered Tasks

The app must generate key follow-up tasks offline.

Examples:

```text
pregnancy_detected -> PEF task now
PEF completed -> PFF schedule generated
USG report available -> UF task now
delivery_reported -> POF task now
POF completed -> BAF task per qualifying birth/fetal loss
BAF completed -> SBF, CDF, or NFF tasks based on classification
stillbirth_recorded -> VA task at event date + 30 days
child_death_recorded -> CDF task now and VA task at death date + 30 days
```

### Deterministic Future Tasks

If the anchor date is known and schedule is deterministic, generate all planned tasks through the relevant end condition.

Examples:

- HRF through study end after baseline HHQ completion
- PFF through expected/study end after PEF completion, later superseded by outcome
- NFF through study end after live child birth
- VA 30 days after stillbirth/death

Generated future tasks are planned work, not irreversible events. Later domain events can complete, miss, cancel, or supersede them.

### Repeated Series Missed Rule

For repeated scheduled series:

```text
complete the current due task only
do not backfill missed scheduled tasks
```

Applies to:

- HRF
- PFF
- NFF

Before opening a repeated series task, the app should:

1. mark expired older tasks as missed if appropriate
2. select the current due or urgent task
3. open the expected form for that task
4. preserve missed tasks for reporting

### Task Attempts And Closure

Failed attempt thresholds are task-type rules, not global.

After the configured number of failed attempts, the app asks or allows the field user to close with a final reason. It does not auto-close.

Deadline rules and failed-attempt rules both matter:

- before max failed attempts: task remains active
- at max failed attempts: close action becomes available and requires final reason
- after deadline: task may be overdue, but closure still follows disposition rules

### Mode Rules

Mode is documented at visit/form level, with task guidance.

HRF:

- default mode: telephonic
- face-to-face allowed when combined with household visit
- no reason required if not default

PFF:

- flexible
- show previous mode
- document actual current mode

NFF:

- conditional protocol
- default mode determined by protocol visit label
- telephonic allowed for default face-to-face visits if mother/child is outside study area
- require reason/condition documentation when actual mode differs from default

VA:

- default mode: face-to-face
- protocol exceptions can be added later if defined

## Task Context And Prefill

Each synced task should carry a concise generated context snapshot.

```text
task_context_json = generated field-use context, not source of truth
```

The source of truth remains normalized domain state plus immutable form responses.

### Context Builder Registry

Use explicit TypeScript context builders per task/form type:

```text
buildHrfContext()
buildWqContext()
buildPefContext()
buildPffContext()
buildUfContext()
buildPofContext()
buildBafContext()
buildSbfContext()
buildNffContext()
buildCdfContext()
buildVaContext()
```

Context builder output:

```text
display:
  title
  subtitle
  warnings
identifiers
prior
alerts
```

Examples:

HRF context:

- household head
- contact numbers
- current roster summary
- eligible women summary
- last HRF date/status
- open pregnancies and children in household

PFF context:

- woman name
- household/member IDs
- pregnancy enrollment date
- LMP/EDD if known
- last PFF key findings
- USG status

NFF context:

- child ID
- birth date
- previous NFF visit label/date/status
- survival status
- mother/child location status

VA context:

- stillbirth or child death date
- event type
- mother/child identifiers
- 30-day due date

### Prefill Mapper Registry

Use a separate registry for SurveyJS initial values and read-only values:

```text
mapHrfPrefill()
mapWqPrefill()
mapPefPrefill()
mapPffPrefill()
mapUfPrefill()
mapPofPrefill()
mapBafPrefill()
mapSbfPrefill()
mapNffPrefill()
mapCdfPrefill()
mapVaPrefill()
```

Keep context and prefill separate:

- context is for human display and decision support
- prefill is for exact SurveyJS fields and saved payload

Each form response stores `prefill_snapshot_json`.

Read-only by default:

- site ID
- locality ID
- structure map ID
- household ID
- household member ID
- woman ID
- pregnancy ID
- child/birth ID
- task ID
- visit label or round number
- previous linked visit IDs
- scheduled target/deadline metadata

The field app does not allow overwriting these lineage fields.

If lineage is wrong, the app still allows form continuation. Corrections are handled outside the Android app and applied later in admin.

## Offline Sync

### Area-Scoped Sync

No household assignment model is required initially.

Sync scope is based on assigned villages/colonies:

```text
user_area_assignment:
  user_id
  site_id
  locality_code
  role
  active_from
  active_to
```

The Android device receives all active records where `site_id/locality_code` is in the user's assignment.

Required on device:

- mapping frame (all listed/enrolled/empty frame entries for assigned localities)
- active households in assigned localities
- current roster/person state
- eligible women
- active and recent pregnancies
- active child follow-up records
- active/planned tasks
- task attempts (all attempts for tasks in pull scope)
- task context JSON
- masters
- protocol rules (full config, refreshed when version changes)
- form JSON versions and cached form JSONs
- user and area assignments (from /api/auth/me)

Do not require full prior form-response JSON for every record on the device. For routine field work, sync domain state plus task contexts. Full prior form payloads can remain backend-side unless created on that device or specifically needed.

### Offline Outbox

The Android app writes local outbox records for:

- form responses
- domain events
- generated tasks
- task attempts
- visit records
- local state updates

Each record needs:

- stable local ID
- device ID
- user ID
- created offline timestamp
- idempotency key where applicable
- sync status

### Backend Sync Merge

Backend behavior:

1. accept immutable form responses
2. deduplicate retried uploads by response ID/idempotency key
3. apply valid domain events
4. replay workflow rules
5. merge generated tasks by `task_key`
6. merge task attempts by `attempt_id`
7. detect duplicate task completions
8. return updated domain/task state for assigned areas

### App Sync Sequence

The app follows this sequence on each sync:

1. Read current area assignments from `GET /api/auth/me` → `area_assignments`
2. POST outbox records to `/api/sync/push` with all pending finalized form responses, task attempts, visits, domain events, and generated tasks
3. GET `/api/sync/pull` with current `sync_cursor` and assigned `locality_codes`
4. If `protocol_config_version` differs from cached version, call `GET /api/protocol/config` and batch-download updated form JSONs via `GET /api/protocol/forms/batch?codes=...`
5. Apply pull response to local SQLite domain store
6. Clear synced outbox records

Pull is paginated. Continue fetching `next_page_token` pages until absent.

### Sync Cursor

`sync_cursor` is an opaque server-issued token. Clients treat it as opaque and pass it unchanged in `since=` on the next pull. On first sync, omit `since`. The server uses this to return only records updated after the previous sync position (internally a server timestamp or sequence).

### Offline Duplicate Completion

Because devices are area-scoped and offline, two devices may open and complete the same task.

Rule:

```text
all completed form responses are accepted as evidence
first synced valid completion closes the task operationally
later completions for the same task are marked duplicate_task_completion
duplicate domain events are held if they conflict with current state
```

Backend behavior:

If task is open:

- accept response
- mark response `primary`
- complete task
- apply domain events

If task is already completed by another response:

- accept response
- mark response `duplicate_task_completion`
- keep raw JSON immutable
- do not overwrite domain state automatically
- create `duplicate_task_completion` data-quality flag
- hold conflicting domain events as `held_duplicate`

## Admin App Design

### Role Scoping

Site Research Scientist:

- own site only
- correct core identity/cohort fields
- resolve site-resolvable correction flags
- review duplicate-response flags
- escalate duplicate-response flags to central
- cannot promote duplicate response as canonical

Central Data Manager/Admin:

- all sites
- global protocol rules
- user/device/area assignments
- canonical duplicate-response arbitration
- global data-quality review

Field worker:

- Android app only
- area-scoped records
- submit forms, task attempts, and trigger events
- no core edits
- no correction requests

Field supervisor:

- optional limited admin view
- task status and attempt review
- no core correction rights unless separately granted

### Admin Screens

Masters and mapping frame:

- sites
- localities/villages/colonies
- mapping frame
- structures
- baseline enrollment status

Household/person search:

- by household ID
- structure number
- household head
- member/woman name
- phone
- locality
- pregnancy/child status

Household longitudinal view:

- household summary
- roster
- eligible women
- pregnancies
- children
- visits
- tasks
- attempts
- events
- flags

Admin correction screens:

- search subject
- open longitudinal view
- edit allowed core field
- show before/after
- require correction reason
- save correction event
- immediately recalculate eligibility/tasks
- sync corrected state back to devices

Task/schedule monitor:

- due, urgent, overdue, missed, postponed
- household-centered grouping
- person/event-centered grouping
- VA visible even while disabled in Android

Sync monitor:

- devices
- outbox/inbox status
- failed sync records
- duplicate completions
- held events

Data-quality flags:

- site-scoped for Site Research Scientist
- all-site view for central admin
- duplicate completion review
- correction-related flag resolution

### Duplicate Flag Permissions

Site Research Scientist can:

- view own-site duplicate flags
- mark reviewed
- add review note
- escalate to central review

Site Research Scientist cannot:

- promote a duplicate response as canonical
- change canonical response arbitration

Central admin can:

- keep primary
- promote duplicate
- mark both retained
- apply domain correction from reviewed values

## Android App Design

### Device Registration

Field workers register their own device on first login via `POST /api/devices/register`. This requires only `field_worker` credentials and records the device ID and user association. Admin pre-registration via `POST /api/devices` remains available for bulk setup.

### Main Navigation

Required screens:

- household-centered worklist
- person/event-centered worklist
- household visit screen
- household detail
- woman detail
- pregnancy detail
- child detail
- task detail and attempt recording
- SurveyJS form screen
- sync status screen

No global open-any-form menu.

### Household-Centered Worklist

Purpose:

- field visit planning
- combined household contact
- opportunity scanning

Shows households in assigned localities with:

- current HRF status
- due/urgent pregnancy tasks
- due/urgent child tasks
- due WQ tasks
- recent failed attempts
- visible disabled VA tasks where applicable

### Person/Event-Centered Worklist

Purpose:

- targeted calls
- supervisor review
- missed/urgent recovery
- event-driven follow-up

Views:

- PEF due
- PFF due/urgent/overdue
- NFF due/urgent/overdue
- VA due/overdue disabled if JSON pending
- WQ due
- missed/not reachable tasks
- duplicate or sync attention markers if synced back

### Household Visit Screen

The household visit screen shows all tracked roster state, not only due tasks.

Sections:

- household summary
- current HRF/task status
- all current roster members
- eligibility status
- movement/status indicators
- eligible women
- active pregnancies
- active child follow-up records
- contextual trigger buttons inside each relevant card

This is required because the app must detect age-up eligibility and new eligibility during household contact.

### Detail Screens

Detail screens expose the same contextual action registry as household visit cards.

Household detail:

- household state
- roster
- HRF series
- linked women/pregnancies/children

Woman detail:

- WQ status
- eligibility history
- pregnancy detection action
- pregnancy list

Pregnancy detail:

- PEF/PFF/UF/POF state
- schedule
- USG status
- outcome trigger

Child detail:

- BAF/SBF/NFF/CDF state
- NFF schedule
- death trigger
- VA task visibility

### SurveyJS Form Screen

The form screen opens only from a task or valid trigger-generated immediate task.

It receives:

- form JSON
- prefill values
- read-only lineage fields
- task context
- visit/session metadata

Layout:

- use a two-pane form layout on tablet/desktop-width screens
- show SurveyJS Side Navigation / Table of Contents in the left pane
- derive section labels from SurveyJS pages or explicit section metadata, not from question labels
- show current section, completion state, and validation/error state where feasible
- allow section click/tap to move within the form without submitting it
- use a collapsible section drawer or equivalent compact control on narrow screens
- show a progress bar based on SurveyJS page/section completion
- recompute progress from current answers and the SurveyJS model rather than treating it as analysis data
- keep Save Draft, Preview, and Submit actions available while navigating sections

On open:

- find the latest active local draft for the same task/form/version/subject/device/user context
- if present, load its partial `answers_json` and original prefill snapshot
- if absent, create a new draft shell from the task context and current prefill snapshot
- restore the last active section/page from `completion_state_json` when available

During entry:

- autosave dirty forms locally every 30 seconds
- expose explicit Save Draft
- expose Preview anytime; opening Preview first saves the current draft
- save on background, close, or navigation away when dirty
- show local last-saved status

Preview behavior:

- force-save current draft data
- show Preview from the saved local draft
- allow return from Preview to edit the form
- allow Preview even when the draft is incomplete, with incomplete or invalid sections clearly marked

Before finalization:

- force-save current draft data
- show or return to Preview from the saved local draft
- enable Finalize/Submit only after Preview and required validation

On Finalize/Submit:

- force-save current draft data
- save immutable form response
- generate domain events
- apply local domain state updates
- generate/supersede local tasks
- update task context for affected tasks
- mark the draft `submitted` with `submitted_form_response_id`
- write finalized form response and derived records to the outbox for upload

### Task Attempt Screen

Field users can mark:

- failed attempt
- postponed
- not reachable
- refused
- missed/closed when allowed

The screen must follow the task-type disposition rule and require final close reason when configured.

## Protocol Config

Protocol config should be versioned and synced to devices.

Config domains:

- schedule rules
- deadline windows
- failed-attempt disposition rules
- mode rules
- contextual action definitions
- form availability
- context builder version
- prefill mapper version

Each generated task stores the rule version and relevant rule snapshot fields so old tasks remain interpretable after protocol changes.

## Current Repository Implications

Current useful pieces:

- Expo prototype already uses SurveyJS JSON and Expo SQLite for household storage.
- Backend prototype already exposes masters and household sync routes.
- Shared study masters already exist.
- Tests currently validate bundled forms, masters, and household ID extraction.

Key architecture changes required before real field use:

- replace JSON-file backend persistence with Postgres
- create normalized domain tables
- make form responses immutable evidence records
- stop deleting/replacing household members on save
- introduce domain events and follow-up tasks
- introduce shared workflow rules
- introduce task contexts and prefill mappers
- add area-scoped sync
- add admin corrections and data-quality flags
- replace form-menu workflow with task/action workflow

## Non-Goals And Guardrails

Do not:

- use notes for routing, skip logic, cohort definition, or analysis variables
- allow arbitrary new households after baseline
- allow temporary visitors to become household roster members
- create household split events
- allow Android users to edit locked identity/cohort fields
- add Android correction-request workflow
- let field users close VA tasks while VA JSON is pending
- silently discard duplicate offline form responses

Do:

- preserve source PDF variable IDs in `sourceCode`
- keep SurveyJS answer keys analysis-safe and form-prefixed where needed
- store read-only prefill snapshots
- store actual visit mode
- generate deterministic tasks offline where anchor dates are known
- preserve immutable evidence even when operational state changes later

## Open Implementation Notes

These are implementation sequencing notes, not unresolved design placeholders.

- VA task support is in scope; VA SurveyJS JSON is pending.
- Export design is out of scope for the first architecture spec.
- The first implementation should build the complete domain/task model, even if UI screens are delivered incrementally.
- Existing dirty worktree changes should be handled separately from this spec.
