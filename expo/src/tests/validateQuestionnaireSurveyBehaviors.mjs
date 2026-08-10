import assert from "node:assert/strict";

const {
  attachHouseholdSurveyBehaviors,
  refreshHouseholdSurveyBehaviors,
} = await import(
  "../lib/householdSurveyBehaviors.js"
);

function createEvent() {
  const handlers = [];
  return {
    add(handler) {
      handlers.push(handler);
    },
    handlers
  };
}

function createModel(data, questionsByName = {}, questions = []) {
  return {
    data,
    onAfterRenderSurvey: createEvent(),
    onCompleting: createEvent(),
    onComplete: createEvent(),
    onAfterRenderQuestion: createEvent(),
    onDynamicPanelAdded: createEvent(),
    onDynamicPanelRemoved: createEvent(),
    onValueChanged: createEvent(),
    getAllQuestions() {
      return questions;
    },
    getQuestionByName(name) {
      return questionsByName[name] || null;
    },
    getValue(name) {
      return this.data[name];
    },
    setValue(name, value) {
      this.data[name] = value;
    },
    clearValue(name) {
      delete this.data[name];
    }
  };
}

const mandatoryQuestions = [
  { name: "hhq_household_members", readOnly: false, isRequired: false, getType: () => "paneldynamic" },
  { name: "hhq_household_head_name", readOnly: false, isRequired: false },
  { name: "hhq_total_household_members", readOnly: true, isRequired: false },
  { name: "member_line_number", readOnly: true, isRequired: false },
  { name: "member_name", readOnly: false, isRequired: false },
];
const mandatoryModel = createModel({}, {}, mandatoryQuestions);
attachHouseholdSurveyBehaviors(mandatoryModel, { form_code: "HHQ" });
mandatoryModel.onAfterRenderSurvey.handlers[0](mandatoryModel);

assert.equal(mandatoryQuestions[0].isRequired, false);
assert.equal(mandatoryQuestions[1].isRequired, true);
assert.equal(mandatoryQuestions[2].isRequired, false);
assert.equal(mandatoryQuestions[3].isRequired, false);
assert.equal(mandatoryQuestions[4].isRequired, true);

const model = createModel({
  hhq_household_members: [
    { member_name: "Asha" },
    { member_name: "Bala" }
  ]
}, {
  hhq_household_members: { isVisible: true }
});

attachHouseholdSurveyBehaviors(model, { form_code: "HHQ" });

assert.equal(model.onAfterRenderSurvey.handlers.length, 1);
model.onAfterRenderSurvey.handlers[0](model);

assert.deepEqual(
  model.getValue("hhq_household_members").map((member) => member.member_line_number),
  ["01", "02"]
);
assert.equal(model.getValue("hhq_total_household_members"), 2);

const restoredDraftModel = createModel({}, {
  hhq_household_members: { isVisible: true }
});
attachHouseholdSurveyBehaviors(restoredDraftModel, { form_code: "HHQ" });
restoredDraftModel.data = {
  hhq_site_id: 1,
  hhq_locality_code: "02",
  hhq_structure_map_id: "0042",
  hhq_household_number: "03",
  hhq_household_members: [
    { member_name: "Asha", member_sex: 2, member_age_years: 25, member_marital_status: 1 },
    { member_name: "Bala", member_sex: 1, member_age_years: 30, member_marital_status: 1 }
  ]
};

refreshHouseholdSurveyBehaviors(restoredDraftModel, { form_code: "HHQ" });

assert.deepEqual(
  restoredDraftModel.getValue("hhq_household_members").map((member) => member.member_line_number),
  ["01", "02"]
);
assert.deepEqual(
  restoredDraftModel.getValue("hhq_household_members").map((member) => member.member_individual_id),
  ["1-02-0042-03-01", "1-02-0042-03-02"]
);
assert.equal(restoredDraftModel.getValue("hhq_total_household_members"), 2);
assert.equal(restoredDraftModel.getValue("hhq_total_eligible_women"), 1);

const visibleEmptyPanelModel = createModel(
  {},
  {
    hhq_household_members: { isVisible: true, panelCount: 1 }
  }
);
attachHouseholdSurveyBehaviors(visibleEmptyPanelModel, { form_code: "HHQ" });
visibleEmptyPanelModel.onAfterRenderSurvey.handlers[0](visibleEmptyPanelModel);

assert.equal(visibleEmptyPanelModel.getValue("hhq_household_members"), undefined);
assert.equal(visibleEmptyPanelModel.getValue("hhq_total_household_members"), undefined);
assert.equal(visibleEmptyPanelModel.getValue("hhq_total_eligible_women"), undefined);

const hiddenRosterModel = createModel(
  {
    hhq_household_members: [
      { member_line_number: 1, member_woman_questionnaire_eligible: 2 }
    ],
    hhq_total_household_members: 1,
    hhq_total_eligible_women: 0
  },
  {
    hhq_household_members: { isVisible: false, panelCount: 1 }
  }
);
attachHouseholdSurveyBehaviors(hiddenRosterModel, { form_code: "HHQ" });
hiddenRosterModel.onAfterRenderSurvey.handlers[0](hiddenRosterModel);

assert.equal(hiddenRosterModel.getValue("hhq_household_members"), undefined);
assert.equal(hiddenRosterModel.getValue("hhq_total_household_members"), undefined);
assert.equal(hiddenRosterModel.getValue("hhq_total_eligible_women"), undefined);

const deletedFinalEntryModel = createModel(
  {
    hhq_household_members: [
      { member_line_number: 1, member_woman_questionnaire_eligible: 2 }
    ],
    hhq_total_household_members: 1,
    hhq_total_eligible_women: 0
  },
  {
    hhq_household_members: { isVisible: true, panelCount: 1 }
  }
);
attachHouseholdSurveyBehaviors(deletedFinalEntryModel, { form_code: "HHQ" });
deletedFinalEntryModel.onAfterRenderSurvey.handlers[0](deletedFinalEntryModel);

assert.equal(deletedFinalEntryModel.getValue("hhq_household_members"), undefined);
assert.equal(deletedFinalEntryModel.getValue("hhq_total_household_members"), undefined);
assert.equal(deletedFinalEntryModel.getValue("hhq_total_eligible_women"), undefined);

console.log("Validated questionnaire SurveyJS behavior attachment.");
