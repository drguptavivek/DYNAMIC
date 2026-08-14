/**
 * Sanitizes stored questionnaire definitions into the SurveyJS schema accepted by Survey Core.
 */
const SUPPORTED_SURVEY_KEYS = new Set([
  "type",
  "name",
  "title",
  "description",
  "elements",
  "templateElements",
  "choices",
  "items",
  "visibleIf",
  "isRequired",
  "validators",
  "inputType",
  "maxLength",
  "preserveString",
  "readOnly",
  "renderAs",
  "minPanelCount",
  "panelCount",
  "addPanelText",
  "removePanelText",
  "panelAddText",
  "panelRemoveText",
  "showQuestionNumbers",
  "questionTitlePattern",
  "html",
  "pages",
  "locale",
  "supportedLocales",
  "showCompletedPage"
]);

function hasLocaleObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function prefixedTitle(title, sourceCode) {
  if (!sourceCode) return title;
  const prefix = `${sourceCode}. `;
  if (hasLocaleObject(title)) {
    return Object.fromEntries(
      Object.entries(title).map(([locale, value]) => [
        locale,
        typeof value === "string" && value ? `${prefix}${value}` : value
      ])
    );
  }
  return typeof title === "string" && title ? `${prefix}${title}` : title;
}

function cleanLocalizedValue(value) {
  if (!hasLocaleObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, localeText]) => {
      return typeof localeText !== "string" || localeText.trim() !== "";
    })
  );
}

function cleanChoice(choice) {
  if (!hasLocaleObject(choice)) return choice;
  const next = { ...choice };
  if ("text" in next) next.text = cleanLocalizedValue(next.text);
  return next;
}

function cleanElement(element) {
  const next = {};
  for (const [key, value] of Object.entries(element)) {
    if (SUPPORTED_SURVEY_KEYS.has(key)) next[key] = value;
  }
  if ("title" in next) next.title = cleanLocalizedValue(next.title);
  if ("description" in next) next.description = cleanLocalizedValue(next.description);
  if ("html" in next) next.html = cleanLocalizedValue(next.html);
  if (Array.isArray(next.choices)) {
    next.choices = next.choices.map(cleanChoice);
  }
  if (Array.isArray(next.items)) {
    next.items = next.items.map(cleanChoice);
  }
  if (element.sourceCode && element.sourceType !== "text_other_specify") {
    next.title = prefixedTitle(next.title, element.sourceCode);
  }
  if (element.renderingHint?.render_as) {
    next.renderAs = element.renderingHint.render_as;
  }
  if (Array.isArray(next.elements)) {
    next.elements = next.elements.map(cleanElement);
  }
  if (Array.isArray(next.templateElements)) {
    next.templateElements = next.templateElements.map(cleanElement);
  }
  return next;
}

export function prepareSurveyJson(form) {
  return {
    title: form.title,
    description: form.description,
    showQuestionNumbers: "off",
    questionTitlePattern: "title",
    showCompletedPage: false,
    ...(form.clearInvisibleValues
      ? { clearInvisibleValues: form.clearInvisibleValues }
      : {}),
    pages: form.pages.map((page) => ({
      name: page.name,
      title: page.title,
      description: page.description,
      ...(page.visibleIf ? { visibleIf: page.visibleIf } : {}),
      elements: page.elements.map(cleanElement)
    }))
  };
}
