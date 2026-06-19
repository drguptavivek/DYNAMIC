# DYNAMIC Event-Driven Architecture Policy

Status: working policy for the foundation rewrite

Date: 2026-06-17

## Purpose

This policy defines the corrected event-driven architecture for DYNAMIC
PreTESTING. It is the implementation policy for backend schema, offline sync,
Expo workflow generation, admin corrections, and downstream task generation.

The project has no legacy production data. Breaking schema and workflow changes
are allowed when they make the foundation safer and simpler.

This policy exists because recent audits found that the current implementation
is event-shaped but still procedural: form responses are inserted and then code
directly mutates households, members, pregnancies, children, and tasks. That
pattern is not strong enough for offline work, duplicate task completions,
corrections, deterministic scheduling, or auditability.

## Related Source Documents

Read these before implementing this policy:

- `AGENTS.md`
- `docs/superpowers/specs/2026-06-03-dynamic-fullstack-offline-architecture-design.md`
- `docs/superpowers/form-field-event-rules.md`
- `docs/superpowers/schedules-and-survival-data-model.md`
- `docs/superpowers/audit_log_policy.md`
- `docs/superpowers/Edit-Escalations.md`
- `docs/surveyjs/Mobile-save-sync-policy.md`
- `docs/AUDIT/comparison.md`
- `docs/AUDIT/glm-issues.md`
- `docs/AUDIT/MiMo-issues.md`

When documents conflict, this policy tightens the implementation architecture
but does not override the questionnaire PDFs, `Refs/FLOW.md`, or
`Refs/Unique_Ids.md`.

## Core Decision

DYNAMIC uses an event-sourced study core with projection tables.

Authoritative records are append-only evidence and events. Current operational
tables are derived projections used for fast queries, worklists, sync payloads,
and admin screens.

The same event policy, event contracts, workflow rules, and projection mutation
logic must operate in both the backend and the Expo app. Expo applies them
locally for offline continuity. The backend applies them authoritatively during
sync and admin workflows.

```text
authoritative:
  immutable form responses
  domain events
  task lifecycle events
  workflow decision events
  admin correction events
  data-quality flags
  sync ingest records

derived projections:
  households
  household_members
  eligible_women
  pregnancies
  ultrasound_records
  pregnancy_outcomes
  children
  follow_up_tasks
  task_attempts_current
  household_projection_state
```

No handler may directly mutate longitudinal state except as part of applying or
rebuilding a projection from accepted events.

## Shared Event Kernel

The implementation must provide one shared event kernel used by both runtime
surfaces.

```text
shared event kernel:
  event schemas
  command-to-event classifiers
  projection reducers
  workflow generators
  task lifecycle rules
  deterministic ID/key builders
  protocol calendar/date helpers
  validation helpers for event payloads
```

Backend and Expo may use different storage adapters, but they must not maintain
different domain rules.

```text
Expo runtime:
  local command
    -> local immutable evidence
    -> local event classification
    -> local projection reducers
    -> local workflow generation
    -> local provisional tasks/worklists
    -> sync outbox

Backend runtime:
  sync/admin command
    -> authoritative evidence/event append
    -> authoritative classification
    -> same projection reducers
    -> same workflow generation
    -> authoritative projections/tasks
    -> sync pull deltas
```

The backend is the reconciliation authority after sync. Expo's local projection
is a provisional projection derived from local accepted evidence and the same
rules. When backend confirmation arrives, Expo reconciles by stable response
IDs, event IDs, task keys, and server commit sequence.

Admin-only commands are the main exception. Expo must not originate admin
correction, approval, central arbitration, user-management, role-management, or
master-data mutation events. Expo may receive the resulting projection changes,
task changes, and field-visible data-quality markers through sync.

The shared event kernel must be pure. It cannot depend on Postgres, SQLite,
HTTP, React state, Express request objects, localStorage, or device APIs.
Runtime-specific code supplies storage, auth, scope, clock, ID, and transaction
adapters around the shared kernel.

## Non-Negotiable Rules

1. Submitted form responses are immutable evidence.
2. Drafts never generate events, complete tasks, update projections, or sync as
   evidence.
3. A finalized form response is classified before it can affect state.
4. The first valid completion for a task is primary. Later valid completions for
   the same task are preserved as duplicate evidence and do not re-promote
   domain state.
