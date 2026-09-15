export const HHQ_MOBILE_PANEL_NAME = "hhq_contact_mobile_numbers";
export const HHQ_MOBILE_FIELD_NAME = "mobile_number";

export function markHhqMobilePanelChildren(question, panel) {
  if (question?.name !== HHQ_MOBILE_PANEL_NAME) return;
  const mobileQuestion = panel?.getQuestionByName?.(HHQ_MOBILE_FIELD_NAME);
  if (mobileQuestion) mobileQuestion.__confirmMobileOnPanelCommit = true;
}

export function shouldDeferMobileConfirmationToPanelCommit(question) {
  return question?.__confirmMobileOnPanelCommit === true;
}

export function getHhqMobileNumberForCommittedPanel(question, panel) {
  if (question?.name !== HHQ_MOBILE_PANEL_NAME) return "";
  return String(panel?.getQuestionByName?.(HHQ_MOBILE_FIELD_NAME)?.value ?? "").trim();
}

export function confirmCommittedHhqMobileNumber(question, panel, showConfirmation) {
  const mobileNumber = getHhqMobileNumberForCommittedPanel(question, panel);
  if (!mobileNumber || typeof showConfirmation !== "function") return false;
  showConfirmation(mobileNumber);
  return true;
}
