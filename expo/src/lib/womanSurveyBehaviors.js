export const WQ_AGE_FIELD = "wq_age_last_birthday";
export const WQ_CURRENT_MARITAL_STATUS_FIELD = "wq_current_marital_status";
export const WQ_LMP_FIELD = "wq_02_reproduction_when_did_your_last_menstrual_period_start";
export const WQ_HYSTERECTOMY_FIELD = "wq_02_reproduction_some_women_undergo_an_operation_to_remove";
export const WQ_STERILIZATION_FIELD = "wq_02_reproduction_are_you_or_your_partner_sterilized_probe_w";
export const WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD = "wq_pregnancy_tracking_eligible";
export const WQ_HUSBAND_NOT_IN_HOUSEHOLD_VALUE = "Husband not in household";
export const WQ_EVER_GIVEN_BIRTH_FIELD = "wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt";
export const WQ_CHILDREN_AT_HOME_FIELD = "wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom";
export const WQ_SONS_AT_HOME_FIELD = "wq_02_reproduction_how_many_sons_live_with_you";
export const WQ_DAUGHTERS_AT_HOME_FIELD = "wq_02_reproduction_how_many_daugthers_live_with_you";
export const WQ_CHILDREN_ELSEWHERE_FIELD = "wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom_2";
export const WQ_SONS_ELSEWHERE_FIELD = "wq_02_reproduction_how_many_sons_are_alive_but_do_not_live_wi";
export const WQ_DAUGHTERS_ELSEWHERE_FIELD = "wq_02_reproduction_how_many_daugthers_are_alive_but_do_not_li";
export const WQ_BORN_ALIVE_LATER_DIED_FIELD = "wq_02_reproduction_have_you_ever_given_birth_to_a_boy_or_girl";
export const WQ_BOYS_DEAD_FIELD = "wq_02_reproduction_how_many_boys_have_died";
export const WQ_GIRLS_DEAD_FIELD = "wq_02_reproduction_how_many_girls_have_died";
export const WQ_TOTAL_LIVE_BIRTHS_FIELD = "wq_02_reproduction_sum_answers_to_3_5_and_7_enter_total_if_no";
export const WQ_NON_LIVE_BIRTH_PREGNANCY_FIELD = "wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does";
export const WQ_PREGNANCY_LOSSES_FIELD = "wq_02_reproduction_how_many_miscarriages_abortions_and_stillb";
export const WQ_TOTAL_PREGNANCY_OUTCOMES_FIELD = "wq_02_reproduction_sum_answers_to_8_and_11_and_enter_total_if";
export const WQ_PAST_PREGNANCY_CHECK_FIELD = "wq_02_reproduction_check_12";

const WQ_REPRODUCTION_SUMMARY_SOURCE_FIELDS = [
  WQ_EVER_GIVEN_BIRTH_FIELD,
  WQ_CHILDREN_AT_HOME_FIELD,
  WQ_SONS_AT_HOME_FIELD,
  WQ_DAUGHTERS_AT_HOME_FIELD,
  WQ_CHILDREN_ELSEWHERE_FIELD,
  WQ_SONS_ELSEWHERE_FIELD,
  WQ_DAUGHTERS_ELSEWHERE_FIELD,
  WQ_BORN_ALIVE_LATER_DIED_FIELD,
  WQ_BOYS_DEAD_FIELD,
  WQ_GIRLS_DEAD_FIELD,
  WQ_TOTAL_LIVE_BIRTHS_FIELD,
  WQ_NON_LIVE_BIRTH_PREGNANCY_FIELD,
  WQ_PREGNANCY_LOSSES_FIELD,
];

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toCount(value) {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null || numericValue < 0) return 0;
  return Math.trunc(numericValue);
}

