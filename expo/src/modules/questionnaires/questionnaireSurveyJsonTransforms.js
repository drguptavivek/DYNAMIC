/**
 * Applies form-specific compatibility transforms before a definition enters Survey Core.
 */
import { prepareSurveyJson } from "../../lib/prepareSurveyJson.js";
import {
  PEF_NEGATIVE_UPT_VALUE,
  PEF_ON_SPOT_UPT_RESULT_FIELD,
  PEF_OUTCOME_PAGE_NAME,
} from "../../lib/pefPrefillHelpers.js";

const HHQ_FORM_CODE = "HHQ";
const PEF_FORM_CODE = "PEF";
const PEF_ULTRASOUND_DONE_FIELD = "pef_any_time_during_pregnancy_ultrasound";
const PEF_ULTRASOUND_AVAILABLE_FIELD = "pef_first_ultrasound_report";
const PEF_ULTRASOUND_REPORTS_FIELD = "pef_ultrasound_reports";
const PEF_RETIRED_FIELDS = [
  "pef_first_ultrasound_facility",
  "pef_other_ultrasound_since_first",
];
const HHQ_SINGLE_MOBILE_NAME = "hhq_contact_mobile";
const HHQ_MOBILE_LIST_NAME = "hhq_contact_mobile_numbers";
const HHQ_MOBILE_ROW_NAME = "mobile_number";
const HHQ_MOBILE_HOLDER_ROW_NAME = "mobile_holder_name";
const HHQ_HOUSEHOLD_NUMBER_NAME = "hhq_household_number";
const HHQ_HANDWASHING_PLACE_NAME = "hhq_we_like_learn_about_places_that_households_use";
const HHQ_HANDWASHING_OBSERVATION_NAME = "hhq_observation_only";
const HHQ_RESULT_INTERVIEW_NAME = "hhq_result_interview";
const HHQ_HIGHEST_GRADE_NAME = "member_highest_grade_completed";
const HHQ_MEMBER_LIVING_SINCE_BIRTH_NAME = "member_living_since_birth";
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
const WQ_SINGLE_MOBILE_NAME = "wq_woman_mobile";
const WQ_SINGLE_MOBILE_HOLDER_NAME = "wq_woman_mobile_holder_name";
const WQ_MOBILE_LIST_NAME = "wq_woman_mobile_numbers";
const WQ_MOBILE_ROW_NAME = "wq_woman_mobile";
const WQ_MOBILE_HOLDER_ROW_NAME = "wq_woman_mobile_holder_name";
const WQ_HUSBAND_PARTNER_MOBILE_NAME = "wq_husband_partner_mobile";
const WQ_WOMAN_AVAILABLE_NAME = "wq_woman_available";
const WQ_CONSENT_NAME = "wq_consent_study";
const WQ_MARITAL_NAME = "wq_current_marital_status";
const WQ_RESULT_INTERVIEW_NAME = "wq_result_interview";
const WQ_OUTCOME_COMPLETED_VALUE = 1;
const WQ_OUTCOME_NOT_AT_HOME_VALUE = 2;
const WQ_OUTCOME_POSTPONED_VALUE = 3;
const WQ_OUTCOME_INCAPACITATED_VALUE = 6;
const WQ_OUTCOME_REFUSED_CONSENT_VALUE = 8;
const WQ_FULL_INTERVIEW_COMPLETED_NAME = "wq_full_interview_completed";
export const WQ_BORN_ALIVE_CHILD_FOLLOWUPS_NAME = "wq_born_alive_child_followups";
export const WQ_FOLLOWUP_PREGNANCY_INDEX_NAME = "wq_followup_pregnancy_index";
export const WQ_FOLLOWUP_CHILD_INDEX_NAME = "wq_followup_child_index";
export const WQ_FOLLOWUP_COMPLETED_NAME = "wq_followup_completed";
export const WQ_PREGNANCY_ROW_ID_NAME = "wq_pregnancy_row_id";
export const WQ_REPRODUCTION_COMPARISON_NAME = "wq_reproduction_comparison_table";
const WQ_Q29_NAME = "wq_02_reproduction_compare_12_with_number_of_pregnancy_outcom";
const WQ_Q30_NAME = "wq_02_reproduction_did_you_ever_experience_a_delivery_by_caes";
const WQ_Q33A_NAME = "wq_02_reproduction_when_did_your_last_menstrual_period_start";
const WQ_Q10_DOB_NAME =
  "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born";
const WQ_REPRODUCTION_PAGE_NAME = "page_02_reproduction";
const WQ_REPRODUCTION_Q1_NAME =
  "wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt";
const WQ_REPRODUCTION_Q13_NAME = "wq_02_reproduction_check_12";
const WQ_REPRODUCTION_INTRO_TEXT =
  "Now I would like to ask about all the births you have had during your life.";
const WQ_REPRODUCTION_Q1_TITLE = "1. Have you ever given birth?";
const WQ_REPRODUCTION_Q13_TITLE =
  "13. Now i would like to confirm if you had (Read these options to Respondent)";
const WQ_PREGNANCY_HISTORY_TITLE =
  "14. Now I would like to record all your pregnancies including live births, stillbirths, miscarriages, and abortions, starting with your first pregnancy";
const WQ_REPRODUCTION_Q23_NAME =
  "pregnancy_02_reproduction_check_16_17_and_21_if_16_i_1_or_17_i_1_the";
const WQ_REPRODUCTION_Q23_TITLE = "23_i. PREGNANCY OUTCOME";
const WQ_Q9_RESIDENCE_YEARS_NAME =
  "wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously";
const WQ_Q12_GENERAL_HEALTH_NAME =
  "wq_01_respondent_s_backgr_in_general_would_you_say_your_health_is_ve";
const WQ_Q14_HIGHEST_GRADE_NAME =
  "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed";
