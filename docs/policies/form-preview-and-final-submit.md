# Form Preview And Final Submit Policy

This policy is canonical even where implementation still lags. Final submit requires preview first.

## Core Rule

Every questionnaire must require a review preview before final submission.

Preview is not evidence. Preview may save a draft. Only final confirmation creates immutable evidence.

## Preview Model

Use a custom cross-questionnaire preview surface rather than SurveyJS built-in final preview when the app needs consistent behavior across forms.

Rules:

- The same preview path is used from the Preview button, Table of Contents preview item, and final-submit gate.
- Opening preview first saves the current local draft.
- Preview renders from the saved local draft payload.
- Preview shows available answers in form order.
- Repeating groups render as compact tables.
- Form-specific review panels can exist before final preview, but final preview is the last review gate.

## Final-Submit Gate

Final submission is blocked unless:

1. preview has been opened for the current answer payload
2. the answer signature still matches the previewed payload
3. required SurveyJS/runtime validation passes
4. the user confirms final submission from the preview surface

Any answer change after preview clears preview confirmation and requires preview again.

## Preview Contents

Scalar values:

- show field/question label
- show display value when choice labels can be resolved
- show `-` for empty values

Repeating values:

- show a compact row table
- use form-specific adapters when raw JSON would be unreadable
- HHQ member preview must include member number/name, age, sex, relation, and WQ eligibility

Derived summary duplicates should not crowd preview when the base field is already shown.

## Completion Path

After Confirm and Submit passes:

1. create the immutable local form response
2. generate task events when task context is available
3. mark the active draft submitted
4. refresh submission/task state
5. return the user to the appropriate form/task route

No downstream state changes may happen from preview alone.
