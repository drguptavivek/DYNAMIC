/**
 * Installs DYNAMIC household-specific validation and display behavior on a Survey Core model.
 */
const HHQ_CODE = "HHQ";
const HH_MEMBER_PANEL = "hhq_household_members";
const HHQ_HANDWASHING_PLACE_FIELD = "hhq_we_like_learn_about_places_that_households_use";
const HHQ_HANDWASHING_OBSERVATION_FIELD = "hhq_observation_only";
const HHQ_RESULT_INTERVIEW_FIELD = "hhq_result_interview";
const HHQ_RESULT_INTERVIEW_OTHER_SPECIFY_FIELD = "hhq_result_interview_other_specify";
const HHQ_OUTCOME_COMPLETED = 1;
const HHQ_OUTCOME_OTHER_SPECIFY = 10;
const HH_MEMBER_GENERATED_FIELDS = new Set([
  "member_line_number",
  "member_individual_id",
  "member_woman_questionnaire_eligible"
]);
const HH_MEMBER_TOTAL_FIELDS = [
  "hhq_total_household_members",
  "hhq_total_eligible_women",
];
const HOUSEHOLD_ID_DISPLAY_FIELD = "hhq_household_id";
const HOUSEHOLD_ID_FIELDS = new Set([
  "hhq_site_id",
  "hhq_locality_code",
  "hhq_structure_map_id",
  "hhq_household_number"
]);
const HOUSEHOLD_NUMBER_FIELD = "hhq_household_number";
const OPTIONAL_HHQ_QUESTIONS = new Set([
  "hhq_household_usually_make_water_safe_drink_anything_else",
]);
const MEMBER_NAME_LABEL_FIELDS = new Set([
  "member_relationship_to_head",
  "member_sex",
  "member_residence_duration",
  "member_age_years",
  "member_marital_status",
  "member_birth_registration_status",
  "member_ever_attended_school",
  "member_highest_grade_completed"
]);
const MEMBER_RELATIONSHIP_FIELD = "member_relationship_to_head";
const MEMBER_RESIDENCE_DURATION_FIELD = "member_residence_duration";
const MEMBER_AGE_YEARS_FIELD = "member_age_years";
const HEAD_RELATIONSHIP_VALUE = 1;
const DUPLICATE_HEAD_MESSAGE = "Only one household member can be marked as Head.";
const AGE_LESS_THAN_RESIDENCE_MESSAGE =
  "Age in completed years cannot be less than years continuously living here.";
const AGE_RESIDENCE_ERROR_ATTR = "data-dynamic-age-residence-error";
const renderedQuestionElements = new WeakMap();
const renderedAgeQuestions = new Set();
const duplicateHouseholdMessages = new WeakMap();

function isWomanQuestionnaireEligible(member) {
  const sex = parseFiniteNumber(member?.member_sex);
  const ageYears = parseFiniteNumber(member?.member_age_years);
  const maritalStatus = parseFiniteNumber(member?.member_marital_status);
  return (
    sex === 2 &&
    ageYears !== null &&
    ageYears >= 18 &&
    ageYears <= 49 &&
    maritalStatus !== null &&
    maritalStatus !== 7
  );
}

function isEmptyRosterValue(value) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.values(value).every(isEmptyRosterValue);
  return false;
}

function hasEnteredHouseholdMemberValue(member) {
  if (!member || typeof member !== "object" || Array.isArray(member)) return false;
  return Object.entries(member).some(
    ([key, value]) => !HH_MEMBER_GENERATED_FIELDS.has(key) && !isEmptyRosterValue(value)
  );
}

function clearModelValue(model, name) {
  if (typeof model.clearValue === "function") {
    model.clearValue(name);
    return;
  }
  model.setValue(name, undefined);
}