const WQ_HUSBAND_HIGHEST_GRADE_NAME =
  "wq_04_husband_s_backgroun_what_was_the_highest_grade_he_completed";
const WQ_Q32_PREGNANT_NAME = "wq_pregnant";
const WQ_Q35_FIRST_PERIOD_AGE_NAME =
  "wq_02_reproduction_how_old_were_you_when_you_had_your_first_m";
const WQ_HEALTH_PAGE_NAME = "page_03_other_health_issues";
const WQ_DOMESTIC_VIOLENCE_PAGE_NAME = "page_05_domestic_violence";
const WQ_BIOMARKERS_PAGE_NAME = "page_06_biomarkers";
const WQ_BIOMARKER_HEIGHT_NAME = "wq_height_measured_site_cm";
const WQ_BIOMARKER_WEIGHT_NAME = "wq_weight_measured_site_kg";
const WQ_BIOMARKER_BLOOD_PRESSURE_NAME = "wq_blood_pressure_measured_site";
const WQ_BIOMARKER_HEMOGLOBIN_NAME = "wq_hemoglobin_measured_site";
const WQ_HEALTH_INTRO_NAME =
  "wq_03_other_health_issues_i_would_like_to_ask_some_questions_about_y";
const WQ_Q10_SMOKING_NAME =
  "wq_03_other_health_issues_now_i_would_like_to_ask_you_some_questions";
const WQ_Q10_SMOKING_INTRO_NAME = "wq_03_smoking_tobacco_intro";
const WQ_Q10_SMOKING_INTRO_TEXT =
  "Now I would like to ask you some questions on smoking and tobacco use.";
const WQ_Q10_SMOKING_TITLE =
  "10. Do you currently smoke cigarettes every day, some days, or not at all?";
const WQ_Q16_ALCOHOL_NAME =
  "wq_03_other_health_issues_now_i_would_like_to_ask_you_some_questions_2";
const WQ_Q16_ALCOHOL_INTRO_NAME = "wq_03_drinking_alcohol_intro";
const WQ_Q16_ALCOHOL_INTRO_TEXT =
  "Now I would like to ask you some questions about drinking alcohol.";
const WQ_Q16_ALCOHOL_TITLE =
  "16. Have you ever consumed any alcohol, such as beer, wine, spirits, or [ADD OTHER LOCAL EXAMPLES]?";
const WQ_HUSBAND_BACKGROUND_PAGE_NAME = "page_04_husband_background_woman_work";
const WQ_HUSBAND_Q6_SMOKING_NAME =
  "wq_04_husband_s_backgroun_now_i_would_like_to_ask_you_some_questions";
const WQ_HUSBAND_Q6_SMOKING_INTRO_NAME = "wq_04_husband_smoking_tobacco_intro";
const WQ_HUSBAND_Q6_SMOKING_INTRO_TEXT =
  "Now I would like to ask you some questions on smoking and tobacco use of your husband/partner.";
const WQ_HUSBAND_Q6_SMOKING_TITLE =
  "6. Does your husband/partner currently smoke cigarettes every day, some days, or not at all?";
const WQ_HUSBAND_Q13_ALCOHOL_DAYS_NAME =
  "wq_04_husband_s_backgroun_during_the_last_one_month_on_how_many_days";
const WQ_HUSBAND_Q13_ALCOHOL_DAYS_TITLE =
  "13. During the last one month, on how many days did your husband/partner have at least one drink of alcohol?\nIf non-numeric answer, probe to get an estimate. If respondent answers 'every day' or 'almost every day'";
const WQ_HUSBAND_Q13_ALCOHOL_DAYS_DESCRIPTION =
  "Enter number of days as exactly 2 digits.";
const WQ_HUSBAND_Q14_ALCOHOL_DRINKS_NAME =
  "wq_04_husband_s_backgroun_we_count_one_drink_of_alcohol_as_one_can_o";
const WQ_Q20_PAYMENT_KIND_NAME =
  "wq_04_husband_s_backgroun_are_you_paid_in_cash_or_kind_for_this_work";
const WQ_DOMESTIC_VIOLENCE_BACKGROUND_FIELDS = new Set([
  "wq_05_domestic_violence_check_answer_to_marital_status_on_01_respo",
  "wq_05_domestic_violence_check_12a_13a_14a_15a_16a_17a_18a_19a_20a",
]);
const WQ_Q22B_NAME = "wq_02_reproduction_read_the_list_of_pregnancy_outcomes_in_ord";
const WQ_Q22B_PAGE_NAME = "page_02c_reproduction_confirmation";
const WQ_COMPARISON_PAGE_NAME = "page_02d_reproduction_comparison";
const WQ_POST_COMPARISON_PAGE_NAME = "page_02e_reproduction_after_comparison";
const WQ_PREGNANCY_BABY_NAME_NAME =
  "pregnancy_02_reproduction_what_name_was_given_to_the_baby";
const WQ_PREGNANCY_BABY_SEX_NAME =
  "pregnancy_02_reproduction_is_name_a_boy_or_a_girl";
const WQ_CHILD_ALIVE_NAME = "pregnancy_02_reproduction_is_name_still_alive";
const WQ_CHILD_AGE_NAME =
  "pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b";
const WQ_CHILD_LIVING_WITH_NAME =
  "pregnancy_02_reproduction_if_born_alive_and_still_living_is_name_liv";
const WQ_CHILD_LINE_NAME =
  "pregnancy_02_reproduction_if_born_alive_and_still_living_record_hous";
const WQ_CHILD_DEATH_AGE_NAME =
  "pregnancy_02_reproduction_if_born_alive_and_now_dead_if_19_i_1_boy_h";
