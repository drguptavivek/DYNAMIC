export const WQ_AGE_FIELD = "wq_age_last_birthday";
export const WQ_CURRENT_MARITAL_STATUS_FIELD = "wq_current_marital_status";
export const WQ_LMP_FIELD = "wq_02_reproduction_when_did_your_last_menstrual_period_start";
export const WQ_HYSTERECTOMY_FIELD = "wq_02_reproduction_some_women_undergo_an_operation_to_remove";
export const WQ_STERILIZATION_FIELD = "wq_02_reproduction_are_you_or_your_partner_sterilized_probe_w";
export const WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD = "wq_pregnancy_tracking_eligible";
export const WQ_HUSBAND_NOT_IN_HOUSEHOLD_VALUE = "Husband not in household";

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeLineNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "00";
  return String(Math.max(0, Math.trunc(numericValue))).padStart(2, "0").slice(-2);
}

function memberSexLabel(sex) {
  if (String(sex) === "1") return "Male";
  if (String(sex) === "2") return "Female";
  return "";
}

function isEligibleWqHusbandPartnerMember(member) {
  return String(member?.sex) === "1" && Number(member?.age_years) > 15;
}

function isEligibleWqWomanMember(member) {
  return String(member?.sex) === "2" && Number(member?.age_years) >= 15;
}

function deriveMemberLineNumber(member) {
  const idParts = String(member?.individual_id || "").split("-");
  return normalizeLineNumber(
    member?.line_number ??
      idParts[idParts.length - 1]
  );
}

export function getWqOutsideHouseholdHusbandLineNumber({
  currentWomanId = "",
  currentWomanLineNumber = "",
  members = [],
} = {}) {
  const fallbackLineNumber = normalizeLineNumber(currentWomanLineNumber);
  const currentWomanIdParts = String(currentWomanId || "").split("-");
  const currentLineNumber =
    currentWomanId && String(currentWomanId).includes("-")
      ? normalizeLineNumber(currentWomanIdParts[currentWomanIdParts.length - 1])
      : fallbackLineNumber;
  const women = members
    .filter(isEligibleWqWomanMember)
    .map((member) => ({
      ...member,
      normalizedLineNumber: deriveMemberLineNumber(member),
    }))
    .sort((a, b) => Number(a.normalizedLineNumber) - Number(b.normalizedLineNumber));
  const index = women.findIndex((member) => {
    if (currentWomanId && String(member.individual_id) === String(currentWomanId)) return true;
    return currentLineNumber && member.normalizedLineNumber === currentLineNumber;
  });
  if (index <= 0) return "00";
  return normalizeLineNumber(100 - index);
}

export function buildWqHusbandPartnerChoices(members = [], options = {}) {
  const outsideLineNumber = getWqOutsideHouseholdHusbandLineNumber({
    ...options,
    members,
  });
  const memberChoices = members
    .filter((member) => member?.member_name && isEligibleWqHusbandPartnerMember(member))
    .map((member) => {
      const lineNumber = normalizeLineNumber(member.line_number);
      const age = member.age_years === undefined || member.age_years === null
        ? ""
        : `${member.age_years}y`;
      const detail = [member.individual_id, memberSexLabel(member.sex), age]
        .filter(Boolean)
        .join(" | ");
      return {
        value: String(member.member_name),
        text: `${lineNumber} - ${member.member_name}`,
        detail,
        lineNumber,
        memberId: member.individual_id || "",
      };
    });
  return [
    ...memberChoices,
    {
      value: WQ_HUSBAND_NOT_IN_HOUSEHOLD_VALUE,
      text: WQ_HUSBAND_NOT_IN_HOUSEHOLD_VALUE,
      detail: `Line number will be set to ${outsideLineNumber}`,
      lineNumber: outsideLineNumber,
      memberId: "",
    },
  ];
}

export function calculateWqPregnancyTrackingEligibilityValue(answers = {}) {
  const age = toFiniteNumber(answers[WQ_AGE_FIELD]);
  const maritalStatus = toFiniteNumber(answers[WQ_CURRENT_MARITAL_STATUS_FIELD]);
  const lmp = toFiniteNumber(answers[WQ_LMP_FIELD]);
  const hysterectomy = toFiniteNumber(answers[WQ_HYSTERECTOMY_FIELD]);
  const sterilization = toFiniteNumber(answers[WQ_STERILIZATION_FIELD]);
  const isEligible =
    age !== null &&
    age >= 18 &&
    age <= 44 &&
    (maritalStatus === 1 || maritalStatus === 2 || maritalStatus === 8) &&
    lmp !== null &&
    lmp !== 993 &&
    lmp !== 994 &&
    hysterectomy === 2 &&
    sterilization === 4;
  return isEligible ? 1 : 2;
}

export function applyWqPregnancyTrackingEligibility(model) {
  const question = model?.getQuestionByName?.(WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD);
  if (!question) return;
  const answers = {
    [WQ_AGE_FIELD]: model.getValue(WQ_AGE_FIELD),
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: model.getValue(WQ_CURRENT_MARITAL_STATUS_FIELD),
    [WQ_LMP_FIELD]: model.getValue(WQ_LMP_FIELD),
    [WQ_HYSTERECTOMY_FIELD]: model.getValue(WQ_HYSTERECTOMY_FIELD),
    [WQ_STERILIZATION_FIELD]: model.getValue(WQ_STERILIZATION_FIELD),
  };
  const nextValue = calculateWqPregnancyTrackingEligibilityValue(answers);
  if (Number(model.getValue(WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD)) !== nextValue) {
    model.setValue(WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD, nextValue);
  }
  question.readOnly = true;
}

export function shouldRecalculateWqPregnancyTrackingEligibility(fieldName) {
  return [
    WQ_AGE_FIELD,
    WQ_CURRENT_MARITAL_STATUS_FIELD,
    WQ_LMP_FIELD,
    WQ_HYSTERECTOMY_FIELD,
    WQ_STERILIZATION_FIELD,
  ].includes(fieldName);
}
