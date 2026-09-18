export const BHQ_RESIDENCE_DURATION_FIELD = "member_residence_duration";
export const BHQ_RESIDENCE_MONTHS_ITEM = "months";

export const BHQ_VISITOR_CONFIRMATION_MESSAGE =
  "Are you sure this person is a visitor? Confirm and check: is this person a visitor or a member of this household?";

export function shouldPromptBhqVisitorConfirmation(question, item, typedText) {
  return question?.name === BHQ_RESIDENCE_DURATION_FIELD &&
    item?.name === BHQ_RESIDENCE_MONTHS_ITEM &&
    String(typedText ?? "") === "00";
}

export function clearBhqResidenceMonths(question) {
  if (question?.name !== BHQ_RESIDENCE_DURATION_FIELD) return false;
  const currentValue = question.value && typeof question.value === "object"
    ? { ...question.value }
    : {};
  delete currentValue[BHQ_RESIDENCE_MONTHS_ITEM];
  const monthsItem = (question.items || []).find(
    (item) => item.name === BHQ_RESIDENCE_MONTHS_ITEM
  );
  if (monthsItem) {
    if (typeof monthsItem.clearValue === "function") monthsItem.clearValue();
    else monthsItem.value = undefined;
  }
  question.value = Object.keys(currentValue).length ? currentValue : undefined;
  question.clearErrors?.();
  return true;
}