5. Area scope is enforced before accepting or returning data. Scope is resolved
   from server-known assignments and stored subject/task records, not from
   client-controlled `answers_json` alone.
6. Workflow generation is deterministic. The same accepted event plus the same
   projection snapshot and rules version must produce the same task keys.
7. No hidden wall-clock anchors are allowed. Protocol dates come from accepted
   events, form dates, or explicit server commit metadata.
8. Admin corrections are events. They do not edit submitted evidence. They
   trigger projection rebuild and future task recalculation.
9. Completed history is not deleted. Future uncompleted tasks may be cancelled,
   superseded, or regenerated.
10. SurveyJS JSON is a rendering layer and raw evidence payload, not the
    longitudinal data model.
11. Backend and Expo must use the same event schemas, reducers, deterministic
    ID builders, task-key builders, and workflow rules for all field-originated
    study events.
12. Runtime-specific mutation code must be limited to persistence, auth/scope,
    transactions, and sync reconciliation. It must not fork study rules.

## Terminology

Evidence is a submitted factual record, usually a finalized form response or a
task attempt. Evidence is immutable after acceptance.

An event is a typed fact or decision derived from evidence or correction review.
Examples: `household_enrolled`, `pregnancy_enrolled`,
`child_death_recorded`, `task_completed`, `admin_correction_applied`.

A projection is current operational state derived from accepted events.
Examples: household roster, eligible woman state, active pregnancy state, child
state, and current task worklists.

A workflow decision is a recorded decision to create, suppress, cancel, disable,
or supersede a task.

A command is a request to do work, such as sync push, submit form, record
attempt, close task, or apply correction. Commands are not source-of-truth
records until they append evidence/events inside a transaction.

A mutation is a projection reducer applied to an accepted event. Mutations are
pure domain operations: event plus projection snapshot in, projection changes
and workflow decisions out. Backend and Expo use the same mutation logic for
field-originated events.

## Event Envelope

Every domain, workflow, task, and correction event uses a common envelope.

```text
event_id
event_type
event_version
aggregate_type
aggregate_id
site_id
locality_code
household_id
subject_type
subject_id
task_id
task_key
form_response_id
source_event_id
source_response_id
source_task_id
event_date
recorded_at
server_commit_sequence
created_offline_at
device_id
user_id
rules_version
payload
apply_status
```

Required conventions:

- `event_id` is globally unique and stable.
- `aggregate_type` is usually `household`; use household-scoped replay first.
- `aggregate_id` is usually `household_id`.
- `event_date` is a study calendar date when the event is a protocol fact.
- `recorded_at` is an instant when the event was recorded.
- `server_commit_sequence` is the backend ordering authority after sync.
- `rules_version` records the workflow/projection rules used.
- `payload` may hold supplemental values, but values needed for identity,
  scheduling, routing, reporting, or analysis must also be promoted to typed
  columns or typed projection tables.
- `apply_status` is one of `applied`, `held_duplicate`,
  `rejected_invalid`, or `superseded`.

## Authoritative Tables

The exact schema can evolve, but the architecture needs these table roles.

```text
form_responses
  response_id
  idempotency_key
  form_code
  form_version
  task_id
  task_key
  subject_type
  subject_id
  household_id
  site_id
  locality_code
  answers_json
  response_status
  device_id
  user_id
  device_submitted_at
  server_received_at
  server_commit_sequence

domain_events
  common event envelope

task_lifecycle_events
  common event envelope
  task status transition payload

workflow_events
  common event envelope
  generated, suppressed, cancelled, disabled, or superseded task decision

admin_correction_events
  common event envelope
  subject, field, old value, new value, reason, reviewer, approval state

data_quality_flags
  flag_id
  flag_type
  household_id
  subject_type
  subject_id
  task_id
  primary_response_id
  duplicate_response_id
  source_event_id
  severity
  status
  created_at
  reviewed_by_user_id
  reviewed_at
  review_note

sync_ingest_records
  ingest_id
  device_id
  user_id
  request_id
  record_type
  idempotency_key
  accepted_status
  error_code
  server_commit_sequence
```

`response_status` values:

```text
primary
duplicate_task_completion
invalid_rejected
superseded_by_admin
held_for_review
```

## Projection Tables

Projection tables are query models. They may be rebuilt.

