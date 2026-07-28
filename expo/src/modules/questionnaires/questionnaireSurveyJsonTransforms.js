/**
 * Applies form-specific compatibility transforms before a definition enters Survey Core.
 */
import { prepareSurveyJson } from "../../lib/prepareSurveyJson.js";

const HHQ_FORM_CODE = "HHQ";
const HHQ_SINGLE_MOBILE_NAME = "hhq_contact_mobile";
const HHQ_MOBILE_LIST_NAME = "hhq_contact_mobile_numbers";
const HHQ_MOBILE_ROW_NAME = "mobile_number";
const HHQ_HOUSEHOLD_NUMBER_NAME = "hhq_household_number";

function isHhqForm(form) {
  return form?.form_code === HHQ_FORM_CODE;
}

function applyMandatoryHhqSurveyJson(surveyJson) {
  function visit(elements = []) {
    return elements.map((element) => {
      const next = { ...element };
      if (
        next.name &&
        next.name !== "hhq_household_members" &&
        next.type !== "html" &&
        next.type !== "paneldynamic" &&
        !next.readOnly
      ) {
        next.isRequired = true;
      }
      if (Array.isArray(next.elements)) {
        next.elements = visit(next.elements);
      }
      if (Array.isArray(next.templateElements)) {
        next.templateElements = visit(next.templateElements);
      }
      return next;
    });
  }

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: visit(page.elements),
    })),
  };
}

function toMultipleMobilePanel(element) {
  return {
    type: "paneldynamic",
    name: HHQ_MOBILE_LIST_NAME,
    title: element.title,
    description: {
      ...(typeof element.description === "object" ? element.description : {}),
      default: "Record one or more mobile numbers for the head of household or an adult household member.",
    },
    minPanelCount: 1,
    panelCount: 1,
    addPanelText: "Add mobile number",
    removePanelText: "Remove mobile number",
    ...(element.visibleIf ? { visibleIf: element.visibleIf } : {}),
    templateElements: [
      {
        type: "text",
        name: HHQ_MOBILE_ROW_NAME,
        title: "Mobile number",
        inputType: "tel",
        validators: element.validators || [],
      },
    ],
  };
}

function allowMultipleHhqMobileNumbers(surveyJson) {
  function visit(elements = []) {
    return elements.map((element) => {
      if (element.name === HHQ_SINGLE_MOBILE_NAME && element.type === "text") {
        return toMultipleMobilePanel(element);
      }
      const next = { ...element };
      if (Array.isArray(next.elements)) {
        next.elements = visit(next.elements);
      }
      if (Array.isArray(next.templateElements)) {
        next.templateElements = visit(next.templateElements);
      }
      return next;
    });
  }

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: visit(page.elements),
    })),
  };
}

function scopeDynamicPanelExpressions(surveyJson) {
  function visit(elements = []) {
    return elements.map((element) => {
      const next = { ...element };
      if (next.type === "paneldynamic" && Array.isArray(next.templateElements)) {
        const templateNames = new Set(
          next.templateElements.map((child) => child.name).filter(Boolean)
        );
        next.templateElements = next.templateElements.map((child) => {
          if (!child.visibleIf) return child;
          return {
            ...child,
            visibleIf: child.visibleIf.replace(/\{([^}]+)\}/g, (match, name) =>
              templateNames.has(name) ? `{panel.${name}}` : match
            ),
          };
        });
      } else {
        if (Array.isArray(next.elements)) next.elements = visit(next.elements);
        if (Array.isArray(next.templateElements)) {
          next.templateElements = visit(next.templateElements);
        }
      }
      return next;
    });
  }

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: visit(page.elements),
    })),
  };
}

function markHhqDatabaseCheck(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.name === HHQ_HOUSEHOLD_NUMBER_NAME
          ? { ...element, renderAs: "db_check" }
          : element
      ),
    })),
  };
}

export function normalizeQuestionnaireSurveyData(form, data) {
  if (!isHhqForm(form) || !data || typeof data !== "object") {
    return data || {};
  }
  if (Array.isArray(data[HHQ_MOBILE_LIST_NAME])) {
    return data;
  }
  const singleMobile = data[HHQ_SINGLE_MOBILE_NAME];
  if (!singleMobile) {
    return data;
  }
  const next = { ...data };
  next[HHQ_MOBILE_LIST_NAME] = [{ [HHQ_MOBILE_ROW_NAME]: String(singleMobile) }];
  delete next[HHQ_SINGLE_MOBILE_NAME];
  return next;
}

export function prepareQuestionnaireSurveyJson(form) {
  let surveyJson = prepareSurveyJson(form);
  if (isHhqForm(form)) {
    surveyJson = allowMultipleHhqMobileNumbers(surveyJson);
    surveyJson = scopeDynamicPanelExpressions(surveyJson);
    surveyJson = markHhqDatabaseCheck(surveyJson);
    surveyJson = applyMandatoryHhqSurveyJson(surveyJson);
  }
  return surveyJson;
}
