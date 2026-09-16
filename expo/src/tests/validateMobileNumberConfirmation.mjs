import assert from "node:assert/strict";

import {
  confirmCommittedHhqMobileNumber,
  getMobileNumberConfirmationMessage,
  getHhqMobileNumberForCommittedPanel,
  markHhqMobilePanelChildren,
  shouldConfirmMobileNumberOnInput,
  shouldDeferMobileConfirmationToPanelCommit,
  WQ_HUSBAND_PARTNER_MOBILE_CONFIRMATION_MESSAGE,
} from "../components/forms/renderers/mobileNumberConfirmation.js";

assert.equal(
  getMobileNumberConfirmationMessage({ name: "wq_husband_partner_mobile" }),
  WQ_HUSBAND_PARTNER_MOBILE_CONFIRMATION_MESSAGE,
);
assert.equal(
  WQ_HUSBAND_PARTNER_MOBILE_CONFIRMATION_MESSAGE,
  "Please read the mobile number to Respondent and confirm that the number is correct or not.",
);
assert.equal(
  getMobileNumberConfirmationMessage({ name: "wq_woman_mobile" }),
  "Read this mobile number to the Respondent and confirm whether the number is correct or not.",
);
assert.equal(shouldConfirmMobileNumberOnInput({ name: "wq_husband_partner_mobile" }), true);
assert.equal(shouldConfirmMobileNumberOnInput({ name: "hhq_contact_mobile" }), true);
assert.equal(shouldConfirmMobileNumberOnInput({ name: "hhq_contact_mobile_2" }), false);
assert.equal(shouldConfirmMobileNumberOnInput({ name: "hhq_household_landline_telephone" }), false);
assert.equal(shouldConfirmMobileNumberOnInput({ name: "some_other_number_input" }), false);

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
assert.equal(shouldConfirmMobileNumberOnInput(newEntry.mobileQuestion), false);
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

const wqMobileQuestion = { name: "wq_woman_mobile", value: "7777777777" };
const wqMobileEntry = {
  getQuestionByName(name) {
    return name === "wq_woman_mobile" ? wqMobileQuestion : null;
  },
};
const wqMobilePanel = { name: "wq_woman_mobile_numbers" };
markHhqMobilePanelChildren(wqMobilePanel, wqMobileEntry);
assert.equal(shouldDeferMobileConfirmationToPanelCommit(wqMobileQuestion), true);
assert.equal(getHhqMobileNumberForCommittedPanel(wqMobilePanel, wqMobileEntry), "7777777777");
assert.equal(confirmCommittedHhqMobileNumber(wqMobilePanel, wqMobileEntry, () => confirmations += 1), true);
assert.equal(confirmations, 3);

const emptyEntry = panelWithMobile("  ");
assert.equal(getHhqMobileNumberForCommittedPanel(hhqMobilePanel, emptyEntry), "");
assert.equal(confirmCommittedHhqMobileNumber(hhqMobilePanel, emptyEntry, () => confirmations += 1), false);
assert.equal(confirmations, 3);

const unrelatedPanel = { name: "some_other_panel" };
const unrelatedMobile = panelWithMobile("7777777777");
markHhqMobilePanelChildren(unrelatedPanel, unrelatedMobile);
assert.equal(shouldDeferMobileConfirmationToPanelCommit(unrelatedMobile.mobileQuestion), false);
assert.equal(getHhqMobileNumberForCommittedPanel(unrelatedPanel, unrelatedMobile), "");
assert.equal(confirmCommittedHhqMobileNumber(unrelatedPanel, unrelatedMobile, () => confirmations += 1), false);
assert.equal(confirmations, 3);

console.log("Validated deterministic repeatable mobile-number confirmation routing.");