```text
households
household_members
eligible_women
pregnancies
ultrasound_records
pregnancy_outcomes
children
follow_up_tasks
task_attempts_current
household_projection_state
```

Rules:

- Each projection row records source provenance: `source_event_id`,
  `source_response_id`, `rules_version`, `projection_version`, and
  `projected_at`.
- Projection updates must be idempotent.
- Projection rebuild for one household must be possible without reading every
  row in the study.
- Projection tables are never the only place where a study fact exists.

## Command Processing Pipeline

All finalized field and admin actions enter through one pattern. Field-originated
commands use the same classifier and reducers in Expo and backend. Admin
commands are authored only through backend/admin surfaces.

```text
receive command
  -> authenticate user
  -> enforce role and area scope
  -> validate idempotency key
  -> append immutable evidence or command event
  -> classify primary, duplicate, invalid, or held
  -> append accepted domain/task/correction event if applicable
  -> apply or rebuild projection
  -> run workflow generator
  -> write workflow decisions and task projection changes
  -> write data-quality flags when needed
  -> commit transaction
  -> return accepted records and updated projection/task deltas
```

The backend must process each accepted sync record inside a transaction. If a
projection or workflow handler fails, the authoritative append and derived
projection updates for that record must not be partially committed.

Use `INSERT ... ON CONFLICT ...` or equivalent idempotent writes instead of
read-then-write duplicate checks.

Expo runs the same logical pipeline for field-originated commands, with local
storage and local auth context instead of backend transactions.

```text
Expo local command
  -> verify local session and assigned area context
  -> validate task/opportunity can open the form
  -> append local immutable evidence
  -> classify against local projection
  -> append local provisional events
  -> run shared reducers and workflow generator
  -> update local projections/tasks
  -> enqueue evidence/events for sync
```

Local Expo events and projections are provisional until backend sync confirms
them. The backend reclassifies every pushed record against authoritative state
using the same shared rules. If backend classification differs from Expo's local
classification, backend result wins and Expo reconciles through pull deltas.

## Scope Policy

Area scope is a security and correctness boundary.

For pull:

- The server intersects requested site/locality filters with active
  `user_area_assignments`.
- Field workers receive only assigned localities.
- Household member pulls by `household_id` must first resolve those household
  IDs to server-stored site/locality and then enforce assignment scope.

For push:

- If the pushed record references an existing task, household, member, woman,
  pregnancy, or child, scope is resolved from that server-stored record.
- If the pushed record is an HHQ baseline for a mapped household not yet
  enrolled, scope is resolved from the mapping frame or assigned locality plus
  canonical household ID parts.
- Client-provided `site_id`, `locality_code`, and `answers_json` may support
  validation but must not be the only authority.

## Classification Policy

Every finalized form response is classified before promotion.

Primary response:

- first valid response for an open task or valid contextual opportunity
- closes or completes the relevant task according to lifecycle rules
- may emit domain events
- may trigger workflow generation

Duplicate task completion:

- valid response for a task already completed by another primary response
- preserved as immutable evidence
- marked `duplicate_task_completion`
- does not update projections automatically
- creates a `duplicate_task_completion` data-quality flag
- emits only duplicate/flag events unless central review later promotes it

Invalid rejected response:

- fails required structural validation, scope validation, protocol validation,
  or form-version compatibility
- is either rejected before persistence or stored as rejected evidence when
  retention is needed for audit
- never updates projections

Held response/event:

- cannot be safely applied because it conflicts with current state or awaits
  admin review
- remains visible in admin data-quality workflows
- never silently disappears

## Domain Event Catalog

Use a controlled event vocabulary. Add new event types only when they represent
a durable protocol fact, task lifecycle transition, workflow decision, or admin
correction.

### Evidence And Classification Events

```text
form_response_submitted
form_response_classified_primary
form_response_classified_duplicate
form_response_rejected_invalid
form_response_held_for_review
```

### Household And Member Events

```text
household_baseline_confirmed
household_enrolled
household_not_enrolled_at_baseline
household_round_completed
member_roster_recorded
member_added_by_valid_event
member_status_changed
member_dob_updated
member_identity_corrected
woman_became_eligible
woman_became_ineligible
woman_tracking_started
woman_tracking_stopped
```

Valid later member additions are limited to protocol-supported events such as
in-migration, marriage-in, or birth into an enrolled household. Temporary
visitors are not roster members and cannot become eligible from the visited
household.