const WQ_CHILD_FOLLOWUP_NAMES = [
  WQ_CHILD_ALIVE_NAME,
  WQ_CHILD_AGE_NAME,
  WQ_CHILD_LIVING_WITH_NAME,
  WQ_CHILD_LINE_NAME,
  WQ_CHILD_DEATH_AGE_NAME,
];
const WQ_PREGNANCY_HISTORY_NAME = "wq_pregnancy_history";
const WQ_OUTCOME_NO_HARD_STOP_VISIBLE_IF =
  `({${WQ_WOMAN_AVAILABLE_NAME}} empty or {${WQ_WOMAN_AVAILABLE_NAME}} = 1) and ` +
  `({${WQ_CONSENT_NAME}} empty or {${WQ_CONSENT_NAME}} != 2)`;
const WQ_OUTCOME_NORMAL_VISIBLE_IF =
  `({${WQ_WOMAN_AVAILABLE_NAME}} empty or {${WQ_WOMAN_AVAILABLE_NAME}} = 1) and ` +
  `({${WQ_CONSENT_NAME}} empty or {${WQ_CONSENT_NAME}} != 2) and ` +
  `({${WQ_MARITAL_NAME}} empty or {${WQ_MARITAL_NAME}} != 7)`;
const WQ_STOP_OUTCOME_VISIBLE_IF = {
  [WQ_OUTCOME_COMPLETED_VALUE]: `{${WQ_MARITAL_NAME}} = 7`,
  [WQ_OUTCOME_NOT_AT_HOME_VALUE]: `{${WQ_WOMAN_AVAILABLE_NAME}} = 4`,
  [WQ_OUTCOME_POSTPONED_VALUE]: `{${WQ_WOMAN_AVAILABLE_NAME}} = 3`,
  [WQ_OUTCOME_INCAPACITATED_VALUE]: `{${WQ_WOMAN_AVAILABLE_NAME}} = 2`,
  [WQ_OUTCOME_REFUSED_CONSENT_VALUE]: `{${WQ_WOMAN_AVAILABLE_NAME}} = 1 and {${WQ_CONSENT_NAME}} = 2`,
};

function isHhqForm(form) {
  return form?.form_code === HHQ_FORM_CODE;
}

function isPefForm(form) {
  return String(form?.form_code || "").toUpperCase() === PEF_FORM_CODE;
}

function addPefUltrasoundReports(surveyJson) {
  return {
    ...surveyJson,
    pages: (surveyJson.pages || []).map((page) => ({
      ...page,
      elements: (page.elements || []).flatMap((element) => {
        if (element.name !== PEF_ULTRASOUND_AVAILABLE_FIELD) return [element];
        return [
          element,
          {
            type: "text",
            name: PEF_ULTRASOUND_REPORTS_FIELD,
            title: "Ultrasound reports",
            renderAs: "pef_ultrasound_reports",
            visibleIf: `{${PEF_ULTRASOUND_DONE_FIELD}} = 1 and {${PEF_ULTRASOUND_AVAILABLE_FIELD}} = 1`,
          },
        ];
      }),
    })),
  };
}

function applyPefNegativeUptOutcome(surveyJson) {
  const negativeGuard = `{${PEF_ON_SPOT_UPT_RESULT_FIELD}} != ${PEF_NEGATIVE_UPT_VALUE}`;
  let foundUptQuestion = false;

  const pages = (surveyJson.pages || []).map((page) => ({
    ...page,
    elements: (page.elements || []).map((element) => {
      if (element.name === PEF_ON_SPOT_UPT_RESULT_FIELD) {
        foundUptQuestion = true;
        return element;
      }
      if (!foundUptQuestion) return element;
      return {
        ...element,
        visibleIf: element.visibleIf
          ? `(${element.visibleIf}) and (${negativeGuard})`
          : negativeGuard,
      };
    }),
  }));

  if (!foundUptQuestion || pages.some((page) => page.name === PEF_OUTCOME_PAGE_NAME)) {
    return { ...surveyJson, pages };
  }

  return {
    ...surveyJson,
    pages: [
      ...pages,
      {
        name: PEF_OUTCOME_PAGE_NAME,
        title: { default: "Outcome", hi: "", kn: "", mr: "", ta: "", te: "", ur: "" },
        visibleIf: `{${PEF_ON_SPOT_UPT_RESULT_FIELD}} = ${PEF_NEGATIVE_UPT_VALUE}`,
        elements: [
          {
            type: "html",
            name: "pef_negative_upt_outcome_message",
            html:
              "UPT result is Negative. Stop filling the Pregnancy Enrollment Form for this woman. After final submission, her Pregnancy Surveillance Form task will continue as per the task flow.",
          },
        ],
      },
    ],
  };
}

