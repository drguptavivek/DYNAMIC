/** Verifies household calculations, cross-field rules, and asynchronous duplicate checks. */
import assert from "node:assert/strict";

const { attachHouseholdSurveyBehaviors } = await import("../lib/householdSurveyBehaviors.js");

function createEvent() {
  const handlers = [];
  return {
    add(handler) {
      handlers.push(handler);
    },
    handlers
  };
}

function createQuestion(name, parentData = null) {
  return {
    name,
    parent: parentData ? { data: parentData } : null,
    errors: [],
    addError(error) {
      this.errors.push(typeof error === "string" ? error : error.text || String(error));
    },
    clearErrors() {
      this.errors = [];
    }
  };
}

function createModel(data, questions = []) {
  const householdNumberQuestion = {
    errors: [],
    addError(error) {
      this.errors.push(typeof error === "string" ? error : error.text || String(error));
    },
    clearErrors() {
      this.errors = [];
    }
  };
  const householdMembersQuestion = { isVisible: true };

  return {
    data,
    notifications: [],
    onAfterRenderSurvey: createEvent(),
    onCompleting: createEvent(),
    onComplete: createEvent(),
    onAfterRenderQuestion: createEvent(),
    onDynamicPanelAdded: createEvent(),
    onDynamicPanelRemoved: createEvent(),
    onValueChanged: createEvent(),
    onValidateQuestion: createEvent(),
    getQuestionByName(name) {
      if (name === "hhq_household_number") return householdNumberQuestion;
      if (name === "hhq_household_members") return householdMembersQuestion;
      return null;
    },
    getAllQuestions() {
      return questions;
    },
    getValue(name) {
      return this.data[name];
    },
    setValue(name, value) {
      this.data[name] = value;
    },
    clearValue(name) {
      delete this.data[name];
    },
    notify(message, type) {
      this.notifications.push({ message, type });
    },
    householdNumberQuestion
  };
}

const duplicateHousehold = {
  household_id: "1-02-0042-03"
};
const duplicateModel = createModel({
  hhq_site_id: 1,
  hhq_locality_code: 2,
  hhq_structure_map_id: "0042",
  hhq_household_number: "03"
});

attachHouseholdSurveyBehaviors(
  duplicateModel,
  { form_code: "HHQ" },
  () => {},
  {
    findExistingHousehold: async () => duplicateHousehold
  }
);

await duplicateModel.onValueChanged.handlers[0](duplicateModel, {
  name: "hhq_household_number",
  value: "03"
});

assert.equal(typeof duplicateModel.householdNumberQuestion.runNativeDbCheck, "function");
assert.equal(
  await duplicateModel.householdNumberQuestion.runNativeDbCheck(),
  duplicateHousehold
);
assert.deepEqual(duplicateModel.householdNumberQuestion.errors, [
  "Household ID 1-02-0042-03 already exists. Use another structure or household number."
]);

const completingOptions = { allow: true, allowComplete: true };
await duplicateModel.onCompleting.handlers[0](duplicateModel, completingOptions);
assert.equal(completingOptions.allow, false);
assert.equal(completingOptions.allowComplete, false);
assert.equal(completingOptions.message, "Household ID 1-02-0042-03 already exists.");

const revisitModel = createModel({
  hhq_site_id: 1,
  hhq_locality_code: 2,
  hhq_structure_map_id: "0042",
  hhq_household_number: "03"
});

attachHouseholdSurveyBehaviors(
  revisitModel,
  { form_code: "HHQ" },
  () => {},
  {
    findExistingHousehold: async () => duplicateHousehold,
    allowedExistingHouseholdId: duplicateHousehold.household_id
  }
);

await revisitModel.onValueChanged.handlers[0](revisitModel, {
  name: "hhq_household_number",
  value: "03"
});

assert.equal(
  await revisitModel.householdNumberQuestion.runNativeDbCheck(),
  null
);
assert.deepEqual(revisitModel.householdNumberQuestion.errors, []);

const revisitCompletingOptions = { allow: true, allowComplete: true };
await revisitModel.onCompleting.handlers[0](revisitModel, revisitCompletingOptions);
assert.equal(revisitCompletingOptions.allow, true);
assert.equal(revisitCompletingOptions.allowComplete, true);

