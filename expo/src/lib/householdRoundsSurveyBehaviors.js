const HRF_CODE = "HRF";

export const HRF_NEW_WOMEN_PANEL = "hrf_new_women";
export const HRF_HOUSEHOLD_HEAD_ID_FIELD = "hrf_household_head_id";
export const HRF_NEW_WOMAN_LINE_NUMBER_FIELD = "hrf_new_woman_line_number";
export const HRF_NEW_WOMAN_AGE_FIELD = "hrf_new_woman_age_years";
export const HRF_NEW_WOMAN_MARITAL_STATUS_FIELD = "hrf_new_woman_current_marital_status";
export const HRF_NEW_WOMAN_ELIGIBLE_FIELD = "hrf_new_woman_pregnancy_tracking_eligible";

const hrfHouseholdContextByModel = new WeakMap();

const HRF_CALCULATION_SOURCE_FIELDS = new Set([
  HRF_NEW_WOMEN_PANEL,
  HRF_NEW_WOMAN_LINE_NUMBER_FIELD,
  HRF_NEW_WOMAN_AGE_FIELD,
  HRF_NEW_WOMAN_MARITAL_STATUS_FIELD,
]);

function isHouseholdRoundsForm(selectedForm) {
  return String(selectedForm?.form_code || "").toUpperCase() === HRF_CODE;
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toTwoDigitLineNumber(value) {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null || numericValue < 0) return "";
  return String(Math.trunc(numericValue)).padStart(2, "0").slice(-2);
}

function lineNumberFromIndividualId(individualId) {
  const lastPart = String(individualId || "").split("-").pop();
  return toFiniteNumber(lastPart);
}

function getMemberLineNumber(member) {
  return toFiniteNumber(member?.line_number) ?? lineNumberFromIndividualId(member?.individual_id);
}

function getMaxExistingLineNumber(members = []) {
  return members.reduce((maxLine, member) => {
    const lineNumber = getMemberLineNumber(member);
    return lineNumber === null ? maxLine : Math.max(maxLine, lineNumber);
  }, 0);
}

function getHouseholdHeadId(members = []) {
  const head = members.find((member) => {
    const relationship = toFiniteNumber(member?.relationship_to_head);
    return relationship === 1 || String(member?.relationship_to_head || "").toLowerCase() === "head";
  });
  return head?.individual_id || "";
}

function getPanelQuestionValue(panel, fieldName) {
  const question = panel?.getQuestionByName?.(fieldName);
  if (question) return question.value;
  const data = panel?.data;
  if (typeof data?.getValue === "function") return data.getValue(fieldName);
  return data?.[fieldName];
}

function setPanelQuestionValueIfChanged(panel, fieldName, nextValue) {
  const question = panel?.getQuestionByName?.(fieldName);
  if (!question) return;
  question.readOnly = true;
  if (question.value !== nextValue) {
    question.value = nextValue;
  }
}

export function calculateHrfPregnancyTrackingEligibilityValue(member = {}) {
  const age = toFiniteNumber(member[HRF_NEW_WOMAN_AGE_FIELD]);
  const maritalStatus = toFiniteNumber(member[HRF_NEW_WOMAN_MARITAL_STATUS_FIELD]);
  const isEligible =
    age !== null &&
    age >= 18 &&
    age <= 44 &&
    (maritalStatus === 1 || maritalStatus === 2 || maritalStatus === 8);
  return isEligible ? 1 : 2;
}

export function shouldRecalculateHrfNewWomanEligibility(fieldName) {
  return HRF_CALCULATION_SOURCE_FIELDS.has(fieldName);
}

export function applyHrfHouseholdContext(model, members = []) {
  if (!model) return;
  hrfHouseholdContextByModel.set(model, { members: Array.isArray(members) ? members : [] });
  applyHouseholdRoundsSurveyCalculations(model);
}

export function applyHouseholdRoundsSurveyCalculations(model) {
  if (!model) return;
  const context = hrfHouseholdContextByModel.get(model) || {};
  const members = Array.isArray(context.members) ? context.members : [];
  const householdHeadId = getHouseholdHeadId(members);

  if (householdHeadId && model.getValue?.(HRF_HOUSEHOLD_HEAD_ID_FIELD) !== householdHeadId) {
    model.setValue(HRF_HOUSEHOLD_HEAD_ID_FIELD, householdHeadId);
  }

  const panelQuestion = model.getQuestionByName?.(HRF_NEW_WOMEN_PANEL);
  const currentWomen = Array.isArray(model.getValue?.(HRF_NEW_WOMEN_PANEL))
    ? model.getValue(HRF_NEW_WOMEN_PANEL)
    : [];
  const firstNewLineNumber = getMaxExistingLineNumber(members) + 1;

  let changed = false;
  const nextWomen = currentWomen.map((member, index) => {
    const nextLineNumber = toTwoDigitLineNumber(firstNewLineNumber + index);
    const nextEligibility = calculateHrfPregnancyTrackingEligibilityValue(member);
    const currentLineNumber = member?.[HRF_NEW_WOMAN_LINE_NUMBER_FIELD];
    const currentEligibility = member?.[HRF_NEW_WOMAN_ELIGIBLE_FIELD];
    if (currentLineNumber === nextLineNumber && currentEligibility === nextEligibility) return member;
    changed = true;
    return { ...(member || {}), [HRF_NEW_WOMAN_LINE_NUMBER_FIELD]: nextLineNumber, [HRF_NEW_WOMAN_ELIGIBLE_FIELD]: nextEligibility };
  });

  if (changed) {
    model.setValue(HRF_NEW_WOMEN_PANEL, nextWomen);
  }

  (panelQuestion?.panels || []).forEach((panel, index) => {
    setPanelQuestionValueIfChanged(
      panel,
      HRF_NEW_WOMAN_LINE_NUMBER_FIELD,
      toTwoDigitLineNumber(firstNewLineNumber + index),
    );
    const member = {
      [HRF_NEW_WOMAN_AGE_FIELD]: getPanelQuestionValue(panel, HRF_NEW_WOMAN_AGE_FIELD),
      [HRF_NEW_WOMAN_MARITAL_STATUS_FIELD]: getPanelQuestionValue(
        panel,
        HRF_NEW_WOMAN_MARITAL_STATUS_FIELD,
      ),
    };
    setPanelQuestionValueIfChanged(
      panel,
      HRF_NEW_WOMAN_ELIGIBLE_FIELD,
      calculateHrfPregnancyTrackingEligibilityValue(member),
    );
  });
}

export function applyHrfNewWomanEligibilityCalculations(model) {
  applyHouseholdRoundsSurveyCalculations(model);
}

export function refreshHouseholdRoundsSurveyBehaviors(model, selectedForm) {
  if (!isHouseholdRoundsForm(selectedForm)) return;
  applyHouseholdRoundsSurveyCalculations(model);
}

export function attachHouseholdRoundsSurveyBehaviors(model, selectedForm) {
  if (!model || !isHouseholdRoundsForm(selectedForm)) return;

  const refresh = () => applyHouseholdRoundsSurveyCalculations(model);
  model.onAfterRenderSurvey?.add(refresh);
  model.onDynamicPanelAdded?.add(refresh);
  model.onDynamicPanelRemoved?.add(refresh);
  refresh();
}
