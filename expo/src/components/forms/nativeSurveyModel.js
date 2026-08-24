/**
 * Centralizes native renderer selection, localized Survey Core metadata, values, and previews.
 */
const NATIVE_SURVEY_TYPES = new Set([
  "checkbox",
  "file",
  "html",
  "multipletext",
  "paneldynamic",
  "radiogroup",
  "text",
]);
const WQ_PREGNANCY_BABY_NAME_FIELD = "pregnancy_02_reproduction_what_name_was_given_to_the_baby";
const WQ_PREGNANCY_BABY_SEX_FIELD = "pregnancy_02_reproduction_is_name_a_boy_or_a_girl";
const WQ_PREGNANCY_SIGN_OF_LIFE_FIELD =
  "pregnancy_02_reproduction_did_the_baby_cry_move_or_breathe";
export const WQ_PREGNANCY_DURATION_FIELD =
  "pregnancy_02_reproduction_how_long_did_this_pregnancy_last_in_weeks";
const WQ_PREGNANCY_OUTCOME_DATE_FIELD =
  "pregnancy_02_reproduction_check_16_and_17_type_of_pregnancy_outcome";
const WQ_PREGNANCY_CHILD_AGE_FIELD =
  "pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b";
const WQ_PREGNANCY_DEATH_AGE_FIELD =
  "pregnancy_02_reproduction_if_born_alive_and_now_dead_if_19_i_1_boy_h";
export const WQ_PREGNANCY_PLURALITY_FIELD =
  "pregnancy_02_reproduction_if_i_1_think_back_to_your_first_pregnancy";
export const WQ_PREGNANCY_OUTCOME_FIELD =
  "pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor";
export const WQ_MULTIPLE_BIRTH_INDEX_FIELD =
  "pregnancy_02_reproduction_multiple_birth_index";
export const WQ_MULTIPLE_BIRTH_COUNT_FIELD =
  "pregnancy_02_reproduction_multiple_birth_count";
export const WQ_PREGNANCY_GROUP_FIELD =
  "pregnancy_02_reproduction_pregnancy_group_index";
const NATIVE_INTERNAL_PANEL_FIELDS = new Set([
  WQ_PREGNANCY_GROUP_FIELD,
  WQ_MULTIPLE_BIRTH_INDEX_FIELD,
  WQ_MULTIPLE_BIRTH_COUNT_FIELD,
]);
export const WQ_PREGNANCY_HISTORY_PANEL_FIELD = "wq_pregnancy_history";
export const WQ_OTHER_PREGNANCIES_FIELD =
  "pregnancy_02_reproduction_if_row_i_1_were_there_any_other_pregnancie";
const WQ_SECTION_4_MARITAL_STATUS_CHECK_FIELD =
  "wq_04_husband_s_backgroun_check_answer_to_marital_status_on_01_respo";
const WQ_SECTION_4_HUSBAND_OCCUPATION_FIELD =
  "wq_04_husband_s_backgroun_if_1_1_currently_married_what_is_your_last";

export function isNativeInternalPanelField(name) {
  return NATIVE_INTERNAL_PANEL_FIELDS.has(String(name || ""));
}

export function getPanelCommitLabel(question, panel, editorMode, isWqPregnancyHistory) {
  if (isWqPregnancyHistory) {
    const { count, index } = getWqMultipleBirthRow(panel);
    if (editorMode !== "add") return `Update child ${index}`;
    return index < count ? `Add child ${index}` : question?.addPanelText || "Add pregnancy outcome";
  }
  return editorMode === "add" ? question?.addPanelText || "Add entry" : "Update entry";
}