const newModel = createModel({
  hhq_site_id: 1,
  hhq_locality_code: 2,
  hhq_structure_map_id: "0043",
  hhq_household_number: "01"
});

attachHouseholdSurveyBehaviors(
  newModel,
  { form_code: "HHQ" },
  () => {},
  {
    findExistingHousehold: async () => null
  }
);

assert.equal(newModel.getQuestionByName("hhq_household_members").dynamicAutoOpenFirstEntry, true);
assert.equal(newModel.getQuestionByName("hhq_household_members").dynamicHideAddButton, false);
assert.equal(newModel.getQuestionByName("hhq_household_members").addPanelText, "Add household member");

await newModel.onValueChanged.handlers[0](newModel, {
  name: "hhq_household_number",
  value: "01"
});

assert.deepEqual(newModel.householdNumberQuestion.errors, []);

const newCompletingOptions = { allow: true, allowComplete: true };
await newModel.onCompleting.handlers[0](newModel, newCompletingOptions);
assert.equal(newCompletingOptions.allow, true);
assert.equal(newCompletingOptions.allowComplete, true);

const duplicateHeadMembers = [
  { member_name: "Asha", member_relationship_to_head: 1 },
  { member_name: "Bala", member_relationship_to_head: 1 }
];
const firstRelationshipQuestion = createQuestion(
  "member_relationship_to_head",
  duplicateHeadMembers[0]
);
const secondRelationshipQuestion = createQuestion(
  "member_relationship_to_head",
  duplicateHeadMembers[1]
);
const duplicateHeadModel = createModel(
  { hhq_household_members: duplicateHeadMembers },
  [firstRelationshipQuestion, secondRelationshipQuestion]
);

attachHouseholdSurveyBehaviors(
  duplicateHeadModel,
  { form_code: "HHQ" },
  () => {},
  {
    findExistingHousehold: async () => null
  }
);

duplicateHeadModel.onValueChanged.handlers[0](duplicateHeadModel, {
  name: "member_relationship_to_head",
  value: 1
});

assert.deepEqual(
  duplicateHeadModel.getValue("hhq_household_members").map((member) => member.member_relationship_to_head),
  [1, 1]
);
assert.deepEqual(firstRelationshipQuestion.errors, [
  "Only one household member can be marked as Head."
]);
assert.deepEqual(secondRelationshipQuestion.errors, [
  "Only one household member can be marked as Head."
]);
assert.deepEqual(duplicateHeadModel.notifications, [
  {
    message: "Only one household member can be marked as Head.",
    type: "error"
  }
]);

// Committing the second "Head" entry in the roster editor runs
// question.validate(), which must be blocked via onValidateQuestion.
const duplicateHeadValidateOptions = {
  name: "member_relationship_to_head",
  question: secondRelationshipQuestion,
  value: 1,
  error: ""
};
duplicateHeadModel.onValidateQuestion.handlers[0](duplicateHeadModel, duplicateHeadValidateOptions);
assert.equal(duplicateHeadValidateOptions.error, "Only one household member can be marked as Head.");

const duplicateHeadCompletingOptions = { allow: true, allowComplete: true };
await duplicateHeadModel.onCompleting.handlers[0](
  duplicateHeadModel,
  duplicateHeadCompletingOptions
);
assert.equal(duplicateHeadCompletingOptions.allow, false);
assert.equal(duplicateHeadCompletingOptions.allowComplete, false);
assert.equal(
  duplicateHeadCompletingOptions.message,
  "Only one household member can be marked as Head."
);

duplicateHeadModel.data.hhq_household_members[1].member_relationship_to_head = 2;
duplicateHeadModel.onValueChanged.handlers[0](duplicateHeadModel, {
  name: "member_relationship_to_head",
  value: 2
});
assert.deepEqual(firstRelationshipQuestion.errors, []);
assert.deepEqual(secondRelationshipQuestion.errors, []);

const enforceSingleHeadMembers = [
  { member_name: "Asha", member_relationship_to_head: 1 },
  { member_name: "Dcss", member_relationship_to_head: 1 }
];
const enforceSecondRelationshipQuestion = createQuestion(
  "member_relationship_to_head",
  enforceSingleHeadMembers[1]
);
const enforceSingleHeadModel = createModel(
  { hhq_household_members: enforceSingleHeadMembers },
  [createQuestion("member_relationship_to_head", enforceSingleHeadMembers[0]), enforceSecondRelationshipQuestion]
);

