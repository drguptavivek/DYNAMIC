import assert from "node:assert/strict";

import {
  FINAL_SUBMISSION_CONFIRMATION_MESSAGE,
  requestFinalSubmissionConfirmation,
  waitForSubmissionAcknowledgement,
} from "../modules/households/finalSubmissionAlerts.js";

const alerts = [];
let submitCount = 0;
const showAlert = (title, message, buttons, options) => {
  alerts.push({ title, message, buttons, options });
};

requestFinalSubmissionConfirmation({
  showAlert,
  onConfirm: () => {
    submitCount += 1;
  },
});

assert.equal(alerts[0].message, FINAL_SUBMISSION_CONFIRMATION_MESSAGE);
assert.deepEqual(alerts[0].buttons.map((button) => button.text), ["No", "Yes"]);
assert.equal(submitCount, 0, "opening the confirmation must not submit the form");

alerts[0].buttons[0].onPress?.();
assert.equal(submitCount, 0, "No must leave the form unsubmitted");

alerts[0].buttons[1].onPress();
assert.equal(submitCount, 1, "Yes must invoke final submission once");

const acknowledgement = waitForSubmissionAcknowledgement(showAlert);
assert.equal(alerts[1].title, "Form is submitted");
assert.equal(alerts[1].options.cancelable, false);

let acknowledged = false;
acknowledgement.then(() => {
  acknowledged = true;
});
await Promise.resolve();
assert.equal(acknowledged, false, "completion must wait for the success acknowledgement");

alerts[1].buttons[0].onPress();
await acknowledgement;
assert.equal(acknowledged, true);

console.log("Final submission alert flow validation passed.");