function applyMandatoryHhqSurveyJson(surveyJson) {
  function visit(elements = []) {
    return elements.map((element) => {
      const next = { ...element };
      if (next.name === HHQ_MEMBER_LIVING_SINCE_BIRTH_NAME) {
        // This backend code is selected inside the combined Q6_i duration
        // control. It is not a separate question for rendering or progress.
        next.renderAs = "background";
      }
      if (
        next.name &&
        next.name !== "hhq_household_members" &&
        next.name !== HHQ_MEMBER_LIVING_SINCE_BIRTH_NAME &&
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

function applyHhqHighestGradeInput(surveyJson) {
  function visit(elements = []) {
    return elements.map((element) => {
      const next = { ...element };
      if (next.name === HHQ_HIGHEST_GRADE_NAME) {
        return {
          ...next,
          // This field accepts arbitrary 1-2 digit completed years in addition
          // to the two special coded answers. A SurveyJS radiogroup discards
          // arbitrary values during page/form validation, so keep the native
          // combined renderer but use a text-backed SurveyJS value model.
          type: "text",
          renderAs: "years_with_special_codes",
          allowYearsOverrideSpecialCodes: true,
          renderingHint: { ...(next.renderingHint || {}), render_as: "years_with_special_codes" },
          sourceType: "integer_or_special_code",
          rawText: "What is the highest grade (name) has ever completed? |_|_| years 98 Don't know",
          choices: (next.choices || []).filter((choice) => [0, 98].includes(Number(choice.value))),
        };
      }
      if (Array.isArray(next.elements)) next.elements = visit(next.elements);
      if (Array.isArray(next.templateElements)) next.templateElements = visit(next.templateElements);
      return next;
    });
  }

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({ ...page, elements: visit(page.elements) })),
  };
}

// The language is selected by the app language switcher and must be retained
// in answers, but it is not an interviewer-facing HHQ question.
function hideQuestionnaireLanguageFields(surveyJson) {
  function visit(elements = []) {
    return elements.map((element) => {
      const next = { ...element };
      if (/_language_questionnaire$/.test(String(next.name || ""))) {
        next.renderAs = "background";
      }
      if (Array.isArray(next.elements)) next.elements = visit(next.elements);
      if (Array.isArray(next.templateElements)) next.templateElements = visit(next.templateElements);
      return next;
    });
  }

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({ ...page, elements: visit(page.elements) })),
  };
}

function toMultipleMobilePanel(element) {
  return {
    type: "paneldynamic",
    name: HHQ_MOBILE_LIST_NAME,
    title: element.title,
    description: {
      ...(typeof element.description === "object" ? element.description : {}),
      default: "Please enter the mobile number and the mobile number holder name.",
    },
    minPanelCount: 1,
    panelCount: 1,
    addPanelText: "Add mobile number",
    removePanelText: "Remove mobile number",
    ...(element.visibleIf ? { visibleIf: element.visibleIf } : {}),
    templateElements: [
      {
        type: "text",
        name: HHQ_MOBILE_HOLDER_ROW_NAME,
        title: "Mobile number holder name",
        inputType: "text",
      },
      {
        type: "text",
        name: HHQ_MOBILE_ROW_NAME,
        title: "Please enter the mobile number",
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

function allowMultipleWqMobileNumbers(surveyJson) {
  function visit(elements = []) {
    return elements.flatMap((element) => {
      if (element.name === WQ_SINGLE_MOBILE_HOLDER_NAME) return [];
      if (element.name === WQ_SINGLE_MOBILE_NAME && element.type === "text") {
        return [{
          type: "paneldynamic",
          name: WQ_MOBILE_LIST_NAME,
          title: element.title,
          description: {
            default: "Please enter the mobile number and the mobile number holder name.",
          },
          order: element.order,
          section_order: element.section_order,
          sourceCode: element.sourceCode,
          sourceType: "repeatable_mobile_contacts",
          rawText: element.rawText,
          minPanelCount: 0,
          panelCount: 0,
          addPanelText: "Add mobile number",
          removePanelText: "Remove mobile number",
          ...(element.visibleIf ? { visibleIf: element.visibleIf } : {}),
          templateElements: [
            {
              type: "text",
              name: WQ_MOBILE_HOLDER_ROW_NAME,
              title: "Mobile number holder name",
              inputType: "text",
              isRequired: true,
            },
            {
              type: "text",
              name: WQ_MOBILE_ROW_NAME,
              title: "Please enter the mobile number",
              inputType: "tel",
              isRequired: true,
              maxLength: element.maxLength,
              validators: element.validators || [],
            },
          ],
        }];
      }
      const next = { ...element };
      if (Array.isArray(next.elements)) next.elements = visit(next.elements);
      if (Array.isArray(next.templateElements)) next.templateElements = visit(next.templateElements);
      return [next];
    });
  }

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({ ...page, elements: visit(page.elements) })),
  };
}

function applyWqMobileNumberConstraints(surveyJson) {
  const mobileNames = new Set([WQ_SINGLE_MOBILE_NAME, WQ_HUSBAND_PARTNER_MOBILE_NAME]);
  const exactTenDigitValidator = {
    type: "regex",
    regex: "^[0-9]{10}$",
    text: {
      default: "Enter exactly 10 digits.",
      hi: "",
      kn: "",
      mr: "",
      ta: "",
      te: "",
      ur: "",
    },
  };

  function visit(elements = []) {
    return elements.map((element) => {
      let next = { ...element };
      if (mobileNames.has(element.name)) {
        next = {
          ...next,
          inputType: "tel",
          maxLength: 10,
          validators: [
            ...(Array.isArray(element.validators)
              ? element.validators.filter((validator) => validator.type !== "regex")
              : []),
            exactTenDigitValidator,
          ],
        };
      }
      if (Array.isArray(next.elements)) next.elements = visit(next.elements);
      if (Array.isArray(next.templateElements)) next.templateElements = visit(next.templateElements);
      return next;
    });
  }

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({ ...page, elements: visit(page.elements) })),
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

export function getQuestionnairePageIntro(form, pageName) {
  return isWqForm(form) && pageName === WQ_REPRODUCTION_PAGE_NAME
    ? WQ_REPRODUCTION_INTRO_TEXT
    : "";
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
            if (choice.value === WQ_OUTCOME_COMPLETED_VALUE) {
              // After the full interview (the final displayed section completed) the
              // outcome locks to Completed; hard stops still hide it because
              // they force their own outcome.
              return {
                ...choice,
                visibleIf:
                  `((${WQ_OUTCOME_NORMAL_VISIBLE_IF}) or (${stopVisibleIf}) or ` +
                  `{${WQ_FULL_INTERVIEW_COMPLETED_NAME}} = 1) and (${WQ_OUTCOME_NO_HARD_STOP_VISIBLE_IF})`,
              };
            }
            const baseVisibleIf = stopVisibleIf
              ? `((${WQ_OUTCOME_NORMAL_VISIBLE_IF}) and {${WQ_FULL_INTERVIEW_COMPLETED_NAME}} empty) or (${stopVisibleIf})`
              : `(${WQ_OUTCOME_NORMAL_VISIBLE_IF}) and {${WQ_FULL_INTERVIEW_COMPLETED_NAME}} empty`;
            return {
              ...choice,
              visibleIf: baseVisibleIf,
            };
          }),
        };
      }),
    })),
  };
}