function hasHhqObservationSelections(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

function getForcedHhqOutcomeResult(model) {
  const observationPlace = parseFiniteNumber(model.getValue(HHQ_HANDWASHING_PLACE_FIELD));
  if (observationPlace === 2 || observationPlace === 3) {
    return HHQ_OUTCOME_COMPLETED;
  }
  if (observationPlace === 4) {
    return HHQ_OUTCOME_OTHER_SPECIFY;
  }
  if (
    observationPlace === 1 &&
    hasHhqObservationSelections(model.getValue(HHQ_HANDWASHING_OBSERVATION_FIELD))
  ) {
    return HHQ_OUTCOME_COMPLETED;
  }
  return null;
}

function applyForcedHhqOutcomeResult(model) {
  const forcedResult = getForcedHhqOutcomeResult(model);
  if (forcedResult === null) return;

  if (model.getValue(HHQ_RESULT_INTERVIEW_FIELD) !== forcedResult) {
    model.setValue(HHQ_RESULT_INTERVIEW_FIELD, forcedResult);
  }
  if (forcedResult !== HHQ_OUTCOME_OTHER_SPECIFY) {
    clearModelValue(model, HHQ_RESULT_INTERVIEW_OTHER_SPECIFY_FIELD);
  }
}

function clearHouseholdListingCalculations(model) {
  clearModelValue(model, HH_MEMBER_PANEL);
  HH_MEMBER_TOTAL_FIELDS.forEach((field) => clearModelValue(model, field));
}

function normalizeHouseholdIdPart(value, width) {
  const text = String(value || "").trim();
  return width ? text.padStart(width, "0") : text;
}

function buildDisplayHouseholdId(model) {
  const siteId = normalizeHouseholdIdPart(model.getValue("hhq_site_id"));
  const localityCode = normalizeHouseholdIdPart(model.getValue("hhq_locality_code"), 2);
  const structureNumber = String(model.getValue("hhq_structure_map_id") || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(structureNumber)) return "";
  const householdNumber = normalizeHouseholdIdPart(model.getValue("hhq_household_number"), 2);
  if (!siteId || !localityCode || !structureNumber || !householdNumber) return "";
  return [siteId, localityCode, structureNumber, householdNumber].join("-");
}

function buildDisplayMemberId(model, lineNumber) {
  const householdId = buildDisplayHouseholdId(model);
  if (!householdId || !lineNumber) return "";
  return `${householdId}-${normalizeHouseholdIdPart(lineNumber, 2)}`;
}

function updateHouseholdIdCalculation(model) {
  const question = model.getQuestionByName?.(HOUSEHOLD_ID_DISPLAY_FIELD);
  if (!question) return;
  const householdId = buildDisplayHouseholdId(model);
  if (householdId) model.setValue(HOUSEHOLD_ID_DISPLAY_FIELD, householdId);
  else clearModelValue(model, HOUSEHOLD_ID_DISPLAY_FIELD);
  question.readOnly = true;
}

function isHouseholdMemberPanelApplicable(model) {
  const question = model.getQuestionByName?.(HH_MEMBER_PANEL);
  if (!question) return false;
  return question.isVisible !== false && question.page?.isVisible !== false;
}

function updateHouseholdListingCalculations(model) {
  const rosterQuestion = model.getQuestionByName?.(HH_MEMBER_PANEL);
  if (!isHouseholdMemberPanelApplicable(model)) {
    clearHouseholdListingCalculations(model);
    return;
  }

  const members = Array.isArray(model.getValue(HH_MEMBER_PANEL))
    ? model.getValue(HH_MEMBER_PANEL)
    : [];
  const enteredMembers = members.filter(hasEnteredHouseholdMemberValue);
  const normalizedMembers = enteredMembers.map((member, index) => ({
    ...member,
    member_line_number: normalizeHouseholdIdPart(index + 1, 2),
    member_individual_id: buildDisplayMemberId(model, index + 1),
    member_woman_questionnaire_eligible: isWomanQuestionnaireEligible(member) ? 1 : 2
  }));

  if (!normalizedMembers.length) {
    clearHouseholdListingCalculations(model);
    return;
  }

  syncGeneratedMemberFieldsToLivePanels(rosterQuestion, normalizedMembers);

  if (JSON.stringify(members) !== JSON.stringify(normalizedMembers)) {
    model.setValue(HH_MEMBER_PANEL, normalizedMembers);
    syncGeneratedMemberFieldsToLivePanels(rosterQuestion, normalizedMembers);
  }

  model.setValue("hhq_total_household_members", normalizedMembers.length || undefined);
  model.setValue(
    "hhq_total_eligible_women",
    normalizedMembers.filter(isWomanQuestionnaireEligible).length
  );
}

function syncGeneratedMemberFieldsToLivePanels(rosterQuestion, normalizedMembers) {
  (rosterQuestion?.panels || []).forEach((panel, index) => {
    const member = normalizedMembers[index];
    if (!member) return;
    HH_MEMBER_GENERATED_FIELDS.forEach((fieldName) => {
      const question = panel.getQuestionByName?.(fieldName);
      if (!question) return;
      const value = member[fieldName];
      if (question.value !== value) question.value = value;
    });
  });
}

function refreshQuestionTitles(model) {
  model.getAllQuestions().forEach((question) => {
    question.locTitle?.strChanged?.();
  });
}

function getPanelData(question) {
  const data = question?.parent?.data;
  if (typeof data?.getValue === "function") {
    return Object.fromEntries(
      (data.questions || question?.parent?.questions || [])
        .filter((panelQuestion) => panelQuestion?.name)
        .map((panelQuestion) => [panelQuestion.name, data.getValue(panelQuestion.name)])
    );
  }
  return data || null;
}

function getPanelMemberName(question) {
  return getPanelData(question)?.member_name || "";
}

function italicizeMemberNameInTitle(options) {
  if (!MEMBER_NAME_LABEL_FIELDS.has(options.question.name)) return;
  const memberName = getPanelMemberName(options.question);
  if (!memberName) return;

  const title = options.htmlElement.querySelector(".sd-question__title");
  if (!title || title.dataset.dynamicNameItalicized === memberName) return;

  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const index = node.textContent.indexOf(memberName);
    if (index >= 0) {
      const before = node.textContent.slice(0, index);
      const after = node.textContent.slice(index + memberName.length);
      const italic = document.createElement("i");
      italic.textContent = memberName;
      node.replaceWith(
        document.createTextNode(before),
        italic,
        document.createTextNode(after)
      );
      title.dataset.dynamicNameItalicized = memberName;
      return;
    }
    node = walker.nextNode();
  }
}