function toTwoDigitCount(value) {
  return String(Math.min(Math.max(toCount(value), 0), 99)).padStart(2, "0");
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

export function calculateWqTotalLiveBirthsValue(answers = {}) {
  const total =
    toCount(answers[WQ_SONS_AT_HOME_FIELD]) +
    toCount(answers[WQ_DAUGHTERS_AT_HOME_FIELD]) +
    toCount(answers[WQ_SONS_ELSEWHERE_FIELD]) +
    toCount(answers[WQ_DAUGHTERS_ELSEWHERE_FIELD]) +
    toCount(answers[WQ_BOYS_DEAD_FIELD]) +
    toCount(answers[WQ_GIRLS_DEAD_FIELD]);
  return toTwoDigitCount(total);
}

export function calculateWqTotalPregnancyOutcomesValue(answers = {}) {
  const total =
    toCount(answers[WQ_TOTAL_LIVE_BIRTHS_FIELD]) +
    toCount(answers[WQ_PREGNANCY_LOSSES_FIELD]);
  return toTwoDigitCount(total);
}

export function calculateWqPastPregnancyCheckValue(answers = {}) {
  return toCount(answers[WQ_TOTAL_PREGNANCY_OUTCOMES_FIELD]) > 0 ? 1 : 2;
}

function setModelValueIfChanged(model, fieldName, nextValue) {
  const question = model?.getQuestionByName?.(fieldName);
  if (!question) return;
  if (String(model.getValue(fieldName) ?? "") !== String(nextValue)) {
    model.setValue(fieldName, nextValue);
  }
}

function defaultCountsToZeroWhenNo(model, parentFieldName, childFieldNames = []) {
  if (Number(model?.getValue?.(parentFieldName)) !== 2) return;
  for (const childFieldName of childFieldNames) {
    setModelValueIfChanged(model, childFieldName, "00");
  }
}

export function applyWqReproductionSummary(model) {
  if (Number(model?.getValue?.(WQ_EVER_GIVEN_BIRTH_FIELD)) === 2) {
    for (const fieldName of [
      WQ_SONS_AT_HOME_FIELD,
      WQ_DAUGHTERS_AT_HOME_FIELD,
      WQ_SONS_ELSEWHERE_FIELD,
      WQ_DAUGHTERS_ELSEWHERE_FIELD,
    ]) {
      setModelValueIfChanged(model, fieldName, "00");
    }
  }
  defaultCountsToZeroWhenNo(model, WQ_CHILDREN_AT_HOME_FIELD, [
    WQ_SONS_AT_HOME_FIELD,
    WQ_DAUGHTERS_AT_HOME_FIELD,
  ]);
  defaultCountsToZeroWhenNo(model, WQ_CHILDREN_ELSEWHERE_FIELD, [
    WQ_SONS_ELSEWHERE_FIELD,
    WQ_DAUGHTERS_ELSEWHERE_FIELD,
  ]);
  defaultCountsToZeroWhenNo(model, WQ_BORN_ALIVE_LATER_DIED_FIELD, [
    WQ_BOYS_DEAD_FIELD,
    WQ_GIRLS_DEAD_FIELD,
  ]);
  defaultCountsToZeroWhenNo(model, WQ_NON_LIVE_BIRTH_PREGNANCY_FIELD, [
    WQ_PREGNANCY_LOSSES_FIELD,
  ]);

  const answers = {
    [WQ_EVER_GIVEN_BIRTH_FIELD]: model?.getValue?.(WQ_EVER_GIVEN_BIRTH_FIELD),
    [WQ_SONS_AT_HOME_FIELD]: model?.getValue?.(WQ_SONS_AT_HOME_FIELD),
    [WQ_DAUGHTERS_AT_HOME_FIELD]: model?.getValue?.(WQ_DAUGHTERS_AT_HOME_FIELD),
    [WQ_SONS_ELSEWHERE_FIELD]: model?.getValue?.(WQ_SONS_ELSEWHERE_FIELD),
    [WQ_DAUGHTERS_ELSEWHERE_FIELD]: model?.getValue?.(WQ_DAUGHTERS_ELSEWHERE_FIELD),
    [WQ_BOYS_DEAD_FIELD]: model?.getValue?.(WQ_BOYS_DEAD_FIELD),
    [WQ_GIRLS_DEAD_FIELD]: model?.getValue?.(WQ_GIRLS_DEAD_FIELD),
    [WQ_PREGNANCY_LOSSES_FIELD]: model?.getValue?.(WQ_PREGNANCY_LOSSES_FIELD),
  };
  const totalLiveBirths = calculateWqTotalLiveBirthsValue(answers);
  setModelValueIfChanged(model, WQ_TOTAL_LIVE_BIRTHS_FIELD, totalLiveBirths);

  const totalPregnancyOutcomes = calculateWqTotalPregnancyOutcomesValue({
    ...answers,
    [WQ_TOTAL_LIVE_BIRTHS_FIELD]: totalLiveBirths,
  });
  setModelValueIfChanged(model, WQ_TOTAL_PREGNANCY_OUTCOMES_FIELD, totalPregnancyOutcomes);
  setModelValueIfChanged(
    model,
    WQ_PAST_PREGNANCY_CHECK_FIELD,
    calculateWqPastPregnancyCheckValue({
      [WQ_TOTAL_PREGNANCY_OUTCOMES_FIELD]: totalPregnancyOutcomes,
    })
  );
  for (const fieldName of [
    WQ_TOTAL_LIVE_BIRTHS_FIELD,
    WQ_TOTAL_PREGNANCY_OUTCOMES_FIELD,
    WQ_PAST_PREGNANCY_CHECK_FIELD,
  ]) {
    const question = model?.getQuestionByName?.(fieldName);
    if (question) question.readOnly = true;
  }
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

export function shouldRecalculateWqReproductionSummary(fieldName) {
  return WQ_REPRODUCTION_SUMMARY_SOURCE_FIELDS.includes(fieldName);
}