Household splits do not create new household IDs or split events.

### Woman And Pregnancy Events

```text
woman_baseline_completed
pregnancy_detected
pregnancy_enrolled
pregnancy_followup_completed
pregnancy_status_changed
ultrasound_report_available
ultrasound_recorded
pregnancy_outcome_suspected
pregnancy_outcome_recorded
pregnancy_closed
```

Pregnancy IDs and sequence numbers must be deterministic within the woman or
server-assigned under a transaction. They must not be random values generated
inside form-promotion code.

### Birth, Child, And Death Events

```text
birth_outcome_recorded
live_birth_recorded
stillbirth_recorded
birth_assessment_completed
newborn_followup_completed
child_alive_confirmed
child_death_detected
child_death_recorded
stillbirth_detail_recorded
verbal_autopsy_due
verbal_autopsy_completed
```

Child IDs must be deterministic from pregnancy/birth outcome identity and birth
rank, or assigned by one authoritative server-side allocator. Duplicate
processing must not create a second child for the same birth rank.

### Task Lifecycle Events

```text
task_generated
task_disabled
task_opened
task_attempt_recorded
task_completed
task_closed_final_reason
task_missed
task_cancelled
task_superseded
task_reopened_by_admin
```

Task status is changed by lifecycle events, not by arbitrary `task_key` status
updates from clients.

### Workflow Decision Events

```text
workflow_tasks_generated
workflow_task_suppressed
workflow_task_cancelled
workflow_task_superseded
workflow_series_started
workflow_series_stopped
workflow_projection_rebuilt
```

### Admin Correction Events

```text
admin_correction_requested
admin_correction_approved
admin_correction_rejected
admin_correction_applied
projection_rebuilt_after_correction
data_quality_flag_resolved
```

Android does not create correction requests. Corrections are admin workflow
events handled by Site Research Scientists and central roles.

## Form-To-Event Policy

Each form completion can produce multiple typed events. Form JSON choices and
labels are not the event model. The PDF `Variable ID` remains the canonical
source question code; event extraction maps source fields into typed events.

### HHQ

Accepted HHQ primary completion may emit:

```text
household_baseline_confirmed
household_enrolled
household_not_enrolled_at_baseline
member_roster_recorded
woman_became_eligible
woman_tracking_started
workflow_series_started: household_round
```

Rules:

- HHQ validates a household from the mapped frame.
- HHQ does not create arbitrary households outside assigned mapped areas.
- Empty, vacant, not occupied, or non-enrolled households remain outside future
  follow-up.
- Member number is server-controlled or deterministically allocated under the
  household aggregate. Do not trust editable form line numbers as identity.

### HRF

Accepted HRF primary completion may emit:

```text
household_round_completed
member_added_by_valid_event
member_status_changed
woman_became_eligible
woman_became_ineligible
pregnancy_detected
woman_tracking_stopped
```

Rules:

- HRF is anchored to HHQ baseline completion date.
- Late HRF completion does not shift future HRF anchors.
- Missed HRF rounds are not backfilled as if they happened on time.

### WQ

Accepted WQ primary completion may emit:

```text
woman_baseline_completed
woman_tracking_started
pregnancy_detected
woman_tracking_stopped
```

Rules:

- WQ eligibility is derived from household member data and valid later member
  additions.
- WQ may trigger PEF only through an accepted event and workflow rule.

### PEF

Accepted PEF primary completion may emit:

```text
pregnancy_enrolled
ultrasound_report_available
workflow_series_started: pregnancy_followup
```

Rules:

- PFF is anchored to PEF completion or pregnancy enrollment date.
- Late PFF completion does not shift future PFF anchors.
- Pregnancy sequence is not hardcoded. It is derived or allocated under the
  woman aggregate with uniqueness guarantees.

### UF

Accepted UF primary completion may emit:

```text
ultrasound_recorded
```

Rules:

- UF records evidence linked to a woman or pregnancy context.
- UF does not create pregnancy or child state by itself unless protocol rules
  explicitly define that transition.

### PFF

Accepted PFF primary completion may emit:

```text
pregnancy_followup_completed
ultrasound_report_available
pregnancy_status_changed
pregnancy_outcome_suspected
pregnancy_closed
```

Rules:

- PFF can end or pause pregnancy follow-up only through typed events.
- Any pregnancy outcome path must lead to the proper POF workflow rather than
  direct ad hoc child creation.

### POF

Accepted POF primary completion may emit:

```text
pregnancy_outcome_recorded
birth_outcome_recorded
live_birth_recorded
stillbirth_recorded
pregnancy_closed
workflow_series_stopped: pregnancy_followup
```

Rules:

- Miscarriage, stillbirth, live birth, neonatal death, and child death must be
  separated into typed outcome events. Do not bundle miscarriages and
  stillbirths into one downstream child/stillbirth path.
- Birth ranks must be deterministic and unique within the pregnancy outcome.

### BAF

Accepted BAF primary completion may emit:

```text
birth_assessment_completed
child_alive_confirmed
child_death_recorded
stillbirth_recorded
workflow_series_started: newborn_followup
verbal_autopsy_due
```

Rules:

- BAF subject type for child-specific tasks is `child`, not `pregnancy`.
- BAF may trigger NFF, CDF, SBF, or VA depending on accepted outcome facts.

### SBF

Accepted SBF primary completion may emit:

```text
stillbirth_detail_recorded
verbal_autopsy_due
```

Rules:

- VA target date is stillbirth event date plus 30 days.
- VA tasks are visible but disabled until VA JSON exists.

### NFF

Accepted NFF primary completion may emit:

```text
newborn_followup_completed
child_alive_confirmed
child_death_detected
child_death_recorded
workflow_series_stopped: newborn_followup
verbal_autopsy_due
```

Rules:

- NFF uses protocol labels and calendar-month scheduling: 7d, 28d, 2m, 3m,
  4.5m, 6m, 7.5m, 9m, 10.5m, 12m, 14m, 16m, then every 2 calendar months until
  study end.
- Fractional month labels must be implemented deterministically.
- Child death stops future NFF tasks and starts CDF/VA workflow as applicable.

### CDF

Accepted CDF primary completion may emit:

```text
child_death_recorded
workflow_series_stopped: newborn_followup
verbal_autopsy_due
```

Rules:

- VA target date is child death event date plus 30 days.

### VA

Accepted VA primary completion may emit:

```text
verbal_autopsy_completed
task_completed
```

Rules:

- VA completion is terminal for the VA workflow.
- While VA form JSON is pending, VA tasks remain visible but disabled and cannot
  be opened or closed by field users.

## Workflow Engine Policy

Workflow generation lives in shared TypeScript packages used by both Expo and
backend.

```text
input:
  accepted event
  household projection snapshot
  protocol config
  rules_version
  study/site calendar policy

output:
  task descriptors
  task cancellations
  task suppressions
  task supersessions
  workflow events
  data-quality flags
```

Required properties:

- Pure functions: no database reads, random IDs, or hidden wall-clock calls.
- Deterministic task keys.
- Explicit anchor event and anchor date.
- Explicit rules version.
- Explicit disabled state for unavailable forms, especially VA.
- Current-due-only behavior for repeated series.

Task key:

```text
household_id
subject_type
subject_id
task_type
protocol_visit_label
target_date
rules_version
```

Repeated series rules:

- HRF is anchored to household baseline HHQ completion date.
- PFF is anchored to PEF completion or pregnancy enrollment date.
- NFF is anchored to child birth date or accepted birth outcome date.
- VA is anchored to stillbirth or child death event date plus 30 days.
- Late completion does not shift future anchors.
- Do not emit a wall of future actionable tasks. Generate or activate only the
  current due task and the next protocol-needed planned task if needed for UI.
- Missed rounds are marked missed or superseded according to protocol policy;
  they are not recreated later as if they were on time.

## Task Lifecycle Policy

Tasks are operational work items generated from workflow rules.

Field users can open forms only from:

1. scheduled follow-up tasks
2. event-triggered immediate tasks
3. valid contextual trigger buttons that create an allowed opportunity event

There is no global open-any-form workflow.

Task lifecycle transitions:

```text
planned -> due -> in_progress -> completed_on_time
planned -> due -> in_progress -> completed_late
planned/due/urgent/overdue -> missed
planned/due/urgent/overdue -> cancelled
planned/due/urgent/overdue -> superseded
due/urgent/overdue -> closed_final_reason
```

Rules:

- A task completion requires a primary accepted form response or explicit close
  event allowed by task type.
