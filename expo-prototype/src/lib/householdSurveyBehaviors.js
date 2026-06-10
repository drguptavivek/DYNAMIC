const HHQ_CODE = "HHQ";
const HH_MEMBER_PANEL = "hhq_household_members";
const HOUSEHOLD_ID_FIELDS = new Set([
  "hhq_site_id",
  "hhq_locality_code",
  "hhq_structure_map_id",
  "hhq_household_number"
]);
const HOUSEHOLD_NUMBER_FIELD = "hhq_household_number";
const GPS_FIELD_NAMES = new Set([
  "hhq_gps_latitude",
  "hhq_gps_longitude",
  "hhq_gps_altitude_m"
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

function isWomanQuestionnaireEligible(member) {
  return (
    Number(member?.member_sex) === 2 &&
    Number(member?.member_age_years) >= 18 &&
    Number(member?.member_age_years) <= 49 &&
    Number(member?.member_marital_status) !== 7
  );
}

function getHouseholdMemberPanelCount(model) {
  const question = model.getQuestionByName?.(HH_MEMBER_PANEL);
  const panelCount = Number(question?.panelCount ?? question?.panels?.length ?? 0);
  return Number.isFinite(panelCount) && panelCount > 0 ? panelCount : 0;
}

function updateHouseholdListingCalculations(model) {
  const members = Array.isArray(model.getValue(HH_MEMBER_PANEL))
    ? model.getValue(HH_MEMBER_PANEL)
    : [];
  const memberCount = Math.max(members.length, getHouseholdMemberPanelCount(model));
  const calculationMembers = Array.from(
    { length: memberCount },
    (_, index) => members[index] || {}
  );
  const normalizedMembers = calculationMembers.map((member, index) => ({
    ...member,
    member_line_number: index + 1,
    member_woman_questionnaire_eligible: isWomanQuestionnaireEligible(member) ? 1 : 2
  }));

  if (JSON.stringify(members) !== JSON.stringify(normalizedMembers)) {
    model.setValue(HH_MEMBER_PANEL, normalizedMembers);
  }

  model.setValue("hhq_total_household_members", normalizedMembers.length || undefined);
  model.setValue("hhq_total_household_members_end_summary", normalizedMembers.length || undefined);
  model.setValue(
    "hhq_total_eligible_women",
    normalizedMembers.filter(isWomanQuestionnaireEligible).length
  );
  model.setValue(
    "hhq_total_eligible_women_end_summary",
    normalizedMembers.filter(isWomanQuestionnaireEligible).length
  );
}

function refreshQuestionTitles(model) {
  model.getAllQuestions().forEach((question) => {
    question.locTitle?.strChanged?.();
  });
}

function getPanelMemberName(question) {
  return question?.parent?.data?.member_name || "";
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

  question.clearErrors?.();
  if (!duplicateHousehold) {
    return;
  }

  const message = `Household ID ${duplicateHousehold.household_id} already exists. Use another structure or household number.`;
  question.addError?.(message);
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
  const panelData = question?.parent?.data;
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

function validateAgeQuestion(sender, options) {
  if (options.name !== MEMBER_AGE_YEARS_FIELD) return;
  const member = options.question?.parent?.data;
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
    hasAgeResidenceMismatch(question?.parent?.data) ||
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
    if (question.name === HH_MEMBER_PANEL || question.getType?.() === "paneldynamic") {
      question.isRequired = false;
      return;
    }
    question.isRequired = true;
  });
}

export function refreshHouseholdSurveyBehaviors(model, selectedForm) {
  if (selectedForm?.form_code !== HHQ_CODE) return;
  applyMandatoryHhqQuestions(model);
  updateHouseholdListingCalculations(model);
  validateSingleHouseholdHead(model);
  validateAgeAgainstResidenceDuration(model);
  setTimeout(refreshVisibleAgeResidenceErrors, 0);
}

export function attachHouseholdSurveyBehaviors(
  model,
  selectedForm,
  onHouseholdSave,
  options = {}
) {
  if (selectedForm?.form_code !== HHQ_CODE) return;

  applyMandatoryHhqQuestions(model);
  model.checkErrorsMode = "onValueChanged";

  let duplicateCheckSequence = 0;
  let duplicateHousehold = null;

  async function checkDuplicateHousehold(sender) {
    const findExistingHousehold = options.findExistingHousehold;
    if (!findExistingHousehold) return null;

    const sequence = ++duplicateCheckSequence;
    const existing = await findExistingHousehold(sender.data);
    if (sequence !== duplicateCheckSequence) return duplicateHousehold;

    duplicateHousehold = existing || null;
    setDuplicateHouseholdError(sender, duplicateHousehold);
    return duplicateHousehold;
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
    if (options.question.name !== "hhq_gps_latitude") return;
    if (options.htmlElement.querySelector("[data-dynamic-gps-capture]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.dynamicGpsCapture = "true";
    button.textContent = "Capture GPS";
    button.style.marginTop = "12px";
    button.style.padding = "10px 14px";
    button.style.border = "0";
    button.style.borderRadius = "6px";
    button.style.background = "#1f6feb";
    button.style.color = "#ffffff";
    button.style.fontWeight = "700";
    button.style.cursor = "pointer";

    const status = document.createElement("div");
    status.style.marginTop = "8px";
    status.style.color = "#667085";
    status.style.fontSize = "13px";

    button.addEventListener("click", () => {
      if (!navigator?.geolocation) {
        status.textContent = "GPS is not available on this device/browser.";
        return;
      }
      status.textContent = "Capturing GPS...";
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, altitude } = position.coords;
          sender.setValue("hhq_gps_latitude", Number(latitude.toFixed(7)));
          sender.setValue("hhq_gps_longitude", Number(longitude.toFixed(7)));
          if (altitude !== null && altitude !== undefined) {
            sender.setValue("hhq_gps_altitude_m", Number(altitude.toFixed(1)));
          }
          status.textContent = "GPS captured from device.";
        },
        (error) => {
          status.textContent = `GPS capture failed: ${error.message}`;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

    options.htmlElement.appendChild(button);
    options.htmlElement.appendChild(status);
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
    if (GPS_FIELD_NAMES.has(options.name) && !options.value) return;
    if (HOUSEHOLD_ID_FIELDS.has(options.name)) {
      checkDuplicateHousehold(sender);
    }
    if (options.name === "member_name" || options.name === HH_MEMBER_PANEL) {
      refreshQuestionTitles(sender);
      setTimeout(() => italicizeVisibleMemberNames(sender), 0);
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