function italicizeTextInElement(element, text) {
  if (!element || !text) return;
  if (element.querySelector("i")?.textContent === text) return;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.tagName === "I") return NodeFilter.FILTER_REJECT;
      return node.textContent.includes(text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    }
  });
  const node = walker.nextNode();
  if (!node) return;

  const index = node.textContent.indexOf(text);
  const before = node.textContent.slice(0, index);
  const after = node.textContent.slice(index + text.length);
  const italic = document.createElement("i");
  italic.textContent = text;
  node.replaceWith(
    document.createTextNode(before),
    italic,
    document.createTextNode(after)
  );
}

function italicizeVisibleMemberNames(model) {
  if (typeof document === "undefined") return;
  const members = model.getValue(HH_MEMBER_PANEL) || [];
  const names = members.map((member) => member?.member_name).filter(Boolean);
  if (!names.length) return;

  document.querySelectorAll(".sd-question__title").forEach((title) => {
    names.forEach((name) => italicizeTextInElement(title, name));
  });
}

function setDuplicateHouseholdError(model, duplicateHousehold) {
  const question = model.getQuestionByName(HOUSEHOLD_NUMBER_FIELD);
  if (!question) return;

  const previousMessage = duplicateHouseholdMessages.get(question);
  if (previousMessage) clearQuestionMessage(question, previousMessage);
  if (!duplicateHousehold) {
    duplicateHouseholdMessages.delete(question);
    return;
  }

  const message = `Household ID ${duplicateHousehold.household_id} already exists. Use another structure or household number.`;
  addQuestionMessage(question, message);
  duplicateHouseholdMessages.set(question, message);
}

function getErrorText(error) {
  if (typeof error === "string") return error;
  if (typeof error?.text === "string") return error.text;
  if (typeof error?.getText === "function") return error.getText();
  return String(error || "");
}

function clearQuestionMessage(question, message) {
  if (Array.isArray(question?.errors)) {
    question.errors = question.errors.filter((error) => getErrorText(error) !== message);
  }
}

function addQuestionMessage(question, message) {
  if (!question?.addError) return;
  const hasMessage = Array.isArray(question.errors)
    ? question.errors.some((error) => getErrorText(error) === message)
    : false;
  if (!hasMessage) {
    question.addError(message);
  }
}

function getHeadMemberIndexes(members) {
  return members
    .map((member, index) =>
      Number(member?.member_relationship_to_head) === HEAD_RELATIONSHIP_VALUE ? index : -1
    )
    .filter((index) => index >= 0);
}

function getRelationshipQuestionIndex(question, members, fallbackIndex) {
  const panelData = getPanelData(question);
  const objectIndex = members.indexOf(panelData);
  if (objectIndex >= 0) return objectIndex;

  const lineNumber = Number(panelData?.member_line_number);
  return lineNumber > 0 ? lineNumber - 1 : fallbackIndex;
}

