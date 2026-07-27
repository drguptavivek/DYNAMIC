# SurveyJS Native Renderer

## Status

Active DYNAMIC renderer architecture. The baseline household questionnaire (HHQ) is the first implemented vertical slice. Extend this design capability by capability across the remaining form definitions.

## Purpose

DYNAMIC uses one questionnaire definition for Android and web while rendering native Expo controls. SurveyJS-compatible JSON remains the authoring and interchange format. `survey-core` runs without a DOM and owns form state and rules. The Expo renderer reads that runtime model and maps each declared field capability to one standalone React Native component.

There is no WebView or `survey-react-ui` fallback for a form declared native. Missing renderer capability is a development error.

```text
SurveyJS-compatible form definition
  -> definition preparation and master choices
  -> headless survey-core model
  -> normalized renderer capability selection
  -> standalone Expo-native renderer
  -> Android or web native control
```

## Responsibility Boundary

| Layer | Owns | Must not own |
| --- | --- | --- |
| Form definition | Questions, choices, localized labels, descriptions, visibility expressions, validators, rendering hints | Household/pregnancy projections or task mutation |
| `survey-core` | Current values, pages, conditional visibility, calculated values, validation state, localization | DOM rendering, device permissions, database access |
| Native renderer registry | Deterministic question-to-capability selection | Silent fallback or study workflow rules |
| Standalone renderer | One native interaction and its error/display state | Cross-form workflow or longitudinal state mutation |
| DYNAMIC capability composition | Database checks, section state, roster confirmation, generated IDs, preview/finalization gates | Reimplementation of generic text/select/date behavior |
| Domain/event layer | Cohort, identity, evidence promotion, workflow, scheduling, projections | UI widget state |

## Capability Registry

Each renderer lives in its own file under `expo/src/components/forms/renderers/`. Registry selection is deterministic from SurveyJS question type, `inputType`, and explicit `renderAs` metadata.

| Capability | Definition signal | Native module |
| --- | --- | --- |
| Text | `type: text` | `TextRenderer.js` |
| Number | numeric input or `renderAs: numeric_textbox` | `NumberRenderer.js` |
| Date | `inputType: date` | `DateRenderer.js` |
| Note | `renderAs: note` | `NoteRenderer.js` |
| Select one | `type: radiogroup` | `SelectOneRenderer.js` |
| Select many | `type: checkbox` | `SelectManyRenderer.js` |
| Compound text | `type: multipletext` | `MultipleTextRenderer.js` |
| Repeat section | `type: paneldynamic` | `DynamicPanelRenderer.js` |
| Instruction | `type: html` | `InstructionRenderer.js` |
| Calculate | `renderAs: readonly_calculated_numeric` | `CalculateRenderer.js` |
| Display | `renderAs: readonly_summary` or app display composition | `DisplayRenderer.js` |
| Preview | app review capability | `PreviewRenderer.js` |
| GPS | `renderAs: gps_decimal` or `gps_altitude` | `GpsRenderer.js` |
| Camera | `renderAs: camera` | `CameraRenderer.js` |
| File picker | `type: file` or `renderAs: file_picker` | `FilePickerRenderer.js` |
| Database check | `renderAs: db_check` | `DbCheckRenderer.js` |

The registry must throw for an unsupported question type or rendering hint. It must not substitute a web renderer or a generic text box.

## Validation

Survey Core is the authoritative validation runtime on Android and web.

- Required, numeric, regex, count, and expression validators remain in the form definition.
- A renderer writes the value to the Survey Core question model and requests validation on the relevant interaction, normally blur or selection.
- `QuestionFrame` displays the question's current localized errors directly beneath its control.
- `RegexValidator.js` preserves the definition-owned regex and localized error message. It does not invent a different UI-only rule.
- DYNAMIC cross-field rules, such as one household head and age not less than residence duration, attach at the form behavior layer and place errors on the affected Survey Core questions.
- Async database checks run at the repository/behavior boundary. Finalization awaits them explicitly; an async event handler is not treated as a reliable save gate.

## Localization

`RendererLanguageSwitcher` changes the Survey Core model locale in place. The renderer then refreshes:

- page and section titles;
- question labels and descriptions;
- choice labels;
- instruction text;
- validation messages;
- preview/display labels sourced from the definition.

Missing translations follow Survey Core's definition fallback rules. Renderer components must not keep independent translated copies of protocol labels.

## Section State And Navigation

`SectionNavigator` derives state from the current Survey Core model on every answer change.