- A failed attempt increments failed-attempt count through a task attempt event.
- Failed-attempt limits are task-type rules.
- After the configured number of failed attempts, the app asks for a final
  close reason. It does not auto-close.
- Disabled tasks cannot be opened, completed, or closed by field users.

## Projection Rebuild Policy

Household-scoped replay is the first required replay boundary.

```text
rebuildHouseholdProjection(household_id)
  -> load accepted events for the household aggregate
  -> order by server_commit_sequence, then event_date, then event_id
  -> clear or mark stale derived projection rows for that household
  -> replay projectors
  -> run workflow generator
  -> upsert current projection rows and task rows
  -> record projection run metadata
```

Projection rebuild is required after:

- accepted HHQ response
- accepted HRF response that changes roster, eligibility, pregnancy status, or
  household status
- accepted WQ, PEF, PFF, POF, BAF, SBF, NFF, CDF, or VA response
- admin correction that touches identity, eligibility, outcome, schedule, or
  task context
- central arbitration that promotes duplicate evidence
- rules-version migration that affects future uncompleted tasks

Completed form responses and completed task history remain immutable during
rebuild.

Expo must support the same replay shape for its local household projection, but
with provisional ordering before sync.

```text
rebuildLocalHouseholdProjection(household_id)
  -> load local accepted/provisional events for the household aggregate
  -> order by server_commit_sequence when present
  -> otherwise order by device_id, device_sequence, created_offline_at, event_id
  -> replay the same shared reducers
  -> run the same workflow generator
  -> update local projections/tasks
```

After sync, server commit sequence becomes the ordering authority for records
confirmed by backend. Local-only unsynced evidence remains ordered by device
sequence until confirmed or superseded.

## Admin Correction Policy

Admin corrections append events. They do not edit raw form responses.

Admin correction, approval, rejection, central arbitration, user-management, and
master-data mutation events are backend/admin-originated only. Expo does not
create these events.

Correction flow:

```text
admin proposes correction
  -> correction event recorded
  -> approval rules applied
  -> approved correction event appended
  -> affected household projection rebuilt
  -> future uncompleted tasks recalculated
  -> data-quality flags resolved or created
```

Rules:

- Correction events include old value, new value, reason, actor, review state,
  and source reference.
- Corrections to `site_id`, `locality_code`, `structure_map_id`,
  `household_number`, `member_number`, sex, DOB, marital status, pregnancy
  status, birth outcome, stillbirth, and child death require explicit
  downstream recalculation.
- If a correction changes identity keys, the projection rebuild must rebuild
  dependent IDs or mark the case for central review. It must not orphan child
  rows under the old identity.
- Completed raw evidence remains unchanged and linked to the correction trail.
- The projection effects of approved admin events still use the shared
  projection reducers where they touch study domain state.
- Expo receives approved correction effects through sync as server-confirmed
  projection deltas, task deltas, data-quality flag changes, or read-only
  correction event history if needed for field visibility.
- If an approved admin correction conflicts with an unsynced local provisional
  projection, Expo keeps the unsynced evidence but reconciles current projected
  state to the backend result and surfaces any resulting sync/DQ marker.

## Offline Sync Policy

Expo stores immutable local evidence and local projections for field usability.
Backend remains the canonical arbiter after sync.

Push sends:

```text
form responses
task attempt events
contextual opportunity events
provisional local domain events
provisional local task lifecycle events
provisional local workflow decisions, when useful for reconciliation/debugging
visit records
```

Pull returns:

```text
assigned-area projections
current tasks
task context JSON
data-quality markers visible to the field user
protocol config versions
form versions
server cursors
```

Rules:

- Sync pushes evidence and events, not arbitrary projection table mutations.
- Provisional local workflow decisions are advisory. Backend recomputes workflow
  decisions from accepted evidence/events using the shared kernel.
- Pull must not overwrite unsynced local evidence.
- Pull may replace local projections when backend confirms the same evidence,
  has newer accepted evidence, or has an approved correction.
- Sync cursors are opaque server-issued tokens.
- Page tokens are signed or otherwise tamper-resistant.
- Local outbox IDs and idempotency keys must be stable.
- Device-generated UUID fallback must use a real UUID/crypto source, not
  `Math.random`.

## Expo Local Policy

Expo may generate local workflow projections for offline continuity, but it must
use the same shared workflow package and task-key rules as the backend.

