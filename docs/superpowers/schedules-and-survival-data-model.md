# DYNAMIC - PreTESTING - Schedules And Survival Data Model

Status: accepted working model

This file documents the minimal data model for scheduled follow-up work, observed subject events, and survival-analysis datasets.

## Core Principle

Keep the model simple and separate the jobs:

```text
schedule_rules       = protocol says when work should happen
schedule_tracks      = one longitudinal follow-up series
scheduled_events     = concrete expected visits/forms
form_submissions     = raw submitted form evidence
observed_events      = typed facts extracted from submissions
analysis_risk_periods = wide survival-analysis rows
```

Do not use JSONB fields for transactional analysis, scheduling, reporting, or survival analysis.

`answers_json` may be stored in `form_submissions` as immutable raw evidence only. Anything needed for workflow or analysis must be promoted into typed relational tables.

## Subjects

These are the real entities followed over time:

```text
households
household_members
eligible_women
pregnancies
birth_outcomes
children
```

Each schedule, observed event, and analysis row links back to one of these subjects.

## Form Submissions

Form submissions are immutable evidence.

```text
form_submissions
  form_submission_id
  form_code
  submitted_at
  submitted_by
  scheduled_event_id
  answers_json
```

Rules:

- `answers_json` is not edited after submission.
- `answers_json` is not used as the transactional source of truth.
- Typed values needed for workflow are promoted into domain tables or `observed_events`.
- Once a scheduled event is completed, the submission ID is linked back to the scheduled event.

```text
scheduled_events.completed_form_submission_id = form_submission_id
scheduled_events.completed_at = submitted_at
scheduled_events.status = completed
```

## Schedule Rules

Schedule rules store protocol timing rules.

```text
schedule_rules
  rule_id
  event_type
  protocol_visit_label
  sequence_number
  anchor_type
  target_offset_days
  window_start_offset_days
  on_time_start_offset_days
  on_time_end_offset_days
  deadline_offset_days
  default_form_code
  active_from
  active_to
```

Examples of `event_type`:

```text
HRF
WPT
PFF
NFF
VA
```

`WPT` means woman pregnancy-tracking schedule. In the current forms summary, this is operationally covered through HRF. If a separate NPTF form is formally added later, the schedule track can stay the same and the expected form can change.

Rules:

- Rules explain why a scheduled event exists.
- Rule changes can update only future, uncompleted scheduled events.
- Completed scheduled events are not recalculated after rule changes.

## Schedule Tracks

A schedule track is one longitudinal follow-up series for one subject.

```text
schedule_tracks
  track_id
  track_type
  subject_type
  subject_id
  anchor_event_id
  anchor_date
  status
  ended_by_event_id
  ended_at
  end_reason
```

Examples:

| Track type | Subject | Anchor |
| --- | --- | --- |
| `household_round` | household | HHQ completion |
| `woman_pregnancy_tracking` | eligible woman | WQ/eligibility confirmation |
| `pregnancy_followup` | pregnancy | PEF/pregnancy enrollment |
| `newborn_followup` | child | birth outcome / child record |
| `verbal_autopsy` | birth outcome or child | stillbirth or child death |

Rules:

- One subject may have more than one track over time.
- A pregnancy can have one PFF track.
- A child can have one NFF track.
- A woman can return to woman pregnancy tracking after a pregnancy closes if she remains eligible.

## Scheduled Events

Scheduled events are the concrete expected visits or forms in a track.

```text
scheduled_events
  scheduled_event_id
  track_id
  rule_id
  subject_type
  subject_id
  event_type
  protocol_visit_label
  sequence_number
  window_start
  on_time_start
  target_date
  on_time_end
  deadline_date
  status
  completed_form_submission_id
  completed_at
  cancelled_by_event_id
  cancelled_at
  cancellation_reason
```

Status values:

```text
scheduled
completed
missed
cancelled
```

Rules:

- `scheduled_events` is the operational worklist.
- Forms open from scheduled events.
- Each scheduled event can have one primary completed form submission.
- Duplicate offline submissions are preserved as form submissions but do not overwrite `completed_form_submission_id`.
- Future, uncompleted scheduled events can be updated when rules change.
- Completed events are preserved as completed history.

## Track End Events

Certain observed events end a schedule track and cancel future uncompleted scheduled events in that track.

Examples:

| Track | End event | Effect |
| --- | --- | --- |
| PFF | Pregnancy outcome / POF | Cancel future PFF events for that pregnancy. |
| NFF | Child death / CDF | Cancel future NFF events for that child and create VA. |
| Woman pregnancy tracking | death, permanent outmigration, hysterectomy, permanent ineligibility, withdrawal | Cancel future woman-tracking events. |
| HRF | household withdrawal or study end, if protocol allows | Cancel future HRF events. |

