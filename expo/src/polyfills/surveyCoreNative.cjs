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
  return new Model(surveyJson);
}

function isNativeSurveyCorePatched() {
  return nativeSurveyCorePatched;
}

module.exports = { createSurveyModel, isNativeSurveyCorePatched };
