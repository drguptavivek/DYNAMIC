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

function createModel(data) {
  const householdNumberQuestion = {
    errors: [],
    addError(error) {
      this.errors.push(typeof error === "string" ? error : error.text || String(error));
    },
    clearErrors() {
      this.errors = [];
    }
  };

  return {
    data,
    onAfterRenderSurvey: createEvent(),
    onCompleting: createEvent(),
    onComplete: createEvent(),
    onAfterRenderQuestion: createEvent(),
    onDynamicPanelAdded: createEvent(),
    onDynamicPanelRemoved: createEvent(),
    onValueChanged: createEvent(),
    getQuestionByName(name) {
      return name === "hhq_household_number" ? householdNumberQuestion : null;
    },
    getAllQuestions() {
      return [];
    },
    getValue(name) {
      return this.data[name];
    },
    setValue(name, value) {
      this.data[name] = value;
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

assert.deepEqual(duplicateModel.householdNumberQuestion.errors, [
  "Household ID 1-02-0042-03 already exists. Use another structure or household number."
]);

const completingOptions = { allow: true, allowComplete: true };
await duplicateModel.onCompleting.handlers[0](duplicateModel, completingOptions);
assert.equal(completingOptions.allow, false);
assert.equal(completingOptions.allowComplete, false);
assert.equal(completingOptions.message, "Household ID 1-02-0042-03 already exists.");

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

await newModel.onValueChanged.handlers[0](newModel, {
  name: "hhq_household_number",
  value: "01"
});

assert.deepEqual(newModel.householdNumberQuestion.errors, []);

const newCompletingOptions = { allow: true, allowComplete: true };
await newModel.onCompleting.handlers[0](newModel, newCompletingOptions);
assert.equal(newCompletingOptions.allow, true);
assert.equal(newCompletingOptions.allowComplete, true);

console.log("Validated HHQ duplicate household checks.");
