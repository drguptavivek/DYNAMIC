# Cross-Questionnaire Preview

This document describes the custom compact preview used by questionnaire forms in the Expo prototype.

Primary implementation points:

- `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`
- `expo-prototype/src/modules/questionnaires/surveyNavigation.js`
- `expo-prototype/src/modules/questionnaires/questionnaireDraftRepository.js`
- `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`

The app does not use SurveyJS' built-in preview page. Each SurveyJS model is configured with:

```text
showPreviewBeforeComplete = "noPreview"
```

Instead, `QuestionnaireDashboard` renders a custom compact preview panel that works across questionnaires.

## Entry Points

Preview can be opened from:

- the top `Preview` button
- the synthetic `PREVIEW` item in the left Table of Contents
- the final-submit flow, when the current answers have not been previewed yet

All three entry points use the same `openPreviewFromModel(model)` path.

## Preview Generation Flow

`openPreviewFromModel(model)` performs these steps:

1. Saves the current SurveyJS data as a local draft with `saveDraftFromModel(model, { silent: true })`.
2. Builds compact preview rows with `buildPreviewRows(model, locale, form)`.
3. Opens the custom preview panel by setting `previewOpen = true`.
4. Closes any form-specific review panel, such as the HHQ 02B household member summary.
5. Records the current answer signature in `previewSignatureRef`.
6. Marks preview as confirmed with `previewConfirmed = true`.
7. Refreshes section/progress state so the left Table of Contents shows `PREVIEW` as complete.

## Row Ordering

Preview rows are ordered from SurveyJS model metadata:

- `buildPreviewRows()` starts with `model.getAllQuestions()`.
- A field is included when the question has a name and `model.data` contains a value for that name.
- Data keys not present in `getAllQuestions()` are appended after ordered question values.
- Fields ending in `_end_summary` are skipped when the base field is also present, so derived summary duplicates do not crowd the compact preview.

## Display Rules

Scalar values:

- Render in a compact two-column table:
  - `Field`
  - `Answer`
- Empty values render as `-`.
- SurveyJS `question.getDisplayValue()` is used when available, so coded choices render as labels where SurveyJS can resolve them.

Repeat values:

- Arrays of objects render as full-width nested grids.
- Generic repeat grids use up to the first six object keys as columns.
- HHQ household members use a form-specific summary adapter instead of raw member-row JSON.

HHQ member preview columns:

- `Sr`
- `Member name`
- `Age`
- `Sex`
- `Relation`
- `WQ Eligible`

Other repeat arrays, such as repeatable mobile numbers, use their object keys as compact grid columns.

## Final-Submit Gate

Final submission is gated by the previewed answer signature:

1. `model.onCompleting` calculates the current data signature with `getDataSignature(sender.data)`.
2. If `hasPreviewedRef` is false, completion is blocked.
3. If `previewSignatureRef` does not match the current data signature, completion is blocked.
4. Blocking opens preview by calling `openPreviewFromModel(sender)`.
5. The status message becomes:

```text
Preview the saved draft before final save
```

The user must then submit from the preview panel with `Confirm & Submit`.

`Confirm & Submit` calls:

```text
survey.doComplete()
```

If the current data still matches the previewed signature and all SurveyJS/runtime validations pass, `onComplete` saves the final immutable questionnaire submission.

## Draft Interaction

Opening preview always saves a local draft first. This ensures the preview is generated from the same payload that would be recoverable if the app is closed.

Draft behavior:

- Unsaved form changes set `dirty = true`.
- Any value change clears preview confirmation:
  - `hasPreviewedRef = false`
  - `previewConfirmed = false`
- Autosave continues independently every 30 seconds when dirty.
- Manual `Save Draft` can also save without opening preview.
- On final completion, the saved submission ID is written back to the active draft with `markQuestionnaireDraftSubmitted()`.

## Table of Contents Wiring

`surveyNavigation.buildSurveySections()` appends a synthetic Preview section when called with:

```text
includeCompactPreview: true
```

Preview section fields:

- `name`: `compact_preview`
- `title`: `PREVIEW`
- `answered`: `1` when the current answers have been previewed, otherwise `0`
- `total`: `1`
- `isCurrent`: true when the preview panel is open

Selecting the `PREVIEW` TOC item calls `openPreviewFromModel(model)`, same as the top Preview button.

## Relationship to Form-Specific Review Panels

The compact Preview is cross-questionnaire and represents the final review before submission.

Form-specific review panels can still exist before the final preview. HHQ currently has `02B-HOUSEHOLD MEMBER SUMMARY`, which is a roster review step between Section 02 and Section 03. It is not the same as the final Preview.

When Preview opens, it closes any active form-specific review panel so the main content pane shows only one review surface at a time.

## Completion Path

After `Confirm & Submit` passes all gates:

1. Task events are generated when task context is available.
2. `saveQuestionnaireSubmission()` writes the final immutable response.
3. The active draft is marked submitted when a draft ID exists.
4. Submission list state is refreshed.
5. The user is navigated back to the questionnaire route.

Only finalized submissions should be treated as uploaded/submittable responses. Drafts remain local recovery/editing state until final completion succeeds.
