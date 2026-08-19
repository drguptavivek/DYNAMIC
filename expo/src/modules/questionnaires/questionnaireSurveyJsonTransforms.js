/**
 * Applies form-specific compatibility transforms before a definition enters Survey Core.
 */
import { prepareSurveyJson } from "../../lib/prepareSurveyJson.js";

const HHQ_FORM_CODE = "HHQ";
const HHQ_SINGLE_MOBILE_NAME = "hhq_contact_mobile";
const HHQ_MOBILE_LIST_NAME = "hhq_contact_mobile_numbers";
const HHQ_MOBILE_ROW_NAME = "mobile_number";
const HHQ_HOUSEHOLD_NUMBER_NAME = "hhq_household_number";
const HHQ_HANDWASHING_PLACE_NAME = "hhq_we_like_learn_about_places_that_households_use";
const HHQ_HANDWASHING_OBSERVATION_NAME = "hhq_observation_only";
const HHQ_RESULT_INTERVIEW_NAME = "hhq_result_interview";
const HHQ_OUTCOME_COMPLETED_VALUE = 1;
const HHQ_OUTCOME_OTHER_SPECIFY_VALUE = 10;
const HHQ_OUTCOME_COMPLETED_VISIBLE_IF =
  `({${HHQ_HANDWASHING_PLACE_NAME}} = 2 or {${HHQ_HANDWASHING_PLACE_NAME}} = 3 or ` +
  `({${HHQ_HANDWASHING_PLACE_NAME}} = 1 and {${HHQ_HANDWASHING_OBSERVATION_NAME}} notempty))`;
const HHQ_OUTCOME_OTHER_VISIBLE_IF = `{${HHQ_HANDWASHING_PLACE_NAME}} = 4`;
const HHQ_OUTCOME_NORMAL_VISIBLE_IF =
  `(({${HHQ_HANDWASHING_PLACE_NAME}} empty or ` +
  `({${HHQ_HANDWASHING_PLACE_NAME}} != 2 and {${HHQ_HANDWASHING_PLACE_NAME}} != 3 and ` +
  `{${HHQ_HANDWASHING_PLACE_NAME}} != 4)) and {${HHQ_HANDWASHING_OBSERVATION_NAME}} empty)`;

const WQ_FORM_CODE = "WQ";
const WQ_WOMAN_AVAILABLE_NAME = "wq_woman_available";
const WQ_RESULT_INTERVIEW_NAME = "wq_result_interview";
const WQ_OUTCOME_NOT_AT_HOME_VALUE = 2;
const WQ_OUTCOME_POSTPONED_VALUE = 3;
const WQ_OUTCOME_INCAPACITATED_VALUE = 6;
const WQ_OUTCOME_NORMAL_VISIBLE_IF =
  `({${WQ_WOMAN_AVAILABLE_NAME}} empty or {${WQ_WOMAN_AVAILABLE_NAME}} = 1)`;
const WQ_STOP_OUTCOME_VISIBLE_IF = {
  [WQ_OUTCOME_NOT_AT_HOME_VALUE]: `{${WQ_WOMAN_AVAILABLE_NAME}} = 4`,
  [WQ_OUTCOME_POSTPONED_VALUE]: `{${WQ_WOMAN_AVAILABLE_NAME}} = 3`,
  [WQ_OUTCOME_INCAPACITATED_VALUE]: `{${WQ_WOMAN_AVAILABLE_NAME}} = 2`,
};

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

function applyHhqOutcomeChoiceVisibility(surveyJson) {
  function visit(elements = []) {
    return elements.map((element) => {
      const next = { ...element };
      if (next.name === HHQ_RESULT_INTERVIEW_NAME && Array.isArray(next.choices)) {
        next.choices = next.choices.map((choice) => {
          if (choice.value === HHQ_OUTCOME_COMPLETED_VALUE) {
            return {
              ...choice,
              visibleIf: `(${HHQ_OUTCOME_NORMAL_VISIBLE_IF}) or (${HHQ_OUTCOME_COMPLETED_VISIBLE_IF})`,
            };
          }
          if (choice.value === HHQ_OUTCOME_OTHER_SPECIFY_VALUE) {
            return {
              ...choice,
              visibleIf: `(${HHQ_OUTCOME_NORMAL_VISIBLE_IF}) or (${HHQ_OUTCOME_OTHER_VISIBLE_IF})`,
            };
          }
          return {
            ...choice,
            visibleIf: HHQ_OUTCOME_NORMAL_VISIBLE_IF,
          };
        });
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

function isWqForm(form) {
  return form?.form_code === WQ_FORM_CODE;
}

function applyWqOutcomeChoiceVisibility(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        if (element.name !== WQ_RESULT_INTERVIEW_NAME || !Array.isArray(element.choices)) {
          return element;
        }
        return {
          ...element,
          choices: element.choices.map((choice) => {
            const stopVisibleIf = WQ_STOP_OUTCOME_VISIBLE_IF[choice.value];
            return {
              ...choice,
              visibleIf: stopVisibleIf
                ? `(${WQ_OUTCOME_NORMAL_VISIBLE_IF}) or (${stopVisibleIf})`
                : WQ_OUTCOME_NORMAL_VISIBLE_IF,
            };
          }),
        };
      }),
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
  surveyJson = scopeDynamicPanelExpressions(surveyJson);
  if (isHhqForm(form)) {
    surveyJson = allowMultipleHhqMobileNumbers(surveyJson);
    surveyJson = markHhqDatabaseCheck(surveyJson);
    surveyJson = applyHhqOutcomeChoiceVisibility(surveyJson);
    surveyJson = applyMandatoryHhqSurveyJson(surveyJson);
  }
  if (isWqForm(form)) {
    surveyJson = applyWqOutcomeChoiceVisibility(surveyJson);
  }
  return surveyJson;
}