function applyWqBornAliveChildFollowupLoop(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => {
      const followupQuestions = WQ_CHILD_FOLLOWUP_NAMES
        .map((name) => page.elements.find((element) => element.name === name))
        .filter(Boolean);
      if (followupQuestions.length !== WQ_CHILD_FOLLOWUP_NAMES.length) return page;

      const firstIndex = page.elements.findIndex((element) => element.name === WQ_CHILD_ALIVE_NAME);
      const panelQuestions = followupQuestions.map((element) => {
        if (element.name === WQ_CHILD_ALIVE_NAME) return { ...element, visibleIf: undefined };
        if (element.name === WQ_CHILD_DEATH_AGE_NAME) {
          return { ...element, visibleIf: `{panel.${WQ_CHILD_ALIVE_NAME}} = 2` };
        }
        if (element.name === WQ_CHILD_LINE_NAME) {
          return {
            ...element,
            visibleIf:
              `{panel.${WQ_CHILD_ALIVE_NAME}} = 1 and ` +
              `{panel.${WQ_CHILD_LIVING_WITH_NAME}} = 1`,
          };
        }
        return { ...element, visibleIf: `{panel.${WQ_CHILD_ALIVE_NAME}} = 1` };
      });
      const loop = {
        type: "paneldynamic",
        name: WQ_BORN_ALIVE_CHILD_FOLLOWUPS_NAME,
        title: "Born-alive child follow-up (Q24_i-Q28_i)",
        description: "Complete this loop once for every child classified as Born Alive in Q23_i.",
        minPanelCount: 0,
        panelCount: 0,
        renderAs: "wq_born_alive_child_followups",
        templateElements: [
          { type: "text", name: WQ_PREGNANCY_ROW_ID_NAME, visible: false, readOnly: true },
          { type: "text", name: WQ_FOLLOWUP_PREGNANCY_INDEX_NAME, visible: false, readOnly: true },
          { type: "text", name: WQ_FOLLOWUP_CHILD_INDEX_NAME, visible: false, readOnly: true },
          { type: "text", name: WQ_FOLLOWUP_COMPLETED_NAME, visible: false, readOnly: true },
          { type: "text", name: WQ_PREGNANCY_BABY_NAME_NAME, visible: false, readOnly: true },
          { type: "text", name: WQ_PREGNANCY_BABY_SEX_NAME, visible: false, readOnly: true },
          ...panelQuestions,
        ],
      };
      // The source Q24_i-Q28_i fields now render only inside the sequential
      // child loop. Survey Core lets visibleIf override visible=false, so an
      // always-false expression is required to prevent duplicate top-level
      // Q24_i-Q28_i controls while preserving their source definitions.
      const elements = page.elements.map((element) =>
        WQ_CHILD_FOLLOWUP_NAMES.includes(element.name)
          ? { ...element, visible: false, visibleIf: "1 = 0" }
          : element
      );
      elements.splice(firstIndex, 0, loop);
      return { ...page, elements };
    }),
  };
}

function addWqStablePregnancyRowId(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        if (
          element.name !== WQ_PREGNANCY_HISTORY_NAME ||
          !Array.isArray(element.templateElements) ||
          element.templateElements.some((child) => child.name === WQ_PREGNANCY_ROW_ID_NAME)
        ) {
          return element;
        }
        return {
          ...element,
          templateElements: [
            { type: "text", name: WQ_PREGNANCY_ROW_ID_NAME, visible: false, readOnly: true },
            ...element.templateElements,
          ],
        };
      }),
    })),
  };
}

function markWqLmpTimingControl(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.name === WQ_Q33A_NAME
          ? { ...element, renderAs: "wq_lmp_timing" }
          : element
      ),
    })),
  };
}

function markWqProgressiveDobControl(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.name === WQ_Q10_DOB_NAME
          ? { ...element, renderAs: "wq_progressive_dob" }
          : element
      ),
    })),
  };
}

function applyWqFinalSectionOrder(surveyJson) {
  const domesticViolenceIndex = surveyJson.pages.findIndex(
    (page) => page.name === WQ_DOMESTIC_VIOLENCE_PAGE_NAME
  );
  const biomarkersIndex = surveyJson.pages.findIndex(
    (page) => page.name === WQ_BIOMARKERS_PAGE_NAME
  );
  if (
    domesticViolenceIndex < 0 ||
    biomarkersIndex < 0 ||
    biomarkersIndex < domesticViolenceIndex
  ) {
    return surveyJson;
  }

  const pages = [...surveyJson.pages];
  const [biomarkersPage] = pages.splice(biomarkersIndex, 1);
  pages.splice(domesticViolenceIndex, 0, biomarkersPage);
  return { ...surveyJson, pages };
}

