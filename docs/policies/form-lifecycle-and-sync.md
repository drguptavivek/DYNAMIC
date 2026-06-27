# Form Lifecycle And Sync Policy

This policy defines how SurveyJS forms become evidence and how Expo reconciles with the backend.

## Drafts

Drafts are local recovery state.

- Drafts are overwriteable.
- Drafts stay local.
- Drafts do not sync.
- Drafts do not create events.
- Drafts do not update projections.
- Drafts do not create or complete tasks.
- Drafts never win against finalized evidence.

Opening preview may save a draft, but preview is not evidence.

## Finalized Responses

Final confirmation creates one immutable local form response.

Required metadata:

```text
response_id
form_code
form_version
task_id / task_key when task-backed
subject_type
subject_id
household_id
site_id
locality_code
answers_json
device_id
user_id
device_submitted_at
device_sequence
sync_status
```

Rules:

- Finalized responses are immutable evidence.
- Finalized responses can be locally promoted for offline continuity.
- Local promotion records provenance back to the response.
- The generic form route and task-opened route for a form must use the same finalization path.

## Local Expo Promotion

Expo may derive provisional local state from finalized evidence:

- households and members from accepted HHQ finalization
- eligible women and WQ tasks from HHQ roster rules
- pregnancy and follow-up tasks from PEF/PFF/POF paths
- provisional domain events in the outbox
- task state needed for offline worklists

Local projections are provisional until backend confirmation.

Correction/revisit form submissions are different from ordinary protocol submissions. They are still Form Submissions, but they stay linked to their Issue until backend/admin review. They do not create Correction Events offline and do not rewrite local authoritative workflow before central approval.

## Push

Push sends evidence and event records:

- finalized form responses
- task attempts
- provisional domain events
- provisional task lifecycle events
- contextual opportunity events when present

Push does not use arbitrary local projection table edits as the source of truth.

Backend ingest must:

1. authenticate user
2. enforce role and area scope
3. validate idempotency
4. store immutable evidence
5. classify primary / duplicate / invalid / held
6. append accepted events
7. apply projections and workflow decisions
8. write data-quality flags when needed
9. commit atomically per accepted record

## Classification

| Classification | Meaning |
| --- | --- |
| `primary` | First valid completion for a task or valid contextual opportunity. Promotes state. |
| `duplicate_task_completion` | Later valid completion for an already completed task. Preserved as evidence, does not auto-promote. |
| `invalid_rejected` | Fails scope, structure, protocol, or form-version validation. Does not promote. |
| `held_for_review` | Conflicts with current state or needs admin review. Does not silently disappear. |

Held, rejected, duplicate, or conflicting submissions that need human handling create or update Issues. Issue resolution rules live in [Admin corrections and data quality](admin-corrections-and-data-quality.md).

## Pull Reconciliation

Backend is authoritative after sync.

Rules:

- Pull must not overwrite newer unsynced local evidence.
- If backend confirms the same response, local provisional rows become synced/accepted.
- If backend has newer accepted evidence or approved correction, backend projection can replace local projection.
- If local has newer unsynced finalized evidence, keep it active for offline routing until sync resolves.
- Reconcile by stable response IDs, task keys, event IDs, server commit sequence, and provenance.
- After sync, local Task Worklists collapse to the authoritative current Tasks. Superseded or withdrawn provisional work remains visible through Form Submission, Issue, and event history rather than as actionable current work.

## Time

- Protocol dates are `YYYY-MM-DD` calendar dates.
- Do not convert protocol dates to UTC instants.
- Device wall-clock time is audit/fallback metadata, not the only ordering authority.
- Device ordering uses `device_sequence` locally.
- Server ordering uses `server_commit_sequence` after sync.