Rules:

- Expo uses the shared event schemas, command classifiers, projection reducers,
  task lifecycle rules, deterministic ID builders, date helpers, and workflow
  generator.
- Expo runtime code supplies only local storage, local session context, local
  device sequence, and sync adapters around the shared kernel.
- Expo stores full task metadata needed for workflow and sync.
- Expo does not invent a parallel task schema that drops generated fields.
- Expo does not destructively delete and reinsert household members as a normal
  save operation.
- Expo prefill lineage/core fields are read-only in SurveyJS using the SurveyJS
  model API, including nested panel questions.
- Expo task routes re-check task availability and disabled state before opening
  forms.
- Local generated tasks are provisional until backend reconciliation confirms
  or supersedes them by deterministic task key.
- Expo does not implement admin correction, approval, central arbitration,
  user-management, role-management, or master-data mutation workflows.
- Expo may display backend-originated correction or data-quality status when the
  field user needs to understand why a local projection/task changed.

## Schema Cleanup Policy

Because there is no production data, remove schema concepts that contradict this
policy instead of preserving compatibility shims.

Required cleanup:

- Keep one correction-event model. Do not maintain both `admin_corrections` and
  `admin_correction_events` as competing concepts.
- Keep one task lifecycle model. Do not let clients update task status by raw
  `task_key` without lifecycle validation.
- Add missing typed schema definitions for all authoritative and projection
  tables.
- Add uniqueness constraints for deterministic identity:
  - household natural ID
  - household member number within household
  - pregnancy sequence within woman
  - birth rank within pregnancy or birth outcome
  - task key
  - response id and idempotency key
- Add indexes for sync and projection hot paths.

## Implementation Gates

Do not consider the foundation stable until these tests pass:

1. Two offline devices complete the same task. Both responses sync. One becomes
   primary, one becomes duplicate evidence, one DQ flag is created, and domain
   state is promoted once.
2. Retried sync push of the same response is idempotent and does not return a
   generic error.
3. A field worker cannot pull or push data outside assigned localities.
4. HHQ primary response creates household/member projections and WQ/HRF workflow
   tasks through the event pipeline.
5. WQ -> PEF -> PFF -> POF -> BAF -> NFF/CDF/VA workflow uses deterministic
   task keys and correct anchors.
6. NFF fractional month visits produce stable dates for 4.5m, 7.5m, and 10.5m.
7. VA tasks are visible but disabled while VA JSON is unavailable, and disabled
   tasks cannot be opened or closed through direct routes.
8. Failed attempts respect task-type limits and require final close reason
   rather than auto-closing.
9. Admin correction to DOB/sex/marital status recalculates eligibility and
   affected future tasks without changing raw form evidence.
10. Admin correction to household/member identity either rebuilds dependent IDs
    safely or holds the case for central review.
11. Projection rebuild for one household produces the same current state as
    incremental event application.
12. Pull sync does not overwrite newer unsynced local evidence.
13. The same shared event/reducer/workflow fixture suite passes in backend tests
    and Expo tests.
14. Expo local provisional workflow generation and backend authoritative
    workflow generation produce the same task keys for the same accepted event,
    projection snapshot, protocol config, and rules version.

## Prohibited Patterns

- Direct `form_response -> mutate many tables -> mark task completed` flows.
- Using `answers_json` as the only source for scope, identity, scheduling, or
  analysis.
- Generating pregnancy, child, event, or task identity with hidden random values
  when deterministic protocol identity exists.
- Using `new Date()` as a protocol anchor inside workflow generation.
- Emitting all future HRF, PFF, or NFF tasks as actionable work.
- Silently discarding duplicate offline completions.
- Updating completed history because rules changed later.
- Creating Android correction-request queues.
- Letting disabled VA tasks be opened through direct routes.
- Maintaining compatibility tables for abandoned schema designs in dev-only
  foundation work.
- Forking backend and Expo business rules for event classification, projection
  mutation, task lifecycle, or workflow generation.
- Letting Expo create admin correction, approval, central arbitration,
  user-management, role-management, or master-data mutation events.

## Short Version

The safe DYNAMIC foundation is:

```text
immutable evidence
  -> classified event
  -> household-scoped projection
  -> deterministic workflow decision
  -> scoped sync and admin review
```

Anything that bypasses that path is architectural debt and should not be added.
