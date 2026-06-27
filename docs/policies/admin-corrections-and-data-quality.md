# Admin Corrections And Data Quality Policy

This policy defines correction and data-quality boundaries.

## Correction Ownership

Admin corrections are backend/admin-originated only.

Expo must not originate:

- admin corrections
- approval or rejection events
- central arbitration
- user-management events
- role-management events
- master-data mutation events

Expo may display backend-originated correction/data-quality status when field users need context.

## Issues And Review Roles

Issues are not Tasks. They are review items that may appear beside Tasks in field or admin surfaces when users need to understand blocked work, sync problems, or data-quality conflicts.

Rules:

- Issues may be created automatically by backend ingest/classification or manually by authorized users.
- Issue source values are `system`, `field_worker`, `local_data_manager`, and `central_data_manager`.
- Issue source is immutable provenance. Escalation or reassignment changes status or assignment, not source.
- Manually created Issues must be typed and linked to the relevant area, household, person, Task, or Form Submission when known.
- Field-created Issues may be visible immediately offline on the creating device and sync later.
- Field-created Issues annotate local workflow by default. They block or disable workflow only when a system rule or backend/admin review applies a blocking decision.
- Issue types are centrally configured with only a name and short description. Field users may choose `Other, describe`, but they must not create arbitrary new Issue types.
- Local and Central Data Managers may change Issue Type with history. Field workers may edit Issue Type only for their own local unsynced Issues.
- Local and Central Data Managers may edit Issue title or description with history. Field workers may edit title or description only for their own local unsynced Issues.
- Field staff may link any Issue to a saved, drafted, synced, or submitted Form Submission when relevant.
- Local and Central Data Managers may add or remove linked Form Submissions with history. Field workers may add links, but must not remove synced links.
- Draft-linked Issues remain local field context until the draft becomes a Form Submission. Reviewers see the form link only after final submission or an explicit field-revisit workflow shares it.
- Field workers may see Issue status and effects in plain language.
- Field workers may add Issue comments when the Issue is visible to them or when completing a linked correction/revisit task.
- Local Data Managers propose resolutions for Issues in their assigned area and add supporting notes.
- Central Data Managers approve, reject, or return proposed resolutions to Local Data Managers.
- Resolution proposals are originated only in online admin/data-manager surfaces.
- Offline field app workflows must not originate Resolution Proposals, approval events, or Correction Events.

Issue comments are separate discussion records linked to an Issue. They store free-text discussion, evidence, or context with author, time, and source. They do not approve corrections and do not create workflow changes by themselves.

Issue comments must not be hard-deleted. The author may edit a comment for 20 minutes after creation. Later changes require a new comment or an admin redaction with reason.

Offline comment edits may use device time for the local 20-minute edit window. Sync must preserve device timestamps and server received timestamps for audit.

Resolution Proposals are structured review records. Their primary reviewer question should be plain language, such as:

```text
Which form should be used?
```

Resolution choices compare concrete Form Submissions, for example:

```text
Original HHQ submitted YYYY-MM-DD
Updated HHQ submitted YYYY-MM-DD
None of these forms
Other, describe
```

The system may derive linked outcomes such as accepted, superseded, duplicate, rejected, or field revisit requested from the approved choice. Reviewers should not have to choose from abstract technical classifications when comparing forms.

Resolution Proposals may include structured notes or rationale fields, but they do not have a separate comment thread. Discussion stays on the Issue comments.

Only one Resolution Proposal may be active for an Issue at a time. Local Data Managers may revise the active proposal with history before central review. Central Data Managers do not edit proposals; they approve, reject, or return proposals to the Local Data Manager. Rejection requires a reason and returns the Issue to local review unless Central explicitly closes it as no action. Returned Issues may receive a revised or new proposal.

Local Data Managers may propose closing an Issue with no action. Central Data Managers approve close-no-action proposals. Central Data Managers may close central-created or central-owned Issues with no action directly.

Issue assignment defaults from area and role. Local or Central Data Managers may explicitly assign an Issue to a person for accountability.

Issue priority is separate from status and assignment. Use only `normal` and `urgent` priorities unless the active policy is revised.

Field workers may mark their own manually created Issues as urgent. Local and Central Data Managers may change Issue priority. System-created urgent Issues require configured system rules.

Urgent Issues created offline notify the Local Data Manager only after sync. Offline UI may show that the urgent Issue is waiting to send.

Issue history is a first-class audit trail visible in admin. It should include status changes, Issue Type changes, title/description edits, assignment changes, priority changes, linked Form Submission changes, proposal revisions, central decisions, and recalculation outcomes.

Field workers see current Issue status, their own comments, system/status messages, relevant field-action history, and Local/Central decision outcomes that affect field work. Manager comments are hidden from field staff. Full Issue audit history is for admin/data-manager surfaces.

Local and Central Data Managers share manager comments and full Issue audit history within their permitted scope.

## Issue Views

Field, Local Data Manager, and Central Data Manager surfaces may offer both household-first and issue-type-first views over the same Issues. Permissions control actions, not whether the user can use a view.

Issue View filters should use consistent labels:

- Area
- Household
- Person
- Issue type
- Issue status
- Form
- Form status
- Has open issues
- Source
- Created by
- Assigned to
- Priority
- Submitted between
- Last changed
- Sync status

Issue View sort options should include:

- Newest first
- Oldest first
- Last changed
- Household
- Issue type
- Issue status
- Assigned to
- Priority

Urgent is available as a filter and sort option. Do not force a priority-first default sort unless this policy is revised.

## Raw Evidence

Corrections do not edit raw submitted evidence.

Rules:

- Original finalized form responses remain immutable.
- All Form Submissions remain preserved, including original, updated, duplicate, superseded, rejected, and field-revisit-requested submissions.
- Corrections append correction events with actor, reason, review state, source reference, and either value-level changes or accepted Form Submission references.
- Approved corrections update typed projections.
- Corrections that affect future work recalculate future uncompleted tasks.
- Completed history is preserved.

## Form Submission Review

Form Submission Status is separate from the open Issue flag/count.

Reviewer/admin Form Submission statuses:

- `under_review`
- `accepted`
- `superseded`
- `duplicate`
- `rejected`
- `field_revisit_requested`

Rules:

- `has open issues` is a flag or count, not a Form Submission Status.
- A Form Submission can have open Issues while it is under review, rejected, field-revisit-requested, superseded, or accepted.
- `accepted` means the Form Submission is used for current authoritative projections and workflow.
- `superseded` means the Form Submission remains preserved but another related Form Submission is accepted for current projections and workflow.
- `duplicate` means the Form Submission repeats already accepted work and does not change projected state.
- `rejected` means the Form Submission must not drive workflow or projected state.
- `field_revisit_requested` means field action is needed before the Issue can be resolved.

Submission Comparison should be generated on demand from related Form Submissions and current rules.

Comparison must show:

- question and choice labels rather than raw field names
- source variable IDs only in technical/detail views
- changed answer values
- added or removed repeat-group rows
- changed derived eligibility, outcome, or routing values
- changed workflow impact in plain language
- reviewer comments separately from answer changes

Repeat-group comparison must match rows by stable ID when present. If ID is missing, use age and sex as required matching cues, show name or relation when available, and mark uncertain matches instead of silently auto-matching them.

Approved Resolutions should store a compact human-readable comparison summary for audit. The full Submission Comparison can still be regenerated on demand from preserved Form Submissions and current rules.

## Correction Events And Recalculation

Approved Resolutions become authoritative through backend/admin events.

Rules:

- If an Approved Resolution accepts a Form Submission that changes projected state or workflow, create a Correction Event.
- Correction Events are based on the accepted Form Submission plus the Approved Resolution.
- Correction Events are not created from Issue comments alone.
- Correction Events are backend/admin-originated only.
- Correction Events update typed projections and recalculate affected current and future uncompleted Tasks.
- If recalculation fails or creates a new conflict, create or update an Issue instead of silently leaving projections stale.
- If approval does not change the currently accepted Form Submission or workflow state, it may close the Issue without creating a Correction Event.

After sync, field Task Worklists collapse to the authoritative current Tasks. Superseded or withdrawn provisional work remains available through Form Submission, Issue, and event history, but should not remain actionable as current field work.

## Field Revisit And Correction/Revisit Tasks

When an Approved Resolution requests a field revisit, create a new correction/revisit Task linked to the Issue and relevant Form Submissions.

Rules:

- Do not reopen the old protocol Task.
- Correction/revisit Tasks appear in the same Task Worklist as protocol work.
- Correction/revisit Tasks must be clearly labeled as correction or revisit work.
- Completion creates a new Form Submission linked to the Issue.
- Completing a correction/revisit Task does not automatically supersede an older Form Submission.
- If the Issue has a Local Data Manager assigned, the returned Form Submission goes back to local review before central approval.
- Centrally managed Issues may return directly to central review.
- Correction/revisit Form Submissions do not create Correction Events offline.
- Ordinary protocol Form Submissions may still create Provisional Events for offline continuity.

## Recalculation Triggers

Corrections require downstream recalculation or central review when they affect:

- `site_id`
- `locality_code`
- `structure_map_id`
- `household_number`
- `member_number`
- sex
- date of birth / age
- marital status
- household membership/residency
- pregnancy status
- LMP / dating / expected delivery fields
- birth outcome
- stillbirth
- child death
- any field used for eligibility, routing, task generation, or schedule anchors

Identity-key corrections must either rebuild dependent IDs transactionally or hold the case for central review. They must not orphan dependent rows.

## Duplicate Evidence

Offline duplicate task completions are valid evidence.

Rules:

- First valid task completion is primary.
- Later valid completions for the same task are preserved as duplicate evidence.
- Duplicate completions do not re-promote domain state automatically.
- Duplicate completions create data-quality flags for review.

## Data-Quality Flags

Create data-quality flags for:

- duplicate task completions
- scope conflicts
- impossible identity changes
- conflicting pregnancy/birth/child outcomes
- correction effects that need central review
- backend/Expo classification mismatch after sync

Flags must link to the relevant household, subject, task, primary response, duplicate/held response, event, and review state where available.