function notifyDuplicateHouseholdHead(model) {
  const members = Array.isArray(model.getValue(HH_MEMBER_PANEL))
    ? model.getValue(HH_MEMBER_PANEL)
    : [];
  const headIndexes = getHeadMemberIndexes(members);
  if (headIndexes.length > 1) {
    model.notify?.(DUPLICATE_HEAD_MESSAGE, "error");
  }
}

function validateSingleHouseholdHead(model) {
  const members = model.getValue(HH_MEMBER_PANEL) || [];
  const headIndexes = getHeadMemberIndexes(members);
  const hasDuplicateHead = headIndexes.length > 1;
  const duplicateIndexes = new Set(hasDuplicateHead ? headIndexes : []);

  model
    .getAllQuestions()
    .filter((question) => question.name === MEMBER_RELATIONSHIP_FIELD)
    .forEach((question, questionIndex) => {
      clearQuestionMessage(question, DUPLICATE_HEAD_MESSAGE);
      if (duplicateIndexes.has(getRelationshipQuestionIndex(question, members, questionIndex))) {
        addQuestionMessage(question, DUPLICATE_HEAD_MESSAGE);
      }
    });

  return hasDuplicateHead;
}

function parseFiniteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getResidenceYears(member) {
  const duration = member?.[MEMBER_RESIDENCE_DURATION_FIELD];
  if (duration && typeof duration === "object" && !Array.isArray(duration)) {
    return parseFiniteNumber(duration.years);
  }
  return null;
}

function hasAgeResidenceMismatch(member) {
  const ageYears = parseFiniteNumber(member?.[MEMBER_AGE_YEARS_FIELD]);
  const residenceYears = getResidenceYears(member);
  return ageYears !== null && residenceYears !== null && ageYears < residenceYears;
}

function validateAgeAgainstResidenceDuration(model) {
  const members = Array.isArray(model.getValue(HH_MEMBER_PANEL))
    ? model.getValue(HH_MEMBER_PANEL)
    : [];
  const invalidIndexes = new Set(
    members
      .map((member, index) => {
        return hasAgeResidenceMismatch(member) ? index : -1;
      })
      .filter((index) => index >= 0)
  );

  model
    .getAllQuestions()
    .filter((question) => question.name === MEMBER_AGE_YEARS_FIELD)
    .forEach((question, questionIndex) => {
      clearQuestionMessage(question, AGE_LESS_THAN_RESIDENCE_MESSAGE);
      if (invalidIndexes.has(getRelationshipQuestionIndex(question, members, questionIndex))) {
        addQuestionMessage(question, AGE_LESS_THAN_RESIDENCE_MESSAGE);
      }
    });

  return invalidIndexes.size > 0;
}

// Blocks committing a roster entry (DynamicPanelRenderer validates each
// panel question on "Add household member") when a second member is marked
// as Head. The inline message from validateSingleHouseholdHead is wiped by
// question.validate(), so the rule must also be asserted here.
function validateHeadQuestion(sender, options) {
  if (options.name !== MEMBER_RELATIONSHIP_FIELD) return;
  if (Number(options.value) !== HEAD_RELATIONSHIP_VALUE) return;
  const members = Array.isArray(sender.getValue(HH_MEMBER_PANEL))
    ? sender.getValue(HH_MEMBER_PANEL)
    : [];
  if (getHeadMemberIndexes(members).length > 1) {
    options.error = DUPLICATE_HEAD_MESSAGE;
  }
}

function validateAgeQuestion(sender, options) {
  if (options.name !== MEMBER_AGE_YEARS_FIELD) return;
  const member = getPanelData(options.question);
  if (hasAgeResidenceMismatch(member)) {
    options.error = AGE_LESS_THAN_RESIDENCE_MESSAGE;
  }
}

function hasAgeResidenceMismatchInElement(element) {
  const ageInput = element?.querySelector?.("input[type='number']");
  if (!ageInput) return false;

  let container = element.parentElement;
  for (let depth = 0; container && depth < 8; depth += 1) {
    const inputs = Array.from(container.querySelectorAll("input[type='number']"));
    const ageIndex = inputs.indexOf(ageInput);
    if (ageIndex > 0 && container.innerText?.includes("Since how long")) {
      const ageYears = parseFiniteNumber(ageInput.value);
      const residenceYears = parseFiniteNumber(inputs[ageIndex - 1]?.value);
      return ageYears !== null && residenceYears !== null && ageYears < residenceYears;
    }
    container = container.parentElement;
  }
  return false;
}

