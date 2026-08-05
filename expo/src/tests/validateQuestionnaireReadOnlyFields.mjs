import assert from "node:assert/strict";

const { applyReadOnlyFields } = await import(
  "../modules/questionnaires/questionnaireReadOnlyFields.js"
);
const { applyHhqTaskHouseholdPrefill, parseHhqTaskHouseholdId } = await import(
  "../modules/households/hhqTaskPrefill.js"
);
const { buildHhqPrefill, mergePrefillIntoBlankValues } = await import("../lib/prefillMapper.js");

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

assert.deepEqual(parseHhqTaskHouseholdId("2-02-0002-02"), {
  hhq_site_id: 2,
  hhq_locality_code: "02",
  hhq_structure_map_id: "0002",
  hhq_household_number: "02",
});
assert.equal(parseHhqTaskHouseholdId("bad-household-id"), null);

const prefillValues = {};
const prefillQuestions = {
  hhq_site_id: { name: "hhq_site_id", readOnly: false },
  hhq_locality_code: { name: "hhq_locality_code", readOnly: false },
  hhq_structure_map_id: { name: "hhq_structure_map_id", readOnly: false },
  hhq_household_number: { name: "hhq_household_number", readOnly: false },
};
const appliedPrefill = applyHhqTaskHouseholdPrefill(
  {
    getQuestionByName(name) {
      return prefillQuestions[name] || null;
    },
    setValue(name, value) {
      prefillValues[name] = value;
    },
  },
  { household_id: "2-02-0002-02" },
);
assert.deepEqual(appliedPrefill, {
  hhq_site_id: 2,
  hhq_locality_code: "02",
  hhq_structure_map_id: "0002",
  hhq_household_number: "02",
});
assert.deepEqual(prefillValues, appliedPrefill);
assert.equal(prefillQuestions.hhq_site_id.readOnly, true);
assert.equal(prefillQuestions.hhq_locality_code.readOnly, true);
assert.equal(prefillQuestions.hhq_structure_map_id.readOnly, true);
assert.equal(prefillQuestions.hhq_household_number.readOnly, true);

const hhqContextPrefill = buildHhqPrefill({
  site_id: 2,
  locality_code: "02",
  household_head_name: "Existing Head",
  address: "Existing address",
}, new Date("2026-08-05T10:00:00"));
assert.deepEqual(hhqContextPrefill.prefill, {
  hhq_site_id: 2,
  hhq_locality_code: "02",
  hhq_household_head_name: "Existing Head",
  hhq_household_address: "Existing address",
  hhq_interview_date: "2026-08-05",
});
assert.deepEqual(hhqContextPrefill.readOnlyFields, ["hhq_site_id", "hhq_locality_code"]);

const hhqDateOnlyPrefill = buildHhqPrefill(null, new Date("2026-08-05T10:00:00"));
assert.deepEqual(hhqDateOnlyPrefill.prefill, {
  hhq_interview_date: "2026-08-05",
});
assert.deepEqual(hhqDateOnlyPrefill.readOnlyFields, []);

const repairedDraft = mergePrefillIntoBlankValues(
  {
    hhq_household_head_name: "",
    hhq_household_address: "",
    hhq_interview_date: "",
  },
  hhqContextPrefill.prefill,
);
assert.equal(repairedDraft.hhq_household_head_name, "Existing Head");
assert.equal(repairedDraft.hhq_household_address, "Existing address");
assert.equal(repairedDraft.hhq_interview_date, "2026-08-05");

const editedDraft = mergePrefillIntoBlankValues(
  {
    hhq_household_head_name: "Edited Head",
    hhq_household_address: "Edited address",
    hhq_interview_date: "2026-08-04",
  },
  hhqContextPrefill.prefill,
);
assert.equal(editedDraft.hhq_household_head_name, "Edited Head");
assert.equal(editedDraft.hhq_household_address, "Edited address");
assert.equal(editedDraft.hhq_interview_date, "2026-08-04");

console.log("Validated questionnaire read-only field enforcement.");