Rules:

- Completed events are not cancelled.
- Cancelled events remain in the table for audit and reporting.
- If an end event starts another track, create the new track separately.
- Example: POF ends PFF and may start NFF, SBF, CDF, or VA workflows depending on outcome.

## Observed Events

Observed events are typed facts extracted from submitted forms and approved corrections.

```text
observed_events
  event_id
  subject_type
  subject_id
  event_type
  event_date
  source_form_submission_id
  source_scheduled_event_id
  source_correction_event_id
  created_at
```

Examples:

```text
household_enrolled
hrf_completed
woman_became_eligible
woman_deceased
woman_permanent_outmigration
pregnancy_detected
pregnancy_enrolled
pregnancy_outcome_recorded
birth_outcome_recorded
child_death_recorded
verbal_autopsy_due
```

Why this table is separate from `scheduled_events`:

- One scheduled event can create many observed facts.
- Example: one HRF submission may complete the household round, identify a new eligible woman, record permanent outmigration for another woman, and detect pregnancy in another woman.
- Survival analysis needs subject-level facts, not just worklist completion.

Rules:

- Do not store workflow facts only inside `answers_json`.
- If an event needs structured values beyond type and date, use typed domain columns or a dedicated typed table.
- Do not use JSONB blobs for event values needed in scheduling, reporting, or analysis.

## Woman Pregnancy-Tracking Track

The forms summary table defines HRF as the bi-monthly form used to detect new pregnancies and identify new eligible women. It also says HRF may be combined with PFF and/or NFF when relevant.

Therefore, separate the schedule track from the current form:

```text
track_type = woman_pregnancy_tracking
event_type = WPT
current expected form = HRF
future expected form = NPTF, only if formally added
```

Women eligible for pregnancy tracking need close-out information, including:

```text
alive/dead status
permanent outmigration
hysterectomy
sterilisation
marital status changes
pregnancy status
LMP where appropriate
```

Vital status and permanent outmigration can be captured in HRF because any adult household respondent may know them. LMP, hysterectomy, sterilisation, and similar woman-specific details are better captured in woman-level tracking forms when available and appropriate.

## Analysis Risk Periods

`analysis_risk_periods` is a derived wide table for survival analysis.

It should be built from domain records and `observed_events`, not by repeatedly parsing raw form JSON.

```text
analysis_risk_periods
  risk_period_id
  analysis_type
  subject_type
  subject_id
  household_id
  woman_id
  pregnancy_tracking_id
  pregnancy_id
  birth_outcome_id
  child_id
  time_origin_date
  risk_start_date
  risk_start_type
  risk_start_event_id
  risk_end_date
  risk_end_type
  risk_end_event_type
  risk_end_event_id
  event_observed
  failure_type
  censoring_reason
  start_time_days
  end_time_days
  duration_days
  built_at
  source_rules_version
```

`time_origin_date` is the analysis zero point.

`risk_start_date` is when the subject enters the risk set.

If `risk_start_date` is after `time_origin_date`, this represents delayed entry / left truncation.

`risk_end_type` distinguishes:

```text
failure
right_censored
competing_event
lost_to_followup
administrative_censoring
```

## Key Analysis Units

### Household-Wise

Examples of timepoints:

```text
household_mapped
household_enrolled
hrf_completed
household_withdrawn
study_end_censor
```

### Woman-Wise

Examples of timepoints:

```text
woman_roster_entry
wq_eligible_date
wq_completed
marital_status_change
sterilisation
hysterectomy
death
permanent_outmigration
study_end_censor
```

### Eligible-For-Pregnancy-Tracking-Wise

Examples of timepoints:

```text
pregnancy_tracking_entry_date
tracking_round_completed
pregnancy_detected
temporarily_not_eligible
permanently_not_eligible
death
permanent_outmigration
tracking_closed
study_end_censor
```

### Pregnancy-Wise

Examples of timepoints:

```text
pregnancy_detected
pregnancy_enrolled
first_usg_date
pff_completed
pregnancy_outcome_date
pregnancy_closed
```

### Birth / Child-Wise

Examples of timepoints:

```text
birth_outcome_date
birth_assessment_completed
stillbirth_recorded
live_birth_recorded
nff_completed
child_death_date
va_due_date
va_completed
child_followup_closed
study_end_censor
```

## Minimal Flow

```text
Schedule rule -> Schedule track -> Scheduled events
Scheduled event -> Form submission
Form submission -> Observed events
Observed events -> Cancel/create future scheduled events
Observed events -> Analysis risk periods
```

This keeps the operational app understandable while preserving the data needed for classical survival analysis.