export function appendDynamicPanel(question) {
  const panel = question?.addPanel?.(-1);
  const panels = question?.panels || [];
  return {
    panel: panel || null,
    index: panel ? panels.indexOf(panel) : -1,
  };
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function stripSurveyHtml(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function localizedText(localizable, fallback = "", locale = "default") {
  const activeLocale = locale && locale !== "default" ? String(locale) : "default";
  const localized =
    activeLocale !== "default" && typeof localizable?.getLocaleText === "function"
      ? localizable.getLocaleText(activeLocale)
      : "";
  const defaultText =
    typeof localizable?.getLocaleText === "function"
      ? localizable.getLocaleText("default")
      : "";
  const rendered =
    localized ||
    (activeLocale === "default" ? (localizable?.renderedHtml ?? localizable?.text) : "") ||
    defaultText ||
    localizable?.text ||
    fallback;
  return stripSurveyHtml(rendered || fallback);
}

function getQuestionValueForInterpolation(question, fieldName) {
  const panelValue = question?.parent?.getQuestionByName?.(fieldName)?.value;
  if (panelValue !== undefined && panelValue !== null && panelValue !== "") return panelValue;
  const surveyValue = question?.survey?.getValue?.(fieldName);
  if (surveyValue !== undefined && surveyValue !== null && surveyValue !== "") return surveyValue;
  const pregnancyRows = question?.survey?.getValue?.(WQ_PREGNANCY_HISTORY_PANEL_FIELD);
  if (Array.isArray(pregnancyRows)) {
    for (let index = pregnancyRows.length - 1; index >= 0; index -= 1) {
      const value = pregnancyRows[index]?.[fieldName];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return undefined;
}

function interpolateSurveyValues(text, question) {
  if (!text) return text;
  let rendered = String(text);
  if (question?.survey && rendered.includes("{")) {
    rendered = rendered.replace(/\{([A-Za-z0-9_]+)\}/g, (match, fieldName) => {
      const value = getQuestionValueForInterpolation(question, fieldName);
      if (value === undefined) return match;
      return String(value);
    });
  }
  if (rendered.includes("(NAME")) {
    const value = getQuestionValueForInterpolation(question, WQ_PREGNANCY_BABY_NAME_FIELD);
    if (value !== undefined && value !== null && value !== "") {
      rendered = rendered.replace(/\(NAME(?: in 18_i)?\)/g, String(value));
    }
  }
  return rendered;
}

function defaultChoiceText(choice) {
  const text = choice?.text;
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    return text.default || text.en || text.english || "";
  }
  return "";
}

function getNativePanelRowNumber(question) {
  const explicitRow = Number(question?.__nativePanelRowNumber);
  if (Number.isFinite(explicitRow) && explicitRow > 0) return explicitRow;

  const panel = question?.parent;
  const possibleOwners = [
    panel?.parentQuestion,
    panel?.parent,
    panel?.parentElement,
    panel?.panelDynamic,
    question?.parentQuestion,
  ];
  for (const owner of possibleOwners) {
    const panels = Array.isArray(owner?.panels) ? owner.panels : [];
    const index = panels.indexOf(panel);
    if (index >= 0) return index + 1;
  }
  return null;
}

function sourcePrefixFromTitle(title) {
  return (String(title).match(/^\s*[\dA-Za-z_]+[.)]\s*/i) || [""])[0];
}

function pregnancyOutcomePrompt(question) {
  const birthResult = Number(
    getQuestionValueForInterpolation(question, WQ_PREGNANCY_OUTCOME_FIELD)
  );
  const signOfLife = Number(
    getQuestionValueForInterpolation(question, WQ_PREGNANCY_SIGN_OF_LIFE_FIELD)
  );
  if (birthResult === 1 || signOfLife === 1) return "Born alive";
  if (birthResult === 2 && signOfLife === 2) return "Born dead";
  if (birthResult === 3) return "Miscarriage";
  if (birthResult === 4) return "Abortion";
  return "";
}

function childName(question) {
  return String(
    getQuestionValueForInterpolation(question, WQ_PREGNANCY_BABY_NAME_FIELD) || "the child"
  );
}

export function getNativeQuestionTitle(question, locale = "default") {
  if (question?.name === WQ_PREGNANCY_OUTCOME_DATE_FIELD) {
    const originalTitle = interpolateSurveyValues(
      localizedText(question?.locTitle, question?.title || "", locale),
      question
    );
    const outcome = pregnancyOutcomePrompt(question);
    if (outcome) {
      const datePrompt =
        outcome === "Born alive"
          ? `On what day, month, and year was ${childName(question)} born?`
          : "On what day, month, and year did this pregnancy end?";
      return `${sourcePrefixFromTitle(originalTitle)}${outcome}\n${datePrompt}`;
    }
  }
  if (
    question?.name === WQ_PREGNANCY_CHILD_AGE_FIELD ||
    question?.name === WQ_PREGNANCY_DEATH_AGE_FIELD
  ) {
    const originalTitle = interpolateSurveyValues(
      localizedText(question?.locTitle, question?.title || "", locale),
      question
    );
    const sex = Number(getQuestionValueForInterpolation(question, WQ_PREGNANCY_BABY_SEX_FIELD));
    if (sex === 1 || sex === 2) {
      const pronoun = sex === 1 ? "he" : "she";
      const possessive = sex === 1 ? "his" : "her";
      const wording =
        question.name === WQ_PREGNANCY_CHILD_AGE_FIELD
          ? `How old was ${childName(question)} at ${possessive} last birthday?`
          : `How old was ${childName(question)} when ${pronoun} died?`;
      return sourcePrefixFromTitle(originalTitle) + wording;
    }
  }
  if (question?.name === WQ_PREGNANCY_PLURALITY_FIELD) {
    const rowNumber = getNativePanelRowNumber(question);
    if (rowNumber) {
      const originalTitle = interpolateSurveyValues(
        localizedText(question?.locTitle, question?.title || "", locale),
        question
      );
      const title =
        rowNumber === 1
          ? "Think back to your first pregnancy. Was that a single pregnancy, twins, or triplets?"
          : "Think back to your next pregnancy. Was that a single pregnancy, twins, or triplets?";
      return sourcePrefixFromTitle(originalTitle) + title;
    }
  }
  if (question?.name === WQ_PREGNANCY_OUTCOME_FIELD) {
    const originalTitle = interpolateSurveyValues(
      localizedText(question?.locTitle, question?.title || "", locale),
      question
    );
    const multipleBirth = getWqMultipleBirthRow(question?.parent);
    const title =
      multipleBirth.count <= 1
        ? "Was the baby born alive, born dead, or did you have a miscarriage or abortion?"
        : multipleBirth.index === 1
          ? "Was the first baby in this pregnancy born alive or born dead?"
          : "Was the next baby in this pregnancy born alive or born dead?";
    return sourcePrefixFromTitle(originalTitle) + title;
  }
  if (question?.name === WQ_SECTION_4_HUSBAND_OCCUPATION_FIELD) {
    const maritalStatus = String(
      getQuestionValueForInterpolation(question, WQ_SECTION_4_MARITAL_STATUS_CHECK_FIELD) ?? ""
    );
    if (maritalStatus === "1" || maritalStatus === "3") {
      // prepareSurveyJson prefixes titles with the source code ("5. ");
      // keep that number on the marital-status-aware wording.
      const originalTitle = interpolateSurveyValues(
        localizedText(question?.locTitle, question?.title || "", locale),
        question
      );
      const occupationTitle =
        maritalStatus === "1"
          ? "What is your (last) husband's occupation? That is, what kind of work does he mainly do?"
          : "What was your (last) husband's occupation. That is, what kind of work did he mainly do?";
      return sourcePrefixFromTitle(originalTitle) + occupationTitle;
    }
  }
  return interpolateSurveyValues(
    localizedText(question?.locTitle, question?.title || question?.name || "", locale),
    question
  );
}

export function getNativeQuestionDescription(question, locale = "default") {
  return localizedText(question?.locDescription, question?.description || "", locale);
}

export function getNativeQuestionErrors(question) {
  if (!Array.isArray(question?.errors)) return [];
  return question.errors
    .map((error) => {
      if (typeof error === "string") return error;
      if (typeof error?.getText === "function") return error.getText();
      return error?.text || String(error || "");
    })
    .filter(Boolean);
}

export function getNativeQuestionChoices(question, locale = "default") {
  const choices = question?.visibleChoices || question?.choices || [];
  return choices.map((choice) => {
    const defaultText = defaultChoiceText(choice);
    return {
      value: choice.value,
      text: localizedText(choice.locText, defaultText || choice.text || choice.value, locale) || defaultText || String(choice.value ?? ""),
    };
  });
}

function numericPanelValue(panel, fieldName) {
  const value = Number(panel?.getQuestionByName?.(fieldName)?.value);
  return Number.isFinite(value) ? value : 0;
}

export function getWqMultipleBirthRow(panel) {
  const plurality = Math.min(
    5,
    Math.max(1, numericPanelValue(panel, WQ_PREGNANCY_PLURALITY_FIELD) || 1)
  );
  const storedIndex = Math.max(1, numericPanelValue(panel, WQ_MULTIPLE_BIRTH_INDEX_FIELD) || 1);
  const storedCount = numericPanelValue(panel, WQ_MULTIPLE_BIRTH_COUNT_FIELD);
  const count = Math.min(5, Math.max(1, storedIndex === 1 ? plurality : storedCount || plurality));
  const index = Math.min(count, storedIndex);
  return { count, index, plurality };
}

export function getWqPregnancyChildSummary(panel) {
  const nameQuestion = panel?.getQuestionByName?.(WQ_PREGNANCY_BABY_NAME_FIELD);
  const sexQuestion = panel?.getQuestionByName?.(WQ_PREGNANCY_BABY_SEX_FIELD);
  const birthResultQuestion = panel?.getQuestionByName?.(WQ_PREGNANCY_OUTCOME_FIELD);
  const signOfLifeQuestion = panel?.getQuestionByName?.(WQ_PREGNANCY_SIGN_OF_LIFE_FIELD);
  const durationQuestion = panel?.getQuestionByName?.(WQ_PREGNANCY_DURATION_FIELD);
  const name = String(nameQuestion?.value ?? "").trim();
  const sex = String(displayValue(sexQuestion) ?? "").trim();
  const birthResult = Number(birthResultQuestion?.value);
  const signOfLife = Number(signOfLifeQuestion?.value);
  const outcomeCode = birthResult === 1 || signOfLife === 1
    ? 1
    : birthResult;
  const bornStatus = {
    1: "Born Alive",
    2: "Born Dead",
    3: "Miscarriage",
    4: "Abortion",
  }[outcomeCode] || "-";
  const duration = durationQuestion?.value;
  return {
    bornStatus,
    name: name || "-",
    pregnancyLasts: getWqPregnancyDurationSummary(duration),
    sex: sex || "-",
  };
}

export function getWqPregnancyDurationSummary(duration) {
  const weeks = String(duration?.weeks ?? "").trim();
  const months = String(duration?.months ?? "").trim();
  if (weeks && weeks !== "00") return `${weeks} weeks`;
  if (months && months !== "00") return `${months} months`;
  if (weeks) return `${weeks} weeks`;
  if (months) return `${months} months`;
  return "-";
}

export function groupWqPregnancyHistoryPanels(panels = []) {
  const groups = [];
  let inferredGroupIndex = 0;

  panels.forEach((panel, panelIndex) => {
    const multipleBirth = getWqMultipleBirthRow(panel);
    const storedGroupIndex = numericPanelValue(panel, WQ_PREGNANCY_GROUP_FIELD);
    if (storedGroupIndex > 0) {
      inferredGroupIndex = storedGroupIndex;
    } else if (multipleBirth.index === 1 || inferredGroupIndex === 0) {
      inferredGroupIndex += 1;
    }

    const groupIndex = Math.max(1, inferredGroupIndex);
    let group = groups.find((item) => item.groupIndex === groupIndex);
    if (!group) {
      group = { groupIndex, rows: [] };
      groups.push(group);
    }
    group.rows.push({ panel, panelIndex, multipleBirth });
  });

  return groups;
}

export function reorderWqPregnancyHistoryValues(values = [], fromPosition, toPosition) {
  if (!Array.isArray(values) || values.length < 2) return values;

  const groups = [];
  let inferredGroupIndex = 0;
  values.forEach((value) => {
    const row = value && typeof value === "object" ? { ...value } : {};
    const storedGroupIndex = Number(row[WQ_PREGNANCY_GROUP_FIELD]) || 0;
    const birthIndex = Number(row[WQ_MULTIPLE_BIRTH_INDEX_FIELD]) || 1;
    if (storedGroupIndex > 0) {
      inferredGroupIndex = storedGroupIndex;
    } else if (birthIndex === 1 || inferredGroupIndex === 0) {
      inferredGroupIndex += 1;
    }

    let group = groups.find((item) => item.groupIndex === inferredGroupIndex);
    if (!group) {
      group = { groupIndex: inferredGroupIndex, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  });

  if (
    fromPosition < 0 ||
    fromPosition >= groups.length ||
    toPosition < 0 ||
    toPosition >= groups.length ||
    fromPosition === toPosition
  ) {
    return values;
  }

  const reorderedGroups = [...groups];
  const [movedGroup] = reorderedGroups.splice(fromPosition, 1);
  reorderedGroups.splice(toPosition, 0, movedGroup);

  return reorderedGroups.flatMap((group, groupPosition) =>
    group.rows.map((row) => ({
      ...row,
      [WQ_PREGNANCY_GROUP_FIELD]: groupPosition + 1,
    }))
  );
}

export function shouldShowWqPregnancyHistoryQuestion(child, multipleBirth) {
  if (!child || multipleBirth.count <= 1) return true;
  if (child.name === WQ_PREGNANCY_PLURALITY_FIELD) return multipleBirth.index === 1;
  return true;
}

export function getNativeQuestionValue(question, answerData) {
  if (!question) return undefined;
  const parentType = question.parent?.getType?.() || question.parent?.type;
  if (parentType !== "panel" && question.name && typeof question.survey?.getValue === "function") {
    const surveyValue = question.survey.getValue(question.name);
    if (surveyValue !== undefined) return surveyValue;
  }
  if (
    parentType !== "panel" &&
    question.name &&
    question.survey?.data &&
    Object.prototype.hasOwnProperty.call(question.survey.data, question.name)
  ) {
    return question.survey.data[question.name];
  }
  if (
    parentType !== "panel" &&
    question.name &&
    answerData &&
    Object.prototype.hasOwnProperty.call(answerData, question.name)
  ) {
    return answerData[question.name];
  }
  return question.value;
}

export function getVisiblePageQuestions(page) {
  return (page?.questions || page?.elements || []).filter(
    (question) => question?.isVisible !== false
  );
}

function isEmptyNativeQuestionValue(value) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * True when the question blocks section navigation: its own errors, a required-but-empty
 * answer, multipletext item errors (stored on the item editor), or any repeat-panel row.
 */
export function hasNativeValidationProblem(question) {
  if (!question) return false;
  if (Array.isArray(question.errors) && question.errors.length > 0) return true;
  if (question.isRequired && isEmptyNativeQuestionValue(question.value)) return true;
  if (Array.isArray(question.items)) {
    if (question.items.some((item) => ((item.editor ?? item)?.errors ?? []).length > 0)) return true;
  }
  if (question.getType?.() !== "paneldynamic") return false;
  return (question.panels || []).some((panel) =>
    (panel.questions || []).some((panelQuestion) => hasNativeValidationProblem(panelQuestion))
  );
}

export function setNativeQuestionValue(question, value) {
  if (!question) return false;
  if (question.readOnly === true) return false;
  const normalizedValue =
    question.getType?.() === "text" && question.inputType === "number"
      ? value === "" || value === null
        ? undefined
        : Number(value)
      : value === ""
        ? undefined
        : value;

  const parentType = question.parent?.getType?.() || question.parent?.type;
  if (parentType !== "panel") {
    if (typeof question.survey?.setValue === "function") {
      question.survey.setValue(question.name, normalizedValue);
    }
    if (typeof question.data?.setValue === "function") {
      question.data.setValue(question.name, normalizedValue);
    }
    question.value = normalizedValue;
    return true;
  }

  if (question.getType?.() === "text" && question.inputType === "number") {
    question.value = normalizedValue;
    return true;
  }
  question.value = normalizedValue;
  return true;
}

export function getNativeRendererKind(question) {
  const type = question.getType?.() || question.type;
  const renderAs = question.renderAs || "";
  if (renderAs === "readonly_calculated_numeric") return "calculate";
  if (renderAs === "readonly_summary") return "display";
  if (renderAs === "db_check") return "db-check";
  if (renderAs === "note") return "note";
  if (renderAs === "camera") return "camera";
  if (renderAs === "file_picker") return "file-picker";
  if (renderAs === "gps_decimal" || renderAs === "gps_altitude") return "gps";
  if (renderAs.startsWith("grouped_")) return "grouped-coded-single-select";
  if (renderAs === "household_member_dropdown") return "household-member-dropdown";
  if (renderAs === "years_with_special_codes" || renderAs === "days_with_special_codes") return "select-one";
  if (type === "radiogroup") return "select-one";
  if (type === "checkbox") return "select-many";
  if (type === "multipletext") return "multiple-text";
  if (type === "paneldynamic") return "dynamic-panel";
  if (type === "html") return "instruction";
  if (type === "file") return "file-picker";
  if (type === "text" && question.inputType === "date") return "date";
  if (
    type === "text" &&
    (question.inputType === "number" ||
      renderAs === "numeric_textbox" ||
      renderAs === "phone_textbox")
  ) return "number";
  if (type === "text") return "text";
  throw new Error(
    `No native renderer registered for ${question.name} (${type}/${renderAs || "default"}).`
  );
}

function collectUnsupportedQuestionTypes(question, results) {
  const type = question?.getType?.() || question?.type || "unknown";
  if (!NATIVE_SURVEY_TYPES.has(type)) {
    results.push({ name: question?.name || "unnamed", type });
  }
  if (type === "paneldynamic") {
    const template = question.templateElements || question.template?.questions || [];
    template.forEach((child) => collectUnsupportedQuestionTypes(child, results));
  }
}

export function assertNativeSurveySupport(model) {
  const unsupported = [];
  for (const page of model?.pages || []) {
    for (const question of page.questions || page.elements || []) {
      collectUnsupportedQuestionTypes(question, unsupported);
    }
  }
  return unsupported;
}

function isEmptyValue(value) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.values(value).every(isEmptyValue);
  return false;
}

function displayValue(question) {
  if (isEmptyValue(question?.value)) return "-";
  if (typeof question?.getDisplayValue === "function") {
    const value = question.getDisplayValue(true, question.value);
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") {
      return Object.entries(value)
        .filter(([, itemValue]) => !isEmptyValue(itemValue))
        .map(([key, itemValue]) => `${key.replaceAll("_", " ")}: ${itemValue}`)
        .join("; ");
    }
    if (!isEmptyValue(value)) return String(value);
  }
  if (Array.isArray(question.value)) return question.value.join(", ");
  if (typeof question.value === "object") {
    return Object.entries(question.value)
      .filter(([, itemValue]) => !isEmptyValue(itemValue))
      .map(([key, itemValue]) => `${key.replaceAll("_", " ")}: ${itemValue}`)
      .join("; ");
  }
  return String(question.value);
}

function previewQuestion(question, locale = "default") {
  const type = question.getType?.() || question.type;
  if (type === "html") {
    return {
      name: question.name,
      title: getNativeQuestionTitle(question, locale),
      type,
      value: stripSurveyHtml(question.html),
    };
  }
  if (type === "paneldynamic") {
    return {
      name: question.name,
      title: getNativeQuestionTitle(question, locale),
      type,
      panelRows: (question.panels || []).map((panel, index) => ({
        index: index + 1,
        questions: (panel.questions || [])
          .filter((child) => child.isVisible !== false && child.getType?.() !== "html")
          .map((child) => {
            child.__nativePanelRowNumber = index + 1;
            return {
              name: child.name,
              title: getNativeQuestionTitle(child, locale),
              value: displayValue(child),
            };
          }),
      })),
    };
  }
  return {
    name: question.name,
    title: getNativeQuestionTitle(question, locale),
    type,
    value: displayValue(question),
  };
}

export function buildNativeSurveyPreview(model, locale = "default") {
  return (model?.visiblePages || model?.pages || []).map((page) => ({
    name: page.name,
    title: localizedText(page.locTitle, page.title || page.name, locale),
    questions: getVisiblePageQuestions(page).map((question) => previewQuestion(question, locale)),
  }));
}
