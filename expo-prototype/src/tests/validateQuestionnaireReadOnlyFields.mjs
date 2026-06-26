import assert from "node:assert/strict";

const { applyReadOnlyFields } = await import(
  "../modules/questionnaires/questionnaireReadOnlyFields.js"
);

function createModel(questionsByName = {}, pages = []) {
  return {
    pages,
    getQuestionByName(name) {
      return questionsByName[name] || null;
    }
  };
}

const topLevelQuestion = { name: "top_level", readOnly: false };
const nestedPanelQuestion = { name: "nested_panel_question", readOnly: false };
const dynamicPanelQuestion = { name: "dynamic_panel_question", readOnly: false };

const model = createModel(
  {
    top_level: topLevelQuestion,
    nested_panel_question: nestedPanelQuestion,
    dynamic_panel_question: dynamicPanelQuestion
  },
  [
    {
      elements: [
        topLevelQuestion,
        {
          name: "panel",
          elements: [nestedPanelQuestion]
        },
        {
          name: "dynamic_panel",
          templateElements: [dynamicPanelQuestion]
        }
      ]
    }
  ]
);

applyReadOnlyFields(model, [
  "top_level",
  "nested_panel_question",
  "dynamic_panel_question"
]);

assert.equal(topLevelQuestion.readOnly, true);
assert.equal(nestedPanelQuestion.readOnly, true);
assert.equal(dynamicPanelQuestion.readOnly, true);

console.log("Validated questionnaire read-only field enforcement.");
