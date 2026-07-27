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

function localizedText(localizable, fallback = "") {
  const rendered = localizable?.renderedHtml ?? localizable?.text;
  return stripSurveyHtml(rendered || fallback);
}

export function getNativeQuestionTitle(question) {
  return localizedText(question?.locTitle, question?.title || question?.name || "");
}

export function getNativeQuestionDescription(question) {
  return localizedText(question?.locDescription, question?.description || "");
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

export function getNativeQuestionChoices(question) {
  const choices = question?.visibleChoices || question?.choices || [];
  return choices.map((choice) => ({
    value: choice.value,
    text: localizedText(choice.locText, choice.text ?? choice.value),
  }));
}

export function getVisiblePageQuestions(page) {
  return (page?.questions || page?.elements || []).filter(
    (question) => question?.isVisible !== false
  );
}

export function setNativeQuestionValue(question, value) {
  if (!question || question.isReadOnly || question.readOnly) return;
  if (question.getType?.() === "text" && question.inputType === "number") {
    question.value = value === "" || value === null ? undefined : Number(value);
    return;
  }
  question.value = value === "" ? undefined : value;
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

function previewQuestion(question) {
  const type = question.getType?.() || question.type;
  if (type === "html") {
    return {
      name: question.name,
      title: getNativeQuestionTitle(question),
      type,
      value: stripSurveyHtml(question.html),
    };
  }
  if (type === "paneldynamic") {
    return {
      name: question.name,
      title: getNativeQuestionTitle(question),
      type,
      panelRows: (question.panels || []).map((panel, index) => ({
        index: index + 1,
        questions: (panel.questions || [])
          .filter((child) => child.isVisible !== false && child.getType?.() !== "html")
          .map((child) => ({
            name: child.name,
            title: getNativeQuestionTitle(child),
            value: displayValue(child),
          })),
      })),
    };
  }
  return {
    name: question.name,
    title: getNativeQuestionTitle(question),
    type,
    value: displayValue(question),
  };
}

export function buildNativeSurveyPreview(model) {
  return (model?.visiblePages || model?.pages || []).map((page) => ({
    name: page.name,
    title: localizedText(page.locTitle, page.title || page.name),
    questions: getVisiblePageQuestions(page).map(previewQuestion),
  }));
}
