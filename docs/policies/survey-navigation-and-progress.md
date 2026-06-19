# Survey Navigation And Progress Policy

This policy defines cross-form SurveyJS navigation and progress behavior.

## Core Rule

Long forms must provide section navigation and progress feedback. Navigation/progress state helps the field user; it is not evidence and must not drive analysis, routing, eligibility, or task completion.

## Section Source

Build section navigation from SurveyJS structure:

- Prefer SurveyJS pages as top-level sections.
- Use explicit section metadata or page titles for labels.
- Use neutral labels such as `Section 1` only when no better label exists.
- Do not use question labels as section labels.
- Preserve source questionnaire section grouping when converting PDFs to SurveyJS JSON.

## Layout

Wide layouts should use:

```text
Table of Contents | active SurveyJS page/section
```

Narrow/mobile layouts must still expose the section list through a drawer, compact control, or equivalent. Do not remove section navigation on mobile.

## Behavior

The Table of Contents must:

- show sections in order
- highlight the current section
- move to the selected section
- show completion state where feasible
- show validation/error state after validation has run
- include synthetic review sections when required, such as HHQ member summary or final preview
- preserve read-only prefill fields and skip logic while navigating
- never bypass final validation

## Progress

Progress should:

- show answered/total fields and percent where feasible
- update when answers change
- update when the active section changes
- recompute from SurveyJS data/model rather than stored authoritative progress
- avoid implying final submission before validation/final confirmation

Draft resume may restore the last active section, but progress itself is recomputed.

## Review Sections

Cross-form final preview should appear as a synthetic navigation section when active or required.

Form-specific review sections are allowed when they protect data quality. HHQ member-summary review is one such section and is separate from the final preview gate.