attachHouseholdSurveyBehaviors(
  enforceSingleHeadModel,
  { form_code: "HHQ" },
  () => {},
  {
    findExistingHousehold: async () => null
  }
);

enforceSingleHeadModel.onValueChanged.handlers[0](enforceSingleHeadModel, {
  name: "member_relationship_to_head",
  value: 1,
  question: enforceSecondRelationshipQuestion
});

assert.deepEqual(
  enforceSingleHeadModel.getValue("hhq_household_members").map((member) => member.member_relationship_to_head),
  [1, 1]
);

const ageDurationMember = {
  member_name: "Sita",
  member_residence_duration: { months: 1, years: 12 },
  member_age_years: 11
};
const ageQuestion = createQuestion("member_age_years", ageDurationMember);
const residenceDurationQuestion = createQuestion("member_residence_duration", ageDurationMember);
const ageDurationModel = createModel(
  { hhq_household_members: [ageDurationMember] },
  [residenceDurationQuestion, ageQuestion]
);

attachHouseholdSurveyBehaviors(
  ageDurationModel,
  { form_code: "HHQ" },
  () => {},
  {
    findExistingHousehold: async () => null
  }
);

ageDurationModel.onValueChanged.handlers[0](ageDurationModel, {
  name: "member_age_years",
  value: 11,
  question: ageQuestion
});

assert.deepEqual(ageQuestion.errors, [
  "Age in completed years cannot be less than years continuously living here."
]);
assert.deepEqual(residenceDurationQuestion.errors, []);

const eligibilityMembers = [
  {
    member_name: "Male Adult",
    member_sex: 1,
    member_age_years: 30,
    member_marital_status: 1
  },
  {
    member_name: "Never Married Woman",
    member_sex: 2,
    member_age_years: 25,
    member_marital_status: 7
  },
  {
    member_name: "Young Married Woman",
    member_sex: 2,
    member_age_years: 17,
    member_marital_status: 1
  },
  {
    member_name: "Twelve Year Old Female",
    member_sex: 2,
    member_age_years: 12
  },
  {
    member_name: "Eligible Woman",
    member_sex: 2,
    member_age_years: 35,
    member_marital_status: 1
  }
];
const eligibilityModel = createModel({ hhq_household_members: eligibilityMembers });
attachHouseholdSurveyBehaviors(
  eligibilityModel,
  { form_code: "HHQ" },
  () => {},
  {
    findExistingHousehold: async () => null
  }
);

eligibilityModel.onValueChanged.handlers[0](eligibilityModel, {
  name: "member_marital_status",
  value: 1
});

assert.deepEqual(
  eligibilityModel.getValue("hhq_household_members").map(
    (member) => member.member_woman_questionnaire_eligible
  ),
  [2, 2, 2, 2, 1]
);
assert.equal(eligibilityModel.getValue("hhq_total_eligible_women"), 1);

const ageValidateOptions = {
  name: "member_age_years",
  question: ageQuestion,
  value: 11,
  error: ""
};
ageDurationModel.onValidateQuestion.handlers[0](ageDurationModel, ageValidateOptions);
assert.equal(
  ageValidateOptions.error,
  "Age in completed years cannot be less than years continuously living here."
);

const ageDurationCompletingOptions = { allow: true, allowComplete: true };
await ageDurationModel.onCompleting.handlers[0](
  ageDurationModel,
  ageDurationCompletingOptions
);
assert.equal(ageDurationCompletingOptions.allow, false);
assert.equal(ageDurationCompletingOptions.allowComplete, false);
assert.equal(
  ageDurationCompletingOptions.message,
  "Age in completed years cannot be less than years continuously living here."
);

ageDurationModel.data.hhq_household_members[0].member_age_years = 12;
ageDurationModel.onValueChanged.handlers[0](ageDurationModel, {
  name: "member_age_years",
  value: 12,
  question: ageQuestion
});
assert.deepEqual(ageQuestion.errors, []);

console.log("Validated HHQ duplicate household checks.");