function applyWqBiomarkerEntryFormats(surveyJson) {
  const formats = {
    [WQ_BIOMARKER_HEIGHT_NAME]: {
      maxLength: 5,
      regex: "^\\d{3}(?:\\.\\d)?$",
      validationText:
        "Enter height as 3 digits with up to 1 decimal place in cm (for example 165 or 165.5).",
    },
    [WQ_BIOMARKER_WEIGHT_NAME]: {
      maxLength: 5,
      regex: "^\\d{2,3}\\.\\d$",
      validationText:
        "Enter weight as 2 to 3 digits with 1 decimal place in kg (for example 45.6 or 121.4).",
    },
    [WQ_BIOMARKER_HEMOGLOBIN_NAME]: {
      maxLength: 4,
      regex: "^\\d{1,2}(?:\\.\\d)?$",
      validationText:
        "Enter hemoglobin as 1 to 2 digits with up to 1 decimal place (for example 9, 12, or 12.5).",
    },
  };

  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        if (element.name === WQ_BIOMARKER_BLOOD_PRESSURE_NAME) {
          return {
            ...element,
            items: (element.items || []).map((item) =>
              item.name === "diastolic"
                ? {
                    ...item,
                    maxLength: 3,
                    validators: (item.validators || []).map((validator) =>
                      validator.type === "regex"
                        ? {
                            ...validator,
                            regex: "^\\d{2,3}$",
                            text: replaceDefaultLocalizedText(
                              validator.text,
                              "Enter diastolic as 2 to 3 digits (for example 85 or 123)."
                            ),
                          }
                        : validator
                    ),
                  }
                : item
            ),
          };
        }
        const format = formats[element.name];
        if (!format) return element;
        return {
          ...element,
          sourceType: "decimal",
          maxLength: format.maxLength,
          validators: (element.validators || []).map((validator) =>
            validator.type === "regex"
              ? {
                  ...validator,
                  regex: format.regex,
                  text: replaceDefaultLocalizedText(validator.text, format.validationText),
                }
              : validator
          ),
        };
      }),
    })),
  };
}

function replaceDefaultLocalizedText(value, text) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...value, default: text };
  }
  return text;
}

// Synced protocol forms are authoritative at runtime and can be older than
// the bundled display copy. Apply these interviewer-facing labels after the
// runtime form is selected so synced forms and existing drafts receive the
// same wording without changing field names, choices, values, or skip logic.
function applyWqReproductionQuestionText(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => {
      const elements = page.elements.map((element) => {
        if (element.name === WQ_REPRODUCTION_Q1_NAME) {
          return {
            ...element,
            title: replaceDefaultLocalizedText(element.title, WQ_REPRODUCTION_Q1_TITLE),
          };
        }
        if (element.name === WQ_REPRODUCTION_Q13_NAME) {
          return {
            ...element,
            title: replaceDefaultLocalizedText(element.title, WQ_REPRODUCTION_Q13_TITLE),
          };
        }
        if (element.name === WQ_PREGNANCY_HISTORY_NAME) {
          return {
            ...element,
            title: replaceDefaultLocalizedText(element.title, WQ_PREGNANCY_HISTORY_TITLE),
          };
        }
        if (element.name === WQ_REPRODUCTION_Q23_NAME) {
          return {
            ...element,
            title: replaceDefaultLocalizedText(element.title, WQ_REPRODUCTION_Q23_TITLE),
          };
        }
        return element;
      });

      return { ...page, elements };
    }),
  };
}

function applyWqSmokingQuestionText(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => {
      if (page.name !== WQ_HEALTH_PAGE_NAME) return page;

      const elementsWithoutIntro = page.elements.filter(
        (element) => element.name !== WQ_Q10_SMOKING_INTRO_NAME,
      );
      const smokingQuestionIndex = elementsWithoutIntro.findIndex(
        (element) => element.name === WQ_Q10_SMOKING_NAME,
      );
      if (smokingQuestionIndex < 0) return page;

      const smokingQuestion = elementsWithoutIntro[smokingQuestionIndex];
      const instruction = {
        type: "html",
        name: WQ_Q10_SMOKING_INTRO_NAME,
        html: WQ_Q10_SMOKING_INTRO_TEXT,
        renderAs: "instruction",
        order: smokingQuestion.order,
        section_order: smokingQuestion.section_order,
        sourceType: "section_note",
      };
      const updatedQuestion = {
        ...smokingQuestion,
        title: replaceDefaultLocalizedText(smokingQuestion.title, WQ_Q10_SMOKING_TITLE),
      };
      const elements = [...elementsWithoutIntro];
      elements.splice(smokingQuestionIndex, 1, instruction, updatedQuestion);
      return { ...page, elements };
    }),
  };
}

function applyWqAlcoholQuestionText(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => {
      if (page.name !== WQ_HEALTH_PAGE_NAME) return page;

      const elementsWithoutIntro = page.elements.filter(
        (element) => element.name !== WQ_Q16_ALCOHOL_INTRO_NAME,
      );
      const alcoholQuestionIndex = elementsWithoutIntro.findIndex(
        (element) => element.name === WQ_Q16_ALCOHOL_NAME,
      );
      if (alcoholQuestionIndex < 0) return page;

      const alcoholQuestion = elementsWithoutIntro[alcoholQuestionIndex];
      const instruction = {
        type: "html",
        name: WQ_Q16_ALCOHOL_INTRO_NAME,
        html: WQ_Q16_ALCOHOL_INTRO_TEXT,
        renderAs: "instruction",
        order: alcoholQuestion.order,
        section_order: alcoholQuestion.section_order,
        sourceType: "section_note",
      };
      const updatedQuestion = {
        ...alcoholQuestion,
        title: replaceDefaultLocalizedText(alcoholQuestion.title, WQ_Q16_ALCOHOL_TITLE),
      };
      const elements = [...elementsWithoutIntro];
      elements.splice(alcoholQuestionIndex, 1, instruction, updatedQuestion);
      return { ...page, elements };
    }),
  };
}

