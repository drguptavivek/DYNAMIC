/** Verifies lazy Survey Core loading and the native validation/focus guard. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const surveyCorePath = require.resolve("survey-core");
const { createSurveyModel, isNativeSurveyCorePatched } = await import(
  "../polyfills/surveyCoreNative.js"
);

assert.equal(
  require.cache[surveyCorePath],
  undefined,
  "importing the factory must not eagerly evaluate survey-core"
);

const surveyJson = {
  pages: [
    {
      name: "first",
      elements: [{ type: "text", name: "required_answer", isRequired: true }],
    },
    { name: "second", elements: [{ type: "text", name: "follow_up" }] },
  ],
};

const firstModel = createSurveyModel(surveyJson);
assert.equal(isNativeSurveyCorePatched(), true, "native patch applies before model construction");
const { Question, SurveyModel } = require("survey-core");
const focusPatch = Question.prototype.focusInputElement;
const scrollPatch = SurveyModel.prototype.scrollElementToTop;
const secondModel = createSurveyModel(surveyJson);

assert.equal(
  Question.prototype.focusInputElement,
  focusPatch,
  "constructing another model must not replace the focus patch"
);
assert.equal(
  SurveyModel.prototype.scrollElementToTop,
  scrollPatch,
  "constructing another model must not replace the scroll patch"
);
assert.equal(secondModel.currentPage.name, "first");

assert.equal(
  firstModel.nextPage(),
  false,
  "native validation should block Next when a required answer is missing"
);
assert.ok(
  firstModel.getQuestionByName("required_answer").errors.length > 0,
  "native validation should retain the failing question error"
);

console.log("Validated lazy Survey Core factory and native validation guard.");
