# SurveyJS Side Navigation And Progress Bar Design

Date: 2026-06-07

Status: approved design

## Purpose

DYNAMIC - PreTESTING SurveyJS forms can be long. Field Data Collectors need a persistent Side Navigation / Table of Contents on the form screen so they can understand where they are, move between sections, and return to partially completed sections without scrolling through the whole form. They also need a progress bar so partial completion is visible during data entry.

This is a cross-form SurveyJS behavior. It must not depend on final PDF wording or form-specific question IDs.

## Design Decision

SurveyJS form screens must use a two-pane layout on tablet/desktop-width screens:

```text
Side Navigation / Table of Contents | active SurveyJS form page/section
```

On narrow mobile screens, the same section navigation becomes a collapsible Table of Contents drawer or top section button. The app must not remove section navigation entirely on mobile.

The form screen must also include a progress bar that reflects section/page progress and updates as the field worker moves through the form.

## Section Source

The Table of Contents is generated from SurveyJS structure:

- Prefer SurveyJS pages as top-level sections.
- If a page contains named panels that represent clear PDF sections, show those panels as nested section anchors only when it improves navigation.
- Use SurveyJS `title` or explicit section metadata for section labels.
- If no label is available, generate a neutral label such as `Section 1`, `Section 2`, etc.
- Do not use question labels as section labels.

The source questionnaire PDF remains responsible for section grouping. The SurveyJS JSON must preserve those groupings when forms are converted or revised.

## Side Navigation Behavior

The Side Navigation / Table of Contents must:

- show all form sections in order
- highlight the current section
- allow tapping/clicking a section to move to it
- show completion state per section where feasible
- show validation/error state per section after validation has run
- preserve read-only prefill fields and skip logic when moving between sections
- never bypass required validation on final Submit

Section movement is navigation only. It does not submit the form, complete a task, generate domain events, or change normalized domain state.

## Progress Bar Behavior

The progress bar must:

- show overall form progress using SurveyJS page/section completion where feasible
- update when the current section changes
- update when required fields in a section become complete
- avoid implying successful final submission before validation has passed
- remain visible while the field worker moves through the form
- work with drafts, so reopened drafts show progress based on restored answers

Progress is for field navigation and completion awareness only. It is not an analysis variable and must not drive eligibility, routing, or task completion.

## Draft And Resume Behavior

Drafts should store enough `completion_state_json` to resume the last active section/page when useful. Progress bar state should be recomputed from `answers_json` and the current SurveyJS model rather than stored as an authoritative value.

When a draft is reopened:

1. Load partial `answers_json`.
2. Load the draft's original prefill snapshot.
3. Restore the last active section/page if available.
4. Recompute section completion and validation markers from the current SurveyJS model.

## Expo Android Requirements

The Expo SurveyJS form screen must include:

- Side Navigation / Table of Contents on tablet/desktop-width layouts
- a collapsible Table of Contents drawer or equivalent on narrow screens
- a visible progress bar
- visible current-section marker
- section completion/error markers
- stable access to Save Draft, Preview, and Submit actions while navigating
- no global open-any-form path

## Main App/Admin Requirements

Any main app or admin form-view surface that renders finalized SurveyJS responses should use the same Table of Contents and progress model so reviewers can move through long forms by section.

Admin review remains read-only unless the user is in an approved submitted-form edit workflow. Section navigation must not imply that active field drafts are visible or editable by admin users.

## Testing

Required tests:

- Long forms render with Side Navigation / Table of Contents on wide screens.
- Narrow screens expose the same section list through a drawer or compact control.
- Progress bar updates as sections are completed.
- Section click/tap moves to the intended SurveyJS page or panel.
- Current section highlighting updates while navigating.
- Draft reopen restores the last active section when stored.
- Section validation markers do not allow invalid final submission.
- Read-only prefilled lineage fields remain read-only after section navigation.

## Non-Goals

- Do not create form-specific navigation code for each questionnaire.
- Do not use question labels as section labels.
- Do not allow section navigation or progress bar state to bypass task/context opening rules.
- Do not allow section navigation or progress bar state to bypass final validation.
- Do not store progress bar state as analysis data.