function applyWqHusbandSmokingQuestionText(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => {
      if (page.name !== WQ_HUSBAND_BACKGROUND_PAGE_NAME) return page;

      const elementsWithoutIntro = page.elements.filter(
        (element) => element.name !== WQ_HUSBAND_Q6_SMOKING_INTRO_NAME,
      );
      const smokingQuestionIndex = elementsWithoutIntro.findIndex(
        (element) => element.name === WQ_HUSBAND_Q6_SMOKING_NAME,
      );
      if (smokingQuestionIndex < 0) return page;

      const smokingQuestion = elementsWithoutIntro[smokingQuestionIndex];
      const instruction = {
        type: "html",
        name: WQ_HUSBAND_Q6_SMOKING_INTRO_NAME,
        html: WQ_HUSBAND_Q6_SMOKING_INTRO_TEXT,
        renderAs: "instruction",
        order: smokingQuestion.order,
        section_order: smokingQuestion.section_order,
        sourceType: "section_note",
      };
      const updatedQuestion = {
        ...smokingQuestion,
        title: replaceDefaultLocalizedText(smokingQuestion.title, WQ_HUSBAND_Q6_SMOKING_TITLE),
      };
      const elements = [...elementsWithoutIntro];
      elements.splice(smokingQuestionIndex, 1, instruction, updatedQuestion);
      return { ...page, elements };
    }),
  };
}

function applyWqHusbandAlcoholDaysInput(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.name === WQ_HUSBAND_Q13_ALCOHOL_DAYS_NAME
          ? {
              ...element,
              title: replaceDefaultLocalizedText(
                element.title,
                WQ_HUSBAND_Q13_ALCOHOL_DAYS_TITLE,
              ),
              description: replaceDefaultLocalizedText(
                element.description,
                WQ_HUSBAND_Q13_ALCOHOL_DAYS_DESCRIPTION,
              ),
              allowYearsOverrideSpecialCodes: true,
            }
          : element
      ),
    })),
  };
}

function applyWqHusbandAlcoholDrinksInput(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.name === WQ_HUSBAND_Q14_ALCOHOL_DRINKS_NAME
          ? {
              ...element,
              entryUnitLabel: "Drinks",
              allowYearsOverrideSpecialCodes: true,
            }
          : element
      ),
    })),
  };
}

function applyWqQ20PaymentChoiceText(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.name === WQ_Q20_PAYMENT_KIND_NAME
          ? {
              ...element,
              choices: (element.choices || []).map((choice) =>
                Number(choice.value) === 1
                  ? { ...choice, text: replaceDefaultLocalizedText(choice.text, "Cash /Online/UPI") }
                  : choice
              ),
            }
          : element
      ),
    })),
  };
}

function hideWqDomesticViolenceCalculatedQuestions(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        WQ_DOMESTIC_VIOLENCE_BACKGROUND_FIELDS.has(element.name)
          ? {
              ...element,
              renderAs: "background",
              renderingHint: { ...(element.renderingHint || {}), render_as: "background" },
            }
          : element
      ),
    })),
  };
}

function applyWqHealthSectionIntro(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => {
      if (page.name !== WQ_HEALTH_PAGE_NAME) return page;
      const intro = page.elements.find((element) => element.name === WQ_HEALTH_INTRO_NAME);
      if (!intro) return page;
      return {
        ...page,
        elements: [
          { ...intro, renderAs: "instruction" },
          ...page.elements.filter((element) => element.name !== WQ_HEALTH_INTRO_NAME),
        ],
      };
    }),
  };
}

function applyWqResidenceYearsInput(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.name === WQ_Q9_RESIDENCE_YEARS_NAME
          ? {
              ...element,
              type: "text",
              renderAs: "years_with_special_codes",
              allowYearsOverrideSpecialCodes: true,
            }
          : element
      ),
    })),
  };
}

function removeWqQ12TrainingDescription(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.name === WQ_Q12_GENERAL_HEALTH_NAME
          ? { ...element, description: undefined }
          : element
      ),
    })),
  };
}

function removeWqQ32AndQ35Descriptions(surveyJson) {
  const names = new Set([WQ_Q32_PREGNANT_NAME, WQ_Q35_FIRST_PERIOD_AGE_NAME]);
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        names.has(element.name) ? { ...element, description: undefined } : element
      ),
    })),
  };
}

function applyWqHighestGradeInput(surveyJson) {
  const highestGradeNames = new Set([
    WQ_Q14_HIGHEST_GRADE_NAME,
    WQ_HUSBAND_HIGHEST_GRADE_NAME,
  ]);
  return {
    ...surveyJson,
    pages: surveyJson.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        if (!highestGradeNames.has(element.name)) return element;
        return {
          ...element,
          type: "text",
          renderAs: "years_with_special_codes",
          allowYearsOverrideSpecialCodes: true,
          description: "Training - refer to NFHS-6 Manual",
          choices: (element.choices || []).filter((choice) => [0, 98].includes(Number(choice.value))),
        };
      }),
    })),
  };
}

