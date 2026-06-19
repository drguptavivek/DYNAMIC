# Questionnaire Authoring Policy

This policy controls questionnaire JSON, SurveyJS rendering, calculated fields, IDs, and form flow changes.

## Required Sources

Before changing questionnaire JSON, Expo routing, calculated fields, IDs, or flow logic, read:

- `Refs/FLOW.md`
- `Refs/Unique_Ids.md`
- `Refs/site_interviewers_workplan_indicators.md`
- `Refs/pretesing forms/forms_summary table_v2026.05.17.pdf`
- the specific source questionnaire PDF in `Refs/pretesing forms/`

Do question-by-question PDF comparison before questionnaire JSON changes.

## Field Mapping

- Preserve PDF `Variable ID` in SurveyJS `sourceCode`.
- Use form-prefixed analysis-safe names only where global answer-key uniqueness is needed.
- Do not invent event names from labels; event extraction maps source fields into typed events.
- If a field drives workflow, eligibility, routing, scheduling, reporting, or analysis, promote it into typed state. Do not leave it only in `answers_json`.

## Rendering

- Labels contain only question text.
- Put instructions, probes, skip notes, hints, and auto-fill notes in metadata, description, validation, or app logic.
- Numeric boxes are numeric/text inputs, not radio choices.
- `RECORD ALL` / `ANSWER UP TO` fields are checkboxes unless the PDF defines one coded response.
- Auto-filled lineage/core fields are read-only with explicit source metadata.
- Read-only enforcement must use the SurveyJS model API and include nested panel questions.

## Form Flow

- SurveyJS JSON renders forms; it is not the longitudinal data model.
- Forms open from scheduled tasks or valid contextual triggers only.
- HHQ can create/enroll the baseline household from the mapped frame.
- WQ opens for HHQ-derived eligible women.
- PEF opens from accepted pregnancy detection.
- PFF/POF/BAF/NFF/CDF/SBF/VA open only through workflow rules and task state.

## After JSON Changes

After questionnaire JSON changes:

1. Update `expo-prototype/src/data/forms/`.
2. Rebuild `outputs/pretsing-form-json/all_forms.json` if the extraction output changed.
3. Run `npm --workspace expo-prototype test`.
4. Browser-check UI-affecting changes.