function renderAgeResidenceError(question) {
  const element = renderedQuestionElements.get(question);
  if (!element?.isConnected) return;
  let error = element.querySelector(`[${AGE_RESIDENCE_ERROR_ATTR}]`);
  const showError =
    hasAgeResidenceMismatch(getPanelData(question)) ||
    hasAgeResidenceMismatchInElement(element);

  if (!showError) {
    error?.remove();
    return;
  }

  if (!error) {
    error = document.createElement("div");
    error.setAttribute(AGE_RESIDENCE_ERROR_ATTR, "true");
    error.style.marginTop = "8px";
    error.style.color = "#d92d20";
    error.style.fontSize = "13px";
    error.style.fontWeight = "700";
    element.appendChild(error);
  }
  error.textContent = AGE_LESS_THAN_RESIDENCE_MESSAGE;
}

function refreshVisibleAgeResidenceErrors() {
  if (typeof document === "undefined") return;
  renderedAgeQuestions.forEach((question) => {
    const element = renderedQuestionElements.get(question);
    if (!element?.isConnected) {
      renderedAgeQuestions.delete(question);
      return;
    }
    renderAgeResidenceError(question);
  });
}

function applyMandatoryHhqQuestions(model) {
  model.getAllQuestions().forEach((question) => {
    if (!question?.name || question.readOnly || question.isReadOnly) return;
    if (
      question.name === HH_MEMBER_PANEL ||
      question.getType?.() === "paneldynamic" ||
      OPTIONAL_HHQ_QUESTIONS.has(question.name)
    ) {
      question.isRequired = false;
      return;
    }
    question.isRequired = true;
  });
}

function configureHouseholdRosterQuestion(model) {
  const roster = model.getQuestionByName?.(HH_MEMBER_PANEL);
  if (!roster) return;
  // First member opens automatically; after that the schedule page shows the
  // panel's own "Add household member" button whenever no editor is open, so
  // every usual member can be listed in one pass before the 02B check-listing
  // probes (which remain the final completeness check).
  roster.dynamicAutoOpenFirstEntry = true;
  roster.dynamicHideAddButton = false;
  roster.addPanelText = "Add household member";
  roster.panelAddText = "Add household member";
}

export function refreshHouseholdSurveyBehaviors(model, selectedForm) {
  if (selectedForm?.form_code !== HHQ_CODE) return;
  applyMandatoryHhqQuestions(model);
  configureHouseholdRosterQuestion(model);
  applyForcedHhqOutcomeResult(model);
  updateHouseholdIdCalculation(model);
  updateHouseholdListingCalculations(model);
  validateSingleHouseholdHead(model);
  validateAgeAgainstResidenceDuration(model);
  setTimeout(refreshVisibleAgeResidenceErrors, 0);
}

function normalizeHouseholdIdForComparison(value) {
  return String(value || "").trim();
}

function isAllowedExistingHousehold(existingHousehold, options = {}) {
  if (!existingHousehold?.household_id) return false;
  const existingHouseholdId = normalizeHouseholdIdForComparison(existingHousehold.household_id);
  const allowedHouseholdIds = [
    options.allowedExistingHouseholdId,
    ...(Array.isArray(options.allowedExistingHouseholdIds)
      ? options.allowedExistingHouseholdIds
      : [])
  ]
    .map(normalizeHouseholdIdForComparison)
    .filter(Boolean);

  return allowedHouseholdIds.includes(existingHouseholdId);
}

async function findBlockingExistingHousehold(data, options = {}) {
  const existingHousehold = options.findExistingHousehold
    ? await options.findExistingHousehold(data)
    : null;
  return isAllowedExistingHousehold(existingHousehold, options) ? null : existingHousehold;
}

export async function validateHouseholdSurveyForFinalization(model, options = {}) {
  if (validateSingleHouseholdHead(model)) {
    return { valid: false, message: DUPLICATE_HEAD_MESSAGE };
  }
  if (validateAgeAgainstResidenceDuration(model)) {
    return { valid: false, message: AGE_LESS_THAN_RESIDENCE_MESSAGE };
  }
  const existingHousehold = await findBlockingExistingHousehold(model.data, options);
  setDuplicateHouseholdError(model, existingHousehold);
  if (existingHousehold) {
    return {
      valid: false,
      message: `Household ID ${existingHousehold.household_id} already exists.`,
      existingHousehold,
    };
  }
  return { valid: true, message: "" };
}

