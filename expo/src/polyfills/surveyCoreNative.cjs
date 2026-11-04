/**
 * Lazily constructs Survey Core models for the native renderer.
 *
 * Keep this CommonJS so the synchronous `require` is valid in Metro and does
 * not become an ambiguous ESM module under Node's test runner.
 */
let nativeSurveyCorePatched = false;

function ensureNativeSurveyCorePatch({ Question, SurveyModel }) {
  if (nativeSurveyCorePatched || typeof document !== "undefined") return;

  // Survey Core's error-focus path reads settings.environment (a browser DOM)
  // without a guard, so page validation throws without a document and silently
  // kills Next/Complete presses. Native renderers own scrolling and focus.
  SurveyModel.prototype.scrollElementToTop = function scrollElementToTopNoOp() {};
  Question.prototype.focusInputElement = function focusInputElementNoOp() {};
  nativeSurveyCorePatched = true;
}

function createSurveyModel(surveyJson) {
  const surveyCore = require("survey-core");
  const { Model, Question, SurveyModel } = surveyCore;
  ensureNativeSurveyCorePatch({ Question, SurveyModel });
  const model = new Model(surveyJson);
  model.nativeText = surveyJson?.nativeText || {};
  model.nativeEnglishQuestionTitles = surveyJson?.nativeEnglishQuestionTitles || [];
  // Text-backed numeric controls still offer coded special choices. SurveyJS
  // does not retain radiogroup metadata on a text question or its panel clones.
  model.nativeQuestionChoices = {};
  const retainTextChoices = (node) => {
    if (node?.type === "text" && Array.isArray(node.choices)) {
      model.nativeQuestionChoices[node.name] = node.choices;
    }
    for (const field of ["pages", "elements", "templateElements"]) {
      for (const child of node?.[field] || []) retainTextChoices(child);
    }
  };
  retainTextChoices(surveyJson);
  model.onValidateQuestion.add((sender, options) => {
    const question = options.question;
    if (!question?.isRequired || question.isReadOnly ||
        !["pef_lmp_start", "wq_02_reproduction_when_did_your_last_menstrual_period_start"].includes(options.name)) return;
    const value = options.value;
    if (!value || typeof value !== "object") return;
    // Selecting an entry mode alone is not an answer to a required LMP question.
    const fields = value.mode === "date" ? ["day", "month", "year"]
      : value.mode === "relative" ? ["unit", "value"] : [];
    if (!fields.length || fields.some((field) => String(value[field] ?? "").trim() === "")) {
      options.error = new surveyCore.AnswerRequiredError(question.requiredErrorText, question).getText();
    }
  });
  return model;
}

function isNativeSurveyCorePatched() {
  return nativeSurveyCorePatched;
}

module.exports = { createSurveyModel, isNativeSurveyCorePatched };
