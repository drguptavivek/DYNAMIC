import assert from "node:assert/strict";

import {
  confirmCommittedHhqMobileNumber,
  getHhqMobileNumberForCommittedPanel,
  markHhqMobilePanelChildren,
  shouldDeferMobileConfirmationToPanelCommit,
} from "../components/forms/renderers/mobileNumberConfirmation.js";

function panelWithMobile(value) {
  const mobileQuestion = { name: "mobile_number", value };
  return {
    mobileQuestion,
    getQuestionByName(name) {
      return name === "mobile_number" ? mobileQuestion : null;
    },
  };
}

const hhqMobilePanel = { name: "hhq_contact_mobile_numbers" };
const newEntry = panelWithMobile(" 9999999999 ");

assert.equal(shouldDeferMobileConfirmationToPanelCommit(newEntry.mobileQuestion), false);
markHhqMobilePanelChildren(hhqMobilePanel, newEntry);
assert.equal(shouldDeferMobileConfirmationToPanelCommit(newEntry.mobileQuestion), true);
assert.equal(getHhqMobileNumberForCommittedPanel(hhqMobilePanel, newEntry), "9999999999");
let confirmations = 0;
assert.equal(confirmCommittedHhqMobileNumber(hhqMobilePanel, newEntry, () => confirmations += 1), true);
assert.equal(confirmations, 1);

const editedEntry = panelWithMobile("8888888888");
markHhqMobilePanelChildren(hhqMobilePanel, editedEntry);
assert.equal(shouldDeferMobileConfirmationToPanelCommit(editedEntry.mobileQuestion), true);
assert.equal(getHhqMobileNumberForCommittedPanel(hhqMobilePanel, editedEntry), "8888888888");
assert.equal(confirmCommittedHhqMobileNumber(hhqMobilePanel, editedEntry, () => confirmations += 1), true);
assert.equal(confirmations, 2);

const emptyEntry = panelWithMobile("  ");
assert.equal(getHhqMobileNumberForCommittedPanel(hhqMobilePanel, emptyEntry), "");
assert.equal(confirmCommittedHhqMobileNumber(hhqMobilePanel, emptyEntry, () => confirmations += 1), false);
assert.equal(confirmations, 2);

const unrelatedPanel = { name: "some_other_panel" };
const unrelatedMobile = panelWithMobile("7777777777");
markHhqMobilePanelChildren(unrelatedPanel, unrelatedMobile);
assert.equal(shouldDeferMobileConfirmationToPanelCommit(unrelatedMobile.mobileQuestion), false);
assert.equal(getHhqMobileNumberForCommittedPanel(unrelatedPanel, unrelatedMobile), "");
assert.equal(confirmCommittedHhqMobileNumber(unrelatedPanel, unrelatedMobile, () => confirmations += 1), false);
assert.equal(confirmations, 2);

console.log("Validated deterministic BHQ mobile-number confirmation routing.");