export function attachHouseholdSurveyBehaviors(
  model,
  selectedForm,
  onHouseholdSave,
  options = {}
) {
  if (selectedForm?.form_code !== HHQ_CODE) return;

  applyMandatoryHhqQuestions(model);
  configureHouseholdRosterQuestion(model);
  model.checkErrorsMode = "onValueChanged";

  let duplicateCheckSequence = 0;
  let duplicateHousehold = null;

  async function checkDuplicateHousehold(sender) {
    const findExistingHousehold = options.findExistingHousehold;
    if (!findExistingHousehold) return null;

    const sequence = ++duplicateCheckSequence;
    const existing = await findBlockingExistingHousehold(sender.data, options);
    if (sequence !== duplicateCheckSequence) return duplicateHousehold;

    duplicateHousehold = existing || null;
    setDuplicateHouseholdError(sender, duplicateHousehold);
    return duplicateHousehold;
  }

  const householdNumberQuestion = model.getQuestionByName?.(HOUSEHOLD_NUMBER_FIELD);
  if (householdNumberQuestion) {
    householdNumberQuestion.runNativeDbCheck = () => checkDuplicateHousehold(model);
  }

  model.onAfterRenderSurvey.add((sender) =>
    refreshHouseholdSurveyBehaviors(sender, selectedForm)
  );
  model.onCompleting.add(async (sender, options) => {
    if (validateSingleHouseholdHead(sender)) {
      options.allow = false;
      options.allowComplete = false;
      options.message = DUPLICATE_HEAD_MESSAGE;
      return;
    }
    if (validateAgeAgainstResidenceDuration(sender)) {
      options.allow = false;
      options.allowComplete = false;
      options.message = AGE_LESS_THAN_RESIDENCE_MESSAGE;
      return;
    }

    const existing = await checkDuplicateHousehold(sender);
    if (existing) {
      options.allow = false;
      options.allowComplete = false;
      options.message = `Household ID ${existing.household_id} already exists.`;
    }
  });
  model.onValidateQuestion?.add((sender, options) => {
    validateHeadQuestion(sender, options);
    validateAgeQuestion(sender, options);
  });
  model.onComplete.add((sender) => onHouseholdSave?.(sender.data));
  model.onAfterRenderQuestion.add((sender, options) => {
    if (options.question.name === MEMBER_AGE_YEARS_FIELD) {
      renderedQuestionElements.set(options.question, options.htmlElement);
      renderedAgeQuestions.add(options.question);
      renderAgeResidenceError(options.question);
    }
    italicizeMemberNameInTitle(options);
  });
  model.onDynamicPanelAdded.add((sender, options) => {
    if (options?.question?.name === HH_MEMBER_PANEL) {
      refreshHouseholdSurveyBehaviors(sender, selectedForm);
    }
  });
  model.onDynamicPanelRemoved.add((sender, options) => {
    if (options?.question?.name === HH_MEMBER_PANEL) {
      refreshHouseholdSurveyBehaviors(sender, selectedForm);
    }
  });
  model.onValueChanged.add((sender, options) => {
    if (HOUSEHOLD_ID_FIELDS.has(options.name)) {
      updateHouseholdIdCalculation(sender);
      updateHouseholdListingCalculations(sender);
      checkDuplicateHousehold(sender);
    }
    if (options.name === "member_name" || options.name === HH_MEMBER_PANEL) {
      refreshQuestionTitles(sender);
      setTimeout(() => italicizeVisibleMemberNames(sender), 0);
    }
    if (
      options.name === HHQ_HANDWASHING_PLACE_FIELD ||
      options.name === HHQ_HANDWASHING_OBSERVATION_FIELD ||
      options.name === HHQ_RESULT_INTERVIEW_FIELD
    ) {
      applyForcedHhqOutcomeResult(sender);
    }
    if (
      options.name === HH_MEMBER_PANEL ||
      options.name?.startsWith("member_")
    ) {
      if (options.name === MEMBER_RELATIONSHIP_FIELD && Number(options.value) === HEAD_RELATIONSHIP_VALUE) {
        notifyDuplicateHouseholdHead(sender);
      }
      refreshHouseholdSurveyBehaviors(sender, selectedForm);
      if (
        options.name === MEMBER_AGE_YEARS_FIELD ||
        options.name === MEMBER_RESIDENCE_DURATION_FIELD
      ) {
        options.question?.validate?.(true, false, true);
        setTimeout(refreshVisibleAgeResidenceErrors, 0);
      }
    }
  });
}
