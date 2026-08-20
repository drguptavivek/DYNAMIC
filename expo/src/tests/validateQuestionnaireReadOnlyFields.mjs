import assert from "node:assert/strict";

const { applyReadOnlyFields } = await import(
  "../modules/questionnaires/questionnaireReadOnlyFields.js"
);
const { applyHhqTaskHouseholdPrefill, parseHhqTaskHouseholdId } = await import(
  "../modules/households/hhqTaskPrefill.js"
);
const { buildHhqPrefill, buildWqPrefill, mergePrefillIntoBlankValues } = await import(
  "../lib/prefillMapper.js"
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

const urbanPrefill = buildHhqPrefill({
  site_id: 1,
  locality_code: "01",
  locality_type: "urban",
});
assert.equal(urbanPrefill.prefill.hhq_residence_area_type, 1, "urban locality should preselect HHQ residence area type 1");

const ruralPrefill = buildHhqPrefill({
  site_id: 1,
  locality_code: "01",
  locality_type: "Rural",
});
assert.equal(ruralPrefill.prefill.hhq_residence_area_type, 2, "rural locality should preselect HHQ residence area type 2");

const unknownTypePrefill = buildHhqPrefill({
  site_id: 1,
  locality_code: "01",
  locality_type: null,
});
assert.equal(
  unknownTypePrefill.prefill.hhq_residence_area_type,
  undefined,
  "unknown locality type must leave the residence area question unanswered"
);

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

const wqContextPrefill = buildWqPrefill(
  {
    individual_id: "2-02-0003-01-02",
    member_name: "Eligible Woman",
  },
  {
    household_id: "2-02-0003-01",
    site_id: 2,
    locality_code: "02",
    locality_name: "Sagarpur",
    household_head_name: "Head Name",
  },
  null,
  new Date("2026-08-14T10:00:00"),
);
assert.deepEqual(wqContextPrefill.prefill, {
  wq_enter_structure_id_woman: "2-02-0003-01-02",
  wq_name_woman: "Eligible Woman",
  wq_household_head_name: "Head Name",
  wq_village_study_site: "Sagarpur / 2",
  wq_interview_date: "2026-08-14",
  wq_visit_no: 1,
});
assert.deepEqual(wqContextPrefill.readOnlyFields, [
  "wq_enter_structure_id_woman",
  "wq_household_head_name",
  "wq_village_study_site",
  "wq_visit_no",
]);
assert.equal(wqContextPrefill.readOnlyFields.includes("wq_name_woman"), false);

const wqTaskFallbackPrefill = buildWqPrefill(
  null,
  {
    household_id: "2-02-0003-01",
    site_id: 2,
    locality_code: "02",
    household_head_name: "Head Name",
  },
  {
    subject_id: "2-02-0003-01-03",
    subject_name: "Task Woman",
  },
  new Date("2026-08-14T10:00:00"),
);
assert.equal(wqTaskFallbackPrefill.prefill.wq_enter_structure_id_woman, "2-02-0003-01-03");
assert.equal(wqTaskFallbackPrefill.prefill.wq_name_woman, "Task Woman");
assert.equal(wqTaskFallbackPrefill.prefill.wq_visit_no, 1);

console.log("Validated questionnaire read-only field enforcement.");
