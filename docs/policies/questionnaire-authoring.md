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
- SurveyJS-compatible JSON is interpreted by headless `survey-core`; Expo-native controls render the model on Android and web.
- Keep each renderer capability in a standalone module. Do not hide WebView or `survey-react-ui` fallback behavior behind a native form route.
- Renderer selection comes from question type/input metadata and explicit rendering hints. Unsupported capabilities fail visibly in development.
- Regex validators display the definition-owned localized error message at the affected control.
- Repeated sections show the entry count and allow a specific entry to be selected, edited, or deleted subject to the definition's minimum-row rule.
- The renderer language switch changes the Survey Core locale in place so labels, choices, descriptions, and validation messages refresh together.
- Keep database checks, section state, roster confirmation, generated-ID display, and preview as named app capabilities around generic field renderers.

## Form Flow

- SurveyJS JSON renders forms; it is not the longitudinal data model.
- Forms open from scheduled tasks or valid contextual triggers only.
- HHQ can create/enroll the baseline household from the mapped frame.
- WQ opens for HHQ-derived eligible women.
- PEF opens from accepted pregnancy detection.
- PFF/POF/BAF/NFF/CDF/SBF/VA open only through workflow rules and task state.

## After JSON Changes

After questionnaire JSON changes:

1. Update `expo/src/data/forms/`.
2. Rebuild `outputs/pretsing-form-json/all_forms.json` if the extraction output changed.
3. Run `npm --workspace expo test`.
4. Browser-check UI-affecting changes.