function applyWqReproductionComparisonTable(surveyJson) {
  return {
    ...surveyJson,
    pages: surveyJson.pages.flatMap((page) => {
      const q29Index = page.elements.findIndex((element) => element.name === WQ_Q29_NAME);
      if (q29Index < 0) return [page];
      const elements = [...page.elements];
      elements.splice(q29Index, 0, {
        type: "html",
        name: WQ_REPRODUCTION_COMPARISON_NAME,
        title: "Reproductive history comparison",
        html: "Reproductive history comparison",
        renderAs: "wq_reproduction_comparison",
        visibleIf: page.elements[q29Index].visibleIf,
      });
      const transformedQ29Index = q29Index + 1;
      elements[transformedQ29Index] = {
        ...elements[transformedQ29Index],
        readOnly: true,
        visible: false,
        visibleIf: "1 = 0",
      };
      const q22bIndex = elements.findIndex((element) => element.name === WQ_Q22B_NAME);
      const comparisonIndex = elements.findIndex(
        (element) => element.name === WQ_REPRODUCTION_COMPARISON_NAME
      );
      const q30Index = elements.findIndex((element) => element.name === WQ_Q30_NAME);
      if (q22bIndex < 0 || comparisonIndex < 0 || q30Index < 0) {
        return [{ ...page, elements }];
      }
      return [
        { ...page, elements: elements.slice(0, q22bIndex) },
        {
          ...page,
          name: WQ_Q22B_PAGE_NAME,
          elements: elements.slice(q22bIndex, comparisonIndex),
        },
        {
          ...page,
          name: WQ_COMPARISON_PAGE_NAME,
          elements: elements.slice(comparisonIndex, q30Index),
        },
        {
          ...page,
          name: WQ_POST_COMPARISON_PAGE_NAME,
          elements: elements.slice(q30Index),
        },
      ];
    }),
  };
}
export function normalizeQuestionnaireSurveyData(form, data) {
  if (!data || typeof data !== "object") {
    return data || {};
  }
  if (isPefForm(form)) {
    const hasRetiredAnswer = PEF_RETIRED_FIELDS.some((fieldName) =>
      Object.prototype.hasOwnProperty.call(data, fieldName)
    );
    if (!hasRetiredAnswer) return data;
    const next = { ...data };
    for (const fieldName of PEF_RETIRED_FIELDS) delete next[fieldName];
    return next;
  }
  if (isHhqForm(form)) {
    if (Array.isArray(data[HHQ_MOBILE_LIST_NAME])) return data;
    const singleMobile = data[HHQ_SINGLE_MOBILE_NAME];
    if (!singleMobile) return data;
    const next = { ...data };
    next[HHQ_MOBILE_LIST_NAME] = [{ [HHQ_MOBILE_ROW_NAME]: String(singleMobile) }];
    delete next[HHQ_SINGLE_MOBILE_NAME];
    return next;
  }
  if (isWqForm(form)) {
    if (Array.isArray(data[WQ_MOBILE_LIST_NAME])) return data;
    const singleMobile = data[WQ_SINGLE_MOBILE_NAME];
    const holderName = data[WQ_SINGLE_MOBILE_HOLDER_NAME];
    if (!singleMobile && !holderName) return data;
    const next = { ...data };
    next[WQ_MOBILE_LIST_NAME] = [{
      ...(holderName ? { [WQ_MOBILE_HOLDER_ROW_NAME]: String(holderName) } : {}),
      ...(singleMobile ? { [WQ_MOBILE_ROW_NAME]: String(singleMobile) } : {}),
    }];
    delete next[WQ_SINGLE_MOBILE_NAME];
    delete next[WQ_SINGLE_MOBILE_HOLDER_NAME];
    return next;
  }
  return data;
}

// prepareQuestionnaireSurveyJson runs a chain of tree-walking transforms over
// a 200-350 KB form definition. It's pure (never mutates `form`) and, for a
// given form object, always produces the same result - so a WeakMap keyed on
// the form object lets repeat callers (the questionnaire dashboard and the
// baseline household form both prepare the same form per open) share one
// transform pass instead of re-running it every time.
const preparedSurveyJsonCache = new WeakMap();

export function getPreparedSurveyJson(form) {
  const cached = preparedSurveyJsonCache.get(form);
  if (cached) return cached;
  const prepared = prepareQuestionnaireSurveyJson(form);
  preparedSurveyJsonCache.set(form, prepared);
  return prepared;
}

export function prepareQuestionnaireSurveyJson(form) {
  let surveyJson = prepareSurveyJson(form);
  surveyJson = scopeDynamicPanelExpressions(surveyJson);
  surveyJson = hideQuestionnaireLanguageFields(surveyJson);
  if (isPefForm(form)) {
    surveyJson = addPefUltrasoundReports(surveyJson);
    surveyJson = applyPefNegativeUptOutcome(surveyJson);
  }
  if (isHhqForm(form)) {
    surveyJson = allowMultipleHhqMobileNumbers(surveyJson);
    surveyJson = applyHhqHighestGradeInput(surveyJson);
    surveyJson = markHhqDatabaseCheck(surveyJson);
    surveyJson = applyHhqOutcomeChoiceVisibility(surveyJson);
    surveyJson = applyMandatoryHhqSurveyJson(surveyJson);
  }
  if (isWqForm(form)) {
    surveyJson = applyWqFinalSectionOrder(surveyJson);
    surveyJson = applyWqBiomarkerEntryFormats(surveyJson);
    surveyJson = applyWqMobileNumberConstraints(surveyJson);
    surveyJson = allowMultipleWqMobileNumbers(surveyJson);
    surveyJson = applyWqReproductionQuestionText(surveyJson);
    surveyJson = applyWqHealthSectionIntro(surveyJson);
    surveyJson = applyWqSmokingQuestionText(surveyJson);
    surveyJson = applyWqAlcoholQuestionText(surveyJson);
    surveyJson = applyWqHusbandSmokingQuestionText(surveyJson);
    surveyJson = applyWqHusbandAlcoholDaysInput(surveyJson);
    surveyJson = applyWqHusbandAlcoholDrinksInput(surveyJson);
    surveyJson = applyWqQ20PaymentChoiceText(surveyJson);
    surveyJson = hideWqDomesticViolenceCalculatedQuestions(surveyJson);
    surveyJson = applyWqResidenceYearsInput(surveyJson);
    surveyJson = markWqProgressiveDobControl(surveyJson);
    surveyJson = removeWqQ12TrainingDescription(surveyJson);
    surveyJson = removeWqQ32AndQ35Descriptions(surveyJson);
    surveyJson = applyWqHighestGradeInput(surveyJson);
    surveyJson = applyWqOutcomeChoiceVisibility(surveyJson);
    surveyJson = addWqStablePregnancyRowId(surveyJson);
    surveyJson = applyWqBornAliveChildFollowupLoop(surveyJson);
    surveyJson = applyWqReproductionComparisonTable(surveyJson);
    surveyJson = markWqLmpTimingControl(surveyJson);
  }
  return surveyJson;
}