| State | Meaning |
| --- | --- |
| `not_applicable` | Page or its answerable content is currently hidden by form logic |
| `pending` | Applicable section has no entered answers |
| `in_progress` | Some applicable questions have answers |
| `needs_attention` | One or more applicable questions currently have validation errors |
| `complete` | All currently applicable answerable questions have answers |

Navigation can move among applicable sections, but app-specific gates still apply. For HHQ, Section 03 cannot be entered until the household roster summary has been confirmed.

## Repeat Sections

A repeated panel is not rendered as one long anonymous list.

- Show the number of entries added.
- Show a compact entry list.
- Allow the interviewer to select a specific entry for editing.
- Allow deletion of a specific entry when the form definition's `minPanelCount` permits it.
- After adding an entry, select the new entry for editing.
- Preserve Survey Core panel order as the row sequence.
- Generate stable semantic entity IDs outside the generic repeat renderer.

For HHQ, the member row number is the roster sequence and the displayed member ID is:

```text
household_member_id = household_id-member_line_number
```

## Preview And Display

Preview is a native read-only rendering of data entered so far across all sections.

- It is available at any time, including before the form is complete.
- Unanswered applicable fields display `-` rather than disappearing.
- Repeated entries display their child answers in row order.
- Opening an interim preview does not finalize evidence.
- Final save requires a fresh preview signature matching the current answers.
- Any edit invalidates the prior final preview.

Display capability is broader than one calculated value. It supports intermediate app views such as the HHQ roster confirmation table, generated member IDs, eligibility labels, and other read-only workflow summaries.

## DYNAMIC-Specific HHQ Composition

The HHQ native slice composes generic renderers with these app capabilities:

1. Apply user/site/locality master choices.
2. Calculate roster line numbers, household totals, and WQ eligibility.
3. Check the hierarchical household ID against the offline repository as ID components change.
4. Show the repeat-entry count and allow member-specific edit/delete.
5. Display and confirm the roster before Section 03.
6. Display deterministic household-member IDs in the roster summary.
7. Track section applicability and completion state.
8. Allow interim preview of all data entered so far.
9. Validate all applicable fields and DYNAMIC cross-field rules.
10. Await the final duplicate database check.
11. Require a current final preview before saving the provisional household registry record.

## Device Capabilities

Device access is isolated in the relevant standalone renderer.

| Capability | Expo module | Stored answer boundary |
| --- | --- | --- |
| GPS | `expo-location` | latitude, longitude, altitude values in form state |
| Camera | `expo-image-picker` | local asset metadata/URI pending attachment persistence and sync |
| File picker | `expo-document-picker` | local asset metadata/URI pending attachment persistence and sync |

Permission denial is a visible control status, not a renderer fallback. Attachment persistence and sync policy must be completed before camera/file fields are enabled in production forms.

## File Map

```text
expo/src/components/forms/
  NativeSurveyRenderer.js
  RendererLanguageSwitcher.js
  SectionNavigator.js
  nativeSurveyModel.js
  renderers/
    NativeQuestionRenderer.js
    QuestionFrame.js
    <one file per renderer capability>
  validators/
    RegexValidator.js

expo/src/modules/households/
  BaselineHouseholdForm.js

expo/src/lib/
  householdSurveyBehaviors.js
  prepareSurveyJson.js
```

## Extension Procedure

When adding a capability or moving another form to native rendering:

1. Compare the form definition against its source PDF and inventory its question types, input types, validators, visibility expressions, and rendering hints.
2. Reuse an existing capability when its semantics match exactly.
3. Otherwise add one standalone renderer and one explicit registry mapping.
4. Begin every implementation and test file with a concise module-level JSDoc block describing its responsibility and boundary.
5. Keep device access in the device renderer and study workflow in the app/domain layer.
6. Add a model-level contract test for selection, value writing, visibility, validation message, and preview output.
7. Add form-specific behavior tests for IDs, calculations, database checks, and workflow gates.
8. Run `npm --workspace expo test`.
9. Build both Android and web bundles.
10. Verify the rendered form flow on the target device/browser without finalizing test evidence unless explicitly intended.

## Current Limits

- HHQ is the first native form slice; other forms remain to be moved capability by capability.
- Camera/file selection modules exist, but durable attachment persistence, encryption, sync, retry, and server acceptance remain separate work.
- Date currently uses a native text input contract with ISO `YYYY-MM-DD`; a platform date-picker capability may replace its UI without changing the stored value contract.
- Draft/autosave policy remains authoritative and must be applied when the native renderer is integrated into the generic questionnaire lifecycle.
