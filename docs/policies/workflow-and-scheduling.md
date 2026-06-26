# Workflow And Scheduling Policy

This policy defines task generation, anchors, windows, and task lifecycle rules.

## Task Opening

Field users can open forms only from:

1. scheduled follow-up tasks
2. event-triggered immediate tasks
3. valid contextual trigger buttons that create an allowed opportunity

There is no global open-any-form workflow.

## Form Submission Triggers

Finalized form submissions can trigger cohort events. The trigger is shared kernel behavior in `@dynamic/event-core`; backend and Expo must not keep separate form-specific event builders for the same field-originated event.

The trigger receives:

- finalized response identity and timestamps
- raw `answers_json` evidence
- known cohort/task context, such as household, woman, pregnancy, or child ID

The trigger returns:

- canonical domain event envelope
- event-owned projection result when applicable
- deterministic task descriptors
- data-quality flags when applicable

Current trigger map:

| Form | Event owner | Event |
| --- | --- | --- |
| HHQ | `householdBaselineConfirmed` | `household_baseline_confirmed` |
| WQ | `wqCompleted` | `wq_completed` |
| PEF | `pregnancyEnrolled` | `pregnancy_enrolled` |
| PFF | `pregnancyFollowupCompleted` | `pregnancy_followup_completed` |
| POF | `pregnancyOutcomeRecorded` | `pregnancy_outcome_recorded` |
| BAF | `birthAssessmentCompleted` | `birth_assessment_completed` |
| CDF | `childDeathRecorded` | `child_death_recorded` |
| VA | `verbalAutopsyCompleted` | `verbal_autopsy_completed` |

Rules:

- One cohort event type has one owning event file under `packages/event-core/src/events/`.
- Form-specific field extraction for event payloads belongs in the shared form-submission trigger layer.
- Backend and Expo callers adapt storage only: response rows, event outbox/domain-event tables, projection tables, task tables, and sync status.
- Drafts never trigger events.
- Held or duplicate submissions may produce held events for evidence and data-quality review, but must not generate workflow tasks.
- Offline Expo promotion is provisional but must use the same shared trigger outputs as backend promotion.

## Deterministic Task Keys

Task keys must be deterministic:

```text
household_id|subject_type|subject_id|task_type|protocol_visit_label|target_date|rules_version
```

Rules:

- No hidden `new Date()` anchors inside workflow generation.
- No random task identity when deterministic protocol identity exists.
- Same accepted event plus same projection snapshot and rules version must produce the same task keys in backend and Expo.

## Anchors

| Series | Anchor |
| --- | --- |
| HRF | HHQ baseline completion date |
| WQ | HHQ roster eligibility event |
| PEF | WQ/HRF pregnancy detection event |
| PFF | PEF completion or accepted pregnancy enrollment date |
| UF | ultrasound availability event |
| POF | pregnancy outcome suspected/completed event |
| BAF | accepted birth outcome event |
| NFF | child birth date or accepted birth outcome date |
| CDF | child death detection/recorded event |
| VA | stillbirth or child death date + 30 days |

Late completion does not shift future anchors.

## Repeated Series

Repeated scheduled series use current-due behavior:

- HRF, PFF, and NFF complete the current due task only.
- Missed old rounds are preserved as missed/superseded/reportable.
- Do not backfill old rounds as if they happened on time.
- Do not emit a wall of future actionable tasks.
- Future planned tasks may exist for UI/context, but actionable work should be current due/next protocol-needed work.

## Windows

Each scheduled task stores:

```text
anchor_date
window_start
on_time_start
target_date
on_time_end
deadline_date
```

Rules:

- Windows for repeated series should be non-overlapping.
- A task deadline and the next task window start must be exclusive.
- `on_time_start` and `on_time_end` must sit inside the valid window.
- Window rules are protocol-versioned.

Current working rules:

- PFF monthly labels map to day offsets from enrollment, e.g. `M4 = Enrollment + 120d`.
- NFF labels map to day offsets from birth, including `4.5m = Birth + 135d`, `7.5m = Birth + 225d`, and `10.5m = Birth + 315d`.
- VA target is stillbirth/death date + 30d, with field opening disabled until VA JSON exists.

## Task Lifecycle

Allowed lifecycle concepts:

```text
planned
due
in_progress
completed_on_time
completed_late
missed
cancelled
superseded
closed_final_reason
disabled
```

Rules:

- Completing a task requires a primary accepted response or explicit close event allowed by task type.
- Duplicate task completions remain evidence and data-quality work; they do not complete the task again.
- Failed attempts increment by task attempt event.
- Failed-attempt limits are task-type rules.
- After the configured failed-attempt limit, ask for final close reason. Do not auto-close.
- Disabled tasks cannot be opened, completed, or closed by field users.

## Track End Events

Certain events end active tracks and cancel future uncompleted tasks:

- POF ends PFF for that pregnancy.
- Child death ends NFF and starts CDF/VA as applicable.
- Stillbirth starts SBF/VA as applicable.
- Woman death, permanent outmigration, hysterectomy, permanent ineligibility, or withdrawal ends woman pregnancy tracking.
- Completed history is preserved.
