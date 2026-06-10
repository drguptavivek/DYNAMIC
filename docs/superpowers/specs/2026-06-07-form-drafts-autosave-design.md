# Form Drafts And Autosave Design

Date: 2026-06-07

Status: approved design, revised for local-only drafts

## Purpose

DYNAMIC - PreTESTING needs a form-draft workflow that is independent of the final questionnaire PDFs. Field Data Collectors must be able to leave a partially completed form, explicitly save it, and return later without losing work. The app must also autosave partial entries every 30 seconds.

This is a cross-cutting workflow for Expo Android and the main backend/admin app. It must not depend on form-specific fields except through the current SurveyJS answers payload and prefill snapshot.

## Design Decision

Drafts are stored in a separate local `form_drafts` model on the field device.

Do not store drafts as `form_responses` with `response_status = draft`. A submitted form response is immutable evidence. A draft is mutable working state. Keeping them separate protects analysis, duplicate-submission handling, admin review, and downstream task generation.

## Core Rules

- A draft can exist only for a valid task or valid contextual trigger that is allowed to open a form.
- There is no global open-any-form draft workflow.
- Autosave writes locally every 30 seconds only when the form has unsaved changes.
- Save Draft writes locally immediately.
- The field app also saves on app backgrounding, navigation away from the form, and form close when there are unsaved changes.
- Drafts are not uploaded or synced to the server.
- A draft never completes a task, never generates domain events, and never updates normalized domain state.
- The field user can open Preview anytime from the current saved draft.
- The field user must preview the saved draft before finalizing it.
- Only finalized forms are uploaded.
- Finalize/Submit creates an immutable `form_response`, generates domain events, applies local workflow rules, writes the normal outbox records, and marks the local draft as submitted.
- Submitted form responses remain immutable. Drafts may be overwritten until submitted, discarded, or superseded.

## Draft Identity

Each draft has a stable `form_draft_id` generated on the device when the draft is first created.

The app resumes the latest active draft for the same local workflow context:

- `task_id`
- `form_code`
- `form_version`
- `subject_type`
- `subject_id`
- `device_id`
- `created_by_user_id`

The backend does not store active drafts. If different devices independently open the same task offline, each device may have its own local draft. These are not duplicate task completions because they are not submitted evidence. When a finalized form for the task syncs back to other devices, any remaining local active draft for that task should be shown as superseded.

## Draft Fields

Minimum fields:

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

`answers_json` can contain partial answers. `completion_state_json` can store SurveyJS page/progress state, including the last active section/page for the Side Navigation / Table of Contents, when useful for resuming the user experience. It is not an analysis source.

## Expo Android Behavior

When a form opens:

1. Resolve task context and prefill snapshot.
2. Look for the latest active local draft for the same workflow context.
3. If found, load `answers_json` into SurveyJS and retain the original prefill snapshot used for the draft.
4. If found and `completion_state_json` contains a last active section/page, restore that section.
5. If not found, create a new draft shell with prefill values and empty answers.

During form entry:

- Track dirty state after any answer change.
- Autosave every 30 seconds if dirty.
- Manual Save Draft saves immediately and clears dirty state.
- Preview is available anytime and first saves the current draft.
- Show local last-saved status.
- Preserve current section/page in `completion_state_json` when the section changes.
- Save before app backgrounding or form close if dirty.
- Failed local save must be visible to the field user and must not pretend the draft is safe.

Preview behavior:

1. Force-save the latest draft data.
2. Open a Preview screen generated from the saved local draft.
3. Allow the field user to go back to the form from Preview to correct entries.
4. Allow Preview even when the draft is incomplete, but clearly show incomplete or invalid sections.

Before finalization:

1. Force-save the latest draft data.
2. Open or return to Preview from the saved local draft.
3. Enable Finalize/Submit only after Preview has been shown and required validation passes.

On Finalize/Submit:

1. Force-save the latest draft data.
2. Run required SurveyJS validation.
3. Create the immutable form response.
4. Generate domain events and task changes.
5. Mark the task completed or otherwise apply the task completion rule.
6. Mark the draft as `submitted` and link `submitted_form_response_id`.
7. Write the finalized form response and derived records to the local outbox for upload.

## Main Backend/Admin Behavior

The backend stores finalized form responses and derived records only. It does not store active field drafts.

Required API behavior:

- Sync push accepts finalized form responses, domain events, generated tasks, task attempts, and visit records.
- Sync push does not accept active draft upserts.
- Sync pull does not return active drafts.
- Admin review/edit workflows apply only to submitted form responses, not drafts.
- Progress indicators count finalized/submitted forms only.
- Data-quality issue flags attach to submitted form responses only.

## Sync Behavior

The Expo outbox includes:

- finalized form responses
- domain events
- generated tasks
- task attempts
- visit records

Backend merge rules:

1. Accept immutable finalized form responses.
2. Deduplicate retried uploads by response ID/idempotency key.
3. Apply valid domain events.
4. Replay workflow rules.
5. Merge generated tasks by `task_key`.
6. Merge task attempts by `attempt_id`.
7. Detect duplicate task completions.
8. Return updated domain/task state for assigned areas.

## Testing

Required tests:

- Autosave writes after 30 seconds only when dirty.
- Manual Save Draft writes immediately.
- Preview can open anytime from the saved local draft.
- Preview is required again after changes made following a previous preview.
- Closing or backgrounding a dirty form saves before leaving.
- Reopening the same task resumes the active draft.
- Finalize/Submit is available only after Preview and required validation.
- Final submission creates an uploadable form response and closes the local draft.
- Drafts are not present in sync push or pull payloads.
- Submitted-response indicators count finalized forms only.
- Admin submission review excludes drafts by default.

## Non-Goals

- Drafts are not analysis records.
- Drafts do not change household, woman, pregnancy, child, or task domain state.
- Drafts do not trigger follow-up scheduling.
- Drafts do not create admin correction requests.
- Drafts do not allow forms to be opened outside task/context rules.
- Drafts are not uploaded to the server.
