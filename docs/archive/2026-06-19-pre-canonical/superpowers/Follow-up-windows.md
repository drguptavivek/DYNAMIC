# DYNAMIC - PreTESTING - Follow-Up Windows

Status: working draft

This file consolidates follow-up timing and visit-window rules from:

- `docs/superpowers/specs/2026-06-03-dynamic-fullstack-offline-architecture-design.md`
- `docs/superpowers/2026-06-05-discussions.md`

It defines how scheduled follow-up tasks are dated, classified, and opened for field completion. PFF and NFF target dates are expressed as day offsets from the anchor event so that windows are deterministic.

## Core Concepts

Every scheduled task stores the following dates:

| Field | Meaning |
| --- | --- |
| `anchor_date` | Date from which the task schedule is calculated. |
| `window_start` | First date when the task can validly be completed. |
| `on_time_start` | First date when the task is considered on time. |
| `target_date` | Expected/due date for the visit. |
| `on_time_end` | Last date when the task is considered on time. |
| `deadline_date` | Last date in the valid completion window. |

The task window is divided into:

| Category | Rule |
| --- | --- |
| `early` | `window_start` through the day before `on_time_start`. |
| `ontime` | `on_time_start` through `on_time_end`. |
| `late` | The day after `on_time_end` through `deadline_date`. |

Operational states:

| State | Rule |
| --- | --- |
| `planned` | Before `window_start`. |
| `upcoming` | From `window_start` to the day before `on_time_start`. |
| `due` | From `on_time_start` through `target_date`. |
| `overdue` | After `target_date` through `on_time_end`. |
| `late` | After `on_time_end` through `deadline_date`. |

After `deadline_date`, the task is outside the valid completion window. Final handling then follows missed/disposition rules.

## Boundary Rules

- A task's `deadline_date` and the next task's `window_start` must be exclusive.
- If one visit's `deadline_date` is day 45, the next visit's `window_start` is day 46.
- Repeated follow-up windows should be non-overlapping.
- NFF windows should be continuous after the first opened NFF window unless protocol explicitly defines otherwise.
- `on_time_start` and `on_time_end` must sit inside the valid window.
- Task-window rules are global by form/task type and protocol version. They are not site-specific.

## Protocol Config Requirements

The protocol config should support:

| Config concept | Requirement |
| --- | --- |
| Target offset | Offset from anchor date to target date. |
| Window start offset | Offset from anchor date or target date to first valid date. |
| On-time start offset | Offset from anchor date or target date to first on-time date. |
| On-time end offset | Offset from anchor date or target date to last on-time date. |
| Deadline offset | Offset from anchor date or target date to last valid date. |
| Versioning | Rules must have active-from / active-to dates. |

## HRF - Household Rounds Form

HRF is household-relative and anchored to baseline HHQ completion.

| Visit | Target date |
| --- | --- |
| HRF round 1 | Baseline HHQ completion + 2 calendar months |
| HRF round 2 | Baseline HHQ completion + 4 calendar months |
| HRF round 3 | Baseline HHQ completion + 6 calendar months |
| Later HRF | Continue until study end |

Rules:

- Late HRF completion does not shift future HRF rounds.
- If an HRF is missed completely, the next household contact completes the current due round, not the missed round.
- Older expired HRF rounds are marked missed and preserved for reporting.
- HRF visit-window offsets still need protocol confirmation.

## PFF - Pregnancy Follow-Up Form

PFF is pregnancy-relative and anchored to PEF completion / pregnancy enrollment date.

For scheduling, PFF monthly labels are converted to day-based estimates from enrollment. Example: `PFF M4 = Enrollment + 120d`.

Rules:

- Late PFF completion does not shift future PFF dates.
- When POF is completed, all future planned PFF tasks for that pregnancy are superseded.
- If one monthly PFF is missed, the next visit completes the current due PFF only, not the missed one.
- PFF mode is flexible. The app should show previous visit mode and document the current actual mode.
- Proposed on-time window is `target - 7d` through `target + 7d`.
- Proposed deadline is `target + 15d`.
- For M1, `window_start = target - 15d`.
- For M2 and later, `window_start = previous deadline + 1d` to keep adjacent windows exclusive and non-overlapping.

| PFF visit | Target date | Window start | On-time start | On-time end | Deadline date | Categories | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PFF M1 | Enrollment + 30d | Enrollment + 15d | Enrollment + 23d | Enrollment + 37d | Enrollment + 45d | early, ontime, late | Proposed |
| PFF M2 | Enrollment + 60d | Enrollment + 46d | Enrollment + 53d | Enrollment + 67d | Enrollment + 75d | early, ontime, late | Proposed |
| PFF M3 | Enrollment + 90d | Enrollment + 76d | Enrollment + 83d | Enrollment + 97d | Enrollment + 105d | early, ontime, late | Proposed |
| PFF M4 | Enrollment + 120d | Enrollment + 106d | Enrollment + 113d | Enrollment + 127d | Enrollment + 135d | early, ontime, late | Proposed |
| PFF M5 | Enrollment + 150d | Enrollment + 136d | Enrollment + 143d | Enrollment + 157d | Enrollment + 165d | early, ontime, late | Proposed |
| PFF M6 | Enrollment + 180d | Enrollment + 166d | Enrollment + 173d | Enrollment + 187d | Enrollment + 195d | early, ontime, late | Proposed |
| PFF M7 | Enrollment + 210d | Enrollment + 196d | Enrollment + 203d | Enrollment + 217d | Enrollment + 225d | early, ontime, late | Proposed |
| PFF M8 | Enrollment + 240d | Enrollment + 226d | Enrollment + 233d | Enrollment + 247d | Enrollment + 255d | early, ontime, late | Proposed |
| PFF M9 | Enrollment + 270d | Enrollment + 256d | Enrollment + 263d | Enrollment + 277d | Enrollment + 285d | early, ontime, late | Proposed |

