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

function interpolateSurveyValues(text, question) {
  if (!text || !question?.survey || !String(text).includes("{")) return text;
  return String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (match, fieldName) => {
    const value = question.survey.getValue?.(fieldName);
    if (value === undefined || value === null || value === "") return match;
    return String(value);
  });
}

function defaultChoiceText(choice) {
  const text = choice?.text;
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    return text.default || text.en || text.english || "";
  }
  return "";
}

export function getNativeQuestionTitle(question, locale = "default") {
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
  if (renderAs === "years_with_special_codes") return "select-one";
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
          .map((child) => ({
            name: child.name,
            title: getNativeQuestionTitle(child, locale),
            value: displayValue(child),
          })),
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
