export const HHQ_MOBILE_PANEL_NAME = "hhq_contact_mobile_numbers";
export const HHQ_MOBILE_FIELD_NAME = "mobile_number";
export const HHQ_LEGACY_MOBILE_FIELD_NAME = "hhq_contact_mobile";
export const WQ_MOBILE_PANEL_NAME = "wq_woman_mobile_numbers";
export const WQ_MOBILE_FIELD_NAME = "wq_woman_mobile";
export const WQ_HUSBAND_PARTNER_MOBILE_FIELD_NAME = "wq_husband_partner_mobile";
export const WQ_HUSBAND_PARTNER_MOBILE_CONFIRMATION_MESSAGE =
  "Please read the mobile number to Respondent and confirm that the number is correct or not.";

export function getMobileNumberConfirmationMessage(question) {
  if (question?.name === WQ_HUSBAND_PARTNER_MOBILE_FIELD_NAME) {
    return WQ_HUSBAND_PARTNER_MOBILE_CONFIRMATION_MESSAGE;
  }
  return "Read this mobile number to the Respondent and confirm whether the number is correct or not.";
}

const MOBILE_NUMBER_INPUT_FIELD_NAMES = new Set([
  HHQ_MOBILE_FIELD_NAME,
  HHQ_LEGACY_MOBILE_FIELD_NAME,
  WQ_MOBILE_FIELD_NAME,
  WQ_HUSBAND_PARTNER_MOBILE_FIELD_NAME,
]);

export function shouldConfirmMobileNumberOnInput(question) {
  return MOBILE_NUMBER_INPUT_FIELD_NAMES.has(String(question?.name || "")) &&
    !shouldDeferMobileConfirmationToPanelCommit(question);
}

function getMobileFieldName(question) {
  if (question?.name === HHQ_MOBILE_PANEL_NAME) return HHQ_MOBILE_FIELD_NAME;
  if (question?.name === WQ_MOBILE_PANEL_NAME) return WQ_MOBILE_FIELD_NAME;
  return "";
}

export function markHhqMobilePanelChildren(question, panel) {
  const mobileFieldName = getMobileFieldName(question);
  if (!mobileFieldName) return;
  const mobileQuestion = panel?.getQuestionByName?.(mobileFieldName);
  if (mobileQuestion) mobileQuestion.__confirmMobileOnPanelCommit = true;
}

export function shouldDeferMobileConfirmationToPanelCommit(question) {
  return question?.__confirmMobileOnPanelCommit === true;
}

export function getHhqMobileNumberForCommittedPanel(question, panel) {
  const mobileFieldName = getMobileFieldName(question);
  if (!mobileFieldName) return "";
  return String(panel?.getQuestionByName?.(mobileFieldName)?.value ?? "").trim();
}

export function confirmCommittedHhqMobileNumber(question, panel, showConfirmation) {
  const mobileNumber = getHhqMobileNumberForCommittedPanel(question, panel);
  if (!mobileNumber || typeof showConfirmation !== "function") return false;
  showConfirmation(mobileNumber);
  return true;
}