## NFF - Newborn Follow-Up Form

NFF is child-relative and anchored to birth date.

For scheduling, NFF protocol labels are converted to day-based estimates from birth. Example: `4.5m = Birth + 135d`.

NFF task records should store both:

- `sequence_number`
- `protocol_visit_label`

Mode rules:

| Visit labels | Default mode |
| --- | --- |
| 7d, 28d, 2m, 3m, 6m, 9m, 12m | Face-to-face |
| 4.5m, 7.5m, 10.5m, 14m, 16m, 18m and later | Telephonic |

Telephonic is allowed for a default face-to-face NFF if mother/child is outside the study area. The app records actual mode and whether an exception applies.

NFF-specific rules:

- No NFF window can start before birth.
- The 7d visit has a short early window; do not use `7d - 15d`.
- Early NFF windows use explicit transition dates.
- Current early transition rule: 7d window ends day 14; 28d starts day 15 and ends day 35; 2m starts day 36.
- From 2m onward, proposed on-time window is `target - 7d` through `target + 7d`.

| NFF visit | Target date | Window start | On-time start | On-time end | Deadline date | Default mode | Categories | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7d | Birth + 7d | Birth + 5d | Birth + 5d | Birth + 9d | Birth + 14d | Face-to-face | ontime, late | Proposed |
| 28d | Birth + 28d | Birth + 15d | Birth + 25d | Birth + 31d | Birth + 35d | Face-to-face | early, ontime, late | Proposed |
| 2m | Birth + 60d | Birth + 36d | Birth + 53d | Birth + 67d | Birth + 75d | Face-to-face | early, ontime, late | Proposed |
| 3m | Birth + 90d | Birth + 76d | Birth + 83d | Birth + 97d | Birth + 112d | Face-to-face | early, ontime, late | Proposed |
| 4.5m | Birth + 135d | Birth + 113d | Birth + 128d | Birth + 142d | Birth + 157d | Telephonic | early, ontime, late | Proposed |
| 6m | Birth + 180d | Birth + 158d | Birth + 173d | Birth + 187d | Birth + 202d | Face-to-face | early, ontime, late | Proposed |
| 7.5m | Birth + 225d | Birth + 203d | Birth + 218d | Birth + 232d | Birth + 247d | Telephonic | early, ontime, late | Proposed |
| 9m | Birth + 270d | Birth + 248d | Birth + 263d | Birth + 277d | Birth + 292d | Face-to-face | early, ontime, late | Proposed |
| 10.5m | Birth + 315d | Birth + 293d | Birth + 308d | Birth + 322d | Birth + 337d | Telephonic | early, ontime, late | Proposed |
| 12m | Birth + 360d | Birth + 338d | Birth + 353d | Birth + 367d | Birth + 390d | Face-to-face | early, ontime, late | Proposed |
| 14m | Birth + 420d | Birth + 391d | Birth + 413d | Birth + 427d | Birth + 450d | Telephonic | early, ontime, late | Proposed |
| 16m | Birth + 480d | Birth + 451d | Birth + 473d | Birth + 487d | Birth + 510d | Telephonic | early, ontime, late | Proposed |
| 18m, 20m, 22m, ... | Continue every 60d until study end | Previous deadline + 1d | Target - 7d | Target + 7d | Target + 30d | Telephonic | early, ontime, late | Proposed |

## VA - Verbal Autopsy

VA is generated after stillbirth or child death.

| Field | Rule |
| --- | --- |
| `target_date` | Stillbirth/death event date + 30d |
| `window_start` | `target_date - 3d` |
| `deadline_date` | `target_date + 14d` |

VA task generation is active now. VA form opening remains disabled until VA SurveyJS JSON is available.

## Repeated-Series Missed Rule

For repeated scheduled series:

```text
complete the current due task only
do not backfill missed scheduled tasks
```

Applies to:

- HRF
- PFF
- NFF

Before opening a repeated-series task, the app should:

1. Mark expired older tasks as missed if appropriate.
2. Select the current due, overdue, or late task.
3. Open the expected form for that task.
4. Preserve missed tasks for reporting.

## Open Decisions

| Decision | Needed output |
| --- | --- |
| HRF visit windows | Confirm HRF `window_start`, `on_time_start`, `on_time_end`, and `deadline_date` rules. |
| PFF proposed windows | Confirm day-based PFF M1-M9 windows and whether the same rule continues beyond M9 if pregnancy remains active. |
| NFF early windows | Confirm 7d, 28d, and 2m windows and on-time bands. |
| NFF later windows | Confirm 3m onward windows and whether 18m+ uses repeated 60d target and `target + 30d` deadline. |
| Missed definition | Confirm whether missed is assigned at `deadline_date + 1`, at next task opening, or only after explicit disposition. |
| Reporting date basis | Decide whether due/completed/missed reports use target date, window start, deadline, completion date, or mixed definitions. |
