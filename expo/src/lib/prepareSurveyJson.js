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

function cleanElement(element) {
  const next = {};
  for (const [key, value] of Object.entries(element)) {
    if (SUPPORTED_SURVEY_KEYS.has(key)) next[key] = value;
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
    pages: form.pages.map((page) => ({
      name: page.name,
      title: page.title,
      description: page.description,
      elements: page.elements.map(cleanElement)
    }))
  };
}
