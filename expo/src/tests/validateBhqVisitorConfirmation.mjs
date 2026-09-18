import assert from "node:assert/strict";

const {
  BHQ_RESIDENCE_DURATION_FIELD,
  BHQ_VISITOR_CONFIRMATION_MESSAGE,
  clearBhqResidenceMonths,
  shouldPromptBhqVisitorConfirmation,
} = await import("../components/forms/renderers/bhqVisitorConfirmation.js");

const residenceQuestion = {
  name: BHQ_RESIDENCE_DURATION_FIELD,
  value: { years: 0, months: 0 },
  items: [
    { name: "years", value: 0 },
    { name: "months", value: 0 },
  ],
  clearErrors() {
    this.errorsCleared = true;
  },
};
const monthsItem = residenceQuestion.items[1];

assert.equal(
  BHQ_VISITOR_CONFIRMATION_MESSAGE,
  "Are you sure this person is a visitor? Confirm and check: is this person a visitor or a member of this household?",
);

assert.equal(shouldPromptBhqVisitorConfirmation(residenceQuestion, monthsItem, "00"), true);
assert.equal(shouldPromptBhqVisitorConfirmation(residenceQuestion, monthsItem, "0"), false);
assert.equal(shouldPromptBhqVisitorConfirmation(residenceQuestion, monthsItem, "10"), false);
assert.equal(
  shouldPromptBhqVisitorConfirmation({ name: "some_other_question" }, monthsItem, "00"),
  false,
);
assert.equal(
  shouldPromptBhqVisitorConfirmation(residenceQuestion, { name: "years" }, "00"),
  false,
);

assert.equal(clearBhqResidenceMonths(residenceQuestion), true);
assert.deepEqual(residenceQuestion.value, { years: 0 });
assert.equal(monthsItem.value, undefined);
assert.equal(residenceQuestion.errorsCleared, true);

const monthsOnlyQuestion = {
  name: BHQ_RESIDENCE_DURATION_FIELD,
  value: { months: 0 },
  items: [{ name: "months", value: 0 }],
};
assert.equal(clearBhqResidenceMonths(monthsOnlyQuestion), true);
assert.equal(monthsOnlyQuestion.value, undefined);

console.log("Validated BHQ Q6_i visitor confirmation routing.");
