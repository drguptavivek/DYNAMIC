# Form Drafts And Autosave Policy

This policy is canonical even where implementation still lags. Code should move toward this behavior.

## Core Rule

Drafts are mutable recovery state, saved locally first and optionally backed up to the server. Submitted form responses are immutable evidence. Do not store drafts as submitted responses with a draft status.

## Draft Scope

A draft can exist only for:

- a valid scheduled task
- a valid contextual trigger
- an allowed baseline form entry point such as HHQ enrollment from the mapped frame

There is no global open-any-form draft workflow.

## Draft Identity

Resume the latest active draft for the same workflow context:

```text
form_code
form_version
task_id
subject_type
subject_id
user_id
```

`device_id` is retained as provenance but is not part of the cross-device recovery identity. The same user's latest draft for one workflow context must converge across registered devices.

Draft fields should include:

```text
draft_id
draft_key
form_code
form_version
task_id
subject_type
subject_id
household_id
site_id
locality_code
prefill_snapshot_json
answers_json
completion_state_json
validation_state_json
draft_status
created_at
updated_at
submitted_form_response_id
```

Allowed draft statuses:

```text
active
submitted
discarded
superseded
```

## Autosave

Rules:

- Autosave writes locally every 30 seconds only when the form has unsaved changes.
- Manual Save Draft writes locally immediately.
- Form navigation actions save the current local draft after the destination section/page has been resolved.
- App backgrounding, navigation away, or form close should save dirty drafts before leaving.
- Failed local draft save must be visible to the field user.
- Sync uploads local active and terminal draft states through the dedicated draft channel.
- Sync returns only active drafts owned by the authenticated user and within that user's current area scope.
- Server-backed drafts remain mutable recovery data and must never enter finalized-response processing.
- Admin review/edit workflows operate on submitted responses, not active field drafts.

## Resume

When reopening a form:

1. Resolve task/context and prefill snapshot.
2. Load the latest active local or previously synced draft for that context when present.
3. Restore `answers_json`.
4. Restore the last active section/page when `completion_state_json` has it.
5. Recompute progress/validation from the current SurveyJS model.

If another device has already completed the same task and that completion syncs back, any local active draft for that task should be shown as superseded rather than silently reused.

Conflict rule: compare client `updated_at` values and keep the newest draft. A pulled server copy must not overwrite a newer local copy. Finalized evidence always wins over any active draft.

## Finalization

Final submission must:

1. force-save the latest draft payload
2. pass the preview/final-submit gate
3. run required validation
4. create one immutable form response
5. generate local evidence/events/tasks allowed by policy
6. mark the draft `submitted`
7. link `submitted_form_response_id`

Drafts never complete tasks, generate events, or update projections before finalization.
