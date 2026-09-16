/** Verifies HHQ definition transforms used by the native Survey Core renderer. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

const {
  getQuestionnairePageIntro,
  normalizeQuestionnaireSurveyData,
  prepareQuestionnaireSurveyJson,
} = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);

const root = path.dirname(fileURLToPath(import.meta.url));
const hhqPath = path.resolve(
  root,
  "../data/forms/baseline_household_questionnaire_v2026.05.09.json"
);
const hhq = JSON.parse(fs.readFileSync(hhqPath, "utf8"));
const wq = JSON.parse(fs.readFileSync(path.resolve(
  root,
  "../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json"
), "utf8"));

function findElementByName(surveyJson, name) {
  const queue = surveyJson.pages.flatMap((page) => page.elements || []);
  while (queue.length) {
    const element = queue.shift();
    if (element.name === name) return element;
    if (Array.isArray(element.elements)) queue.push(...element.elements);
    if (Array.isArray(element.templateElements)) queue.push(...element.templateElements);
  }
  return null;
}

function findTopLevelElementByName(surveyJson, name) {
  return surveyJson.pages
    .flatMap((page) => page.elements || [])
    .find((element) => element.name === name) || null;
}

const surveyJson = prepareQuestionnaireSurveyJson(hhq);
const wqSurveyJson = prepareQuestionnaireSurveyJson(wq);
const staleSyncedWq = structuredClone(wq);
const staleReproductionPage = staleSyncedWq.pages.find(
  (page) => page.name === "page_02_reproduction",
);
staleReproductionPage.elements = staleReproductionPage.elements
  .filter((element) => element.name !== "wq_02_reproduction_birth_history_intro")
  .map((element) => {
    if (element.name === "wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt") {
      return {
        ...element,
        title: {
          ...element.title,
          default: "Now I would like to ask about all the births you have had during your life. Have you ever given birth?",
        },
      };
    }
    if (element.name === "wq_02_reproduction_check_12") {
      return { ...element, title: { ...element.title, default: "CHECK 12" } };
    }
    return element;
  });
const staleSyncedWqSurveyJson = prepareQuestionnaireSurveyJson(staleSyncedWq);
const mobilePanel = findElementByName(surveyJson, "hhq_contact_mobile_numbers");
const wqMobilePanel = findElementByName(wqSurveyJson, "wq_woman_mobile_numbers");
const wqProgressiveDob = findElementByName(
  wqSurveyJson,
  "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born",
);
const wqResidenceYears = findElementByName(
  wqSurveyJson,
  "wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously",
);
const wqGeneralHealth = findElementByName(
  wqSurveyJson,
  "wq_01_respondent_s_backgr_in_general_would_you_say_your_health_is_ve",
);
const wqHighestGrade = findElementByName(
  wqSurveyJson,
  "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed",
);
const wqReproductionQ1 = findElementByName(
  wqSurveyJson,
  "wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt",
);
const wqReproductionQ13 = findElementByName(
  wqSurveyJson,
  "wq_02_reproduction_check_12",
);
const wqPregnancyHistory = findElementByName(wqSurveyJson, "wq_pregnancy_history");
const wqReproductionQ23 = findElementByName(
  wqSurveyJson,
  "pregnancy_02_reproduction_check_16_17_and_21_if_16_i_1_or_17_i_1_the",
);
const wqReproductionQ32 = findElementByName(wqSurveyJson, "wq_pregnant");
const wqReproductionQ35 = findElementByName(
  wqSurveyJson,
  "wq_02_reproduction_how_old_were_you_when_you_had_your_first_m",
);
const wqHealthPage = wqSurveyJson.pages.find(
  (page) => page.name === "page_03_other_health_issues",
);
const staleSyncedWqHealthPage = staleSyncedWqSurveyJson.pages.find(
  (page) => page.name === "page_03_other_health_issues",
);
assert.equal(
  wqHealthPage?.elements?.[0]?.type,
  "html",
  "BWQ Section 3 must begin with a read-only instruction",
);
assert.equal(
  wqHealthPage?.elements?.[0]?.html,
  "I would like to ask some questions about your current health condition",
  "BWQ Section 3 must show the current-health reading prompt at the top",
);
for (const healthPage of [wqHealthPage, staleSyncedWqHealthPage]) {
  const smokingQuestionIndex = healthPage?.elements?.findIndex(
    (element) =>
      element.name ===
      "wq_03_other_health_issues_now_i_would_like_to_ask_you_some_questions",
  );
  assert.ok(smokingQuestionIndex > 0, "BWQ Q10 must remain in Section 3");
  assert.equal(
    healthPage.elements[smokingQuestionIndex - 1]?.name,
    "wq_03_smoking_tobacco_intro",
    "BWQ Q10 must have its read-only smoking introduction immediately above it",
  );
  assert.equal(
    healthPage.elements[smokingQuestionIndex - 1]?.html,
    "Now I would like to ask you some questions on smoking and tobacco use.",
    "BWQ Q10 smoking introduction must use the requested reading text",
  );
  assert.equal(
    healthPage.elements[smokingQuestionIndex]?.title?.default,
    "Do you currently smoke cigarettes every day, some days, or not at all?",
    "BWQ Q10 title must contain only the answerable question",
  );
  const alcoholQuestionIndex = healthPage?.elements?.findIndex(
    (element) =>
      element.name ===
      "wq_03_other_health_issues_now_i_would_like_to_ask_you_some_questions_2",
  );
  assert.ok(alcoholQuestionIndex > 0, "BWQ Q16 must remain in Section 3");
  assert.equal(
    healthPage.elements[alcoholQuestionIndex - 1]?.name,
    "wq_03_drinking_alcohol_intro",
    "BWQ Q16 must have its read-only alcohol introduction immediately above it",
  );
  assert.equal(
    healthPage.elements[alcoholQuestionIndex - 1]?.html,
    "Now I would like to ask you some questions about drinking alcohol.",
    "BWQ Q16 alcohol introduction must use the requested reading text",
  );
  assert.equal(
    healthPage.elements[alcoholQuestionIndex]?.title?.default,
    "Have you ever consumed any alcohol, such as beer, wine, spirits, or [ADD OTHER LOCAL EXAMPLES]?",
    "BWQ Q16 title must contain only the answerable question",
  );
}
const singleMobile = findElementByName(surveyJson, "hhq_contact_mobile");
const memberMaritalStatus = findElementByName(surveyJson, "member_marital_status");
const memberEligibility = findElementByName(surveyJson, "member_woman_questionnaire_eligible");
const memberBirthRegistration = findElementByName(surveyJson, "member_birth_registration_status");
const memberEverAttendedSchool = findElementByName(surveyJson, "member_ever_attended_school");
const memberHighestGrade = findElementByName(surveyJson, "member_highest_grade_completed");
const memberLivingSinceBirth = findElementByName(surveyJson, "member_living_since_birth");
assert.equal(
  memberLivingSinceBirth.renderAs,
  "background",
  "Q6_i living-since-birth storage must not render or count as a separate question",
);
const drinkingWaterSource = findElementByName(
  surveyJson,
  "hhq_main_source_drinking_water_members_household_piped_water"
);
const toiletFacilityType = findElementByName(
  surveyJson,
  "hhq_kind_toilet_facility_members_household_usually_use_flush"
);
const floorMaterialType = findElementByName(
  surveyJson,
  "hhq_main_material_floor_natural_floor"
);
const roofMaterialType = findElementByName(
  surveyJson,
  "hhq_main_material_roof_natural_roofing"
);
const wallMaterialType = findElementByName(
  surveyJson,
  "hhq_main_material_external_walls_natural_walls"
);
const householdTotal = findElementByName(surveyJson, "hhq_total_household_members");
const householdNumber = findElementByName(surveyJson, "hhq_household_number");
const interviewDate = findElementByName(surveyJson, "hhq_interview_date");
const visitNo = findElementByName(surveyJson, "hhq_visit_no");
const competentRespondent = findElementByName(surveyJson, "hhq_competent_respondent_available");
const consent = findElementByName(
  surveyJson,
  "hhq_consent_study_provide_pis_explain_study_adult_member",
);
const outcomeResult = findElementByName(surveyJson, "hhq_result_interview");
const languageQuestion = findElementByName(surveyJson, "hhq_language_questionnaire");

assert.equal(languageQuestion.renderAs, "background");
assert.equal(findElementByName(wqSurveyJson, "wq_language_questionnaire").renderAs, "background");
assert.equal(wqProgressiveDob.renderAs, "wq_progressive_dob");
assert.equal(wqResidenceYears.type, "text");
assert.equal(wqResidenceYears.renderAs, "years_with_special_codes");
assert.equal(wqResidenceYears.allowYearsOverrideSpecialCodes, true);
assert.equal(wqGeneralHealth.description, undefined);
assert.equal(wqGeneralHealth.choices[0].text.default || wqGeneralHealth.choices[0].text, "Very Good");
assert.equal(wqHighestGrade.type, "text");
assert.equal(wqHighestGrade.renderAs, "years_with_special_codes");
assert.equal(wqHighestGrade.allowYearsOverrideSpecialCodes, true);
assert.equal(wqHighestGrade.description, "Training - refer to NFHS-6 Manual");
assert.deepEqual(wqHighestGrade.choices.map((choice) => choice.value), [0, 98]);
assert.equal(
  getQuestionnairePageIntro(wq, "page_02_reproduction"),
  "Now I would like to ask about all the births you have had during your life.",
);
assert.equal(getQuestionnairePageIntro(wq, "page_01_respondent_background"), "");
assert.equal(
  wqReproductionQ1.title.default || wqReproductionQ1.title,
  "1. Have you ever given birth?",
);
assert.equal(
  wqReproductionQ13.title.default || wqReproductionQ13.title,
  "13. Now i would like to confirm if you had (Read these options to Respondent)",
);
assert.equal(
  wqPregnancyHistory.title.default || wqPregnancyHistory.title,
  "14. Now I would like to record all your pregnancies including live births, stillbirths, miscarriages, and abortions, starting with your first pregnancy",
);
assert.doesNotMatch(
  wqPregnancyHistory.title.default || wqPregnancyHistory.title,
  /Answer questions 15 to 21/,
);
assert.equal(
  wqReproductionQ23.title.default || wqReproductionQ23.title,
  "23_i. CHECK 16, 17, and 21:",
);
assert.doesNotMatch(
  wqReproductionQ23.title.default || wqReproductionQ23.title,
  /PREGNANCY OUTCOME =/,
);
assert.equal(wqReproductionQ32.description, undefined);
assert.equal(wqReproductionQ35.description, undefined);
const staleQ1 = findElementByName(
  staleSyncedWqSurveyJson,
  "wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt",
);
const staleQ13 = findElementByName(
  staleSyncedWqSurveyJson,
  "wq_02_reproduction_check_12",
);
const staleQ23 = findElementByName(
  staleSyncedWqSurveyJson,
  "pregnancy_02_reproduction_check_16_17_and_21_if_16_i_1_or_17_i_1_the",
);
const staleQ32 = findElementByName(staleSyncedWqSurveyJson, "wq_pregnant");
const staleQ35 = findElementByName(
  staleSyncedWqSurveyJson,
  "wq_02_reproduction_how_old_were_you_when_you_had_your_first_m",
);
assert.equal(staleQ1.title.default || staleQ1.title, "1. Have you ever given birth?");
assert.equal(
  staleQ13.title.default || staleQ13.title,
  "13. Now i would like to confirm if you had (Read these options to Respondent)",
  "synced WQ definitions must receive the updated Q13 display text",
);
assert.equal(
  staleQ23.title.default || staleQ23.title,
  "23_i. CHECK 16, 17, and 21:",
  "synced WQ definitions must hide the Q23_i calculation instructions",
);
assert.equal(staleQ32.description, undefined, "synced WQ definitions must hide the Q32 description");
assert.equal(staleQ35.description, undefined, "synced WQ definitions must hide the Q35 description");
assert.equal(findTopLevelElementByName(wqSurveyJson, "wq_woman_mobile"), null);
assert.equal(findTopLevelElementByName(wqSurveyJson, "wq_woman_mobile_holder_name"), null);
assert.equal(wqMobilePanel.type, "paneldynamic");
assert.equal(wqMobilePanel.minPanelCount, 0);
assert.equal(wqMobilePanel.panelCount, 0);
assert.equal(wqMobilePanel.addPanelText, "Add mobile number");
assert.equal(wqMobilePanel.visibleIf, "{wq_woman_available} = 1 and {wq_consent_study} = 1");
assert.deepEqual(
  wqMobilePanel.templateElements.map(({ name, isRequired }) => ({ name, isRequired })),
  [
    { name: "wq_woman_mobile_holder_name", isRequired: true },
    { name: "wq_woman_mobile", isRequired: true },
  ],
);
assert.deepEqual(
  normalizeQuestionnaireSurveyData(wq, {
    wq_woman_mobile: "9999999999",
    wq_woman_mobile_holder_name: "Respondent",
  }),
  {
    wq_woman_mobile_numbers: [{
      wq_woman_mobile_holder_name: "Respondent",
      wq_woman_mobile: "9999999999",
    }],
  },
);
const wqMobileModel = new Model(wqSurveyJson);
wqMobileModel.setValue("wq_woman_available", 1);
wqMobileModel.setValue("wq_consent_study", 1);
const wqMobileQuestion = wqMobileModel.getQuestionByName("wq_woman_mobile_numbers");
assert.equal(wqMobileQuestion.isVisible, true);
const firstWqMobilePanel = wqMobileQuestion.addPanel();
firstWqMobilePanel.getQuestionByName("wq_woman_mobile_holder_name").value = "Respondent";
firstWqMobilePanel.getQuestionByName("wq_woman_mobile").value = "9999999999";
const secondWqMobilePanel = wqMobileQuestion.addPanel();
secondWqMobilePanel.getQuestionByName("wq_woman_mobile_holder_name").value = "Husband";
secondWqMobilePanel.getQuestionByName("wq_woman_mobile").value = "8888888888";
assert.deepEqual(wqMobileQuestion.value, [
  { wq_woman_mobile_holder_name: "Respondent", wq_woman_mobile: "9999999999" },
  { wq_woman_mobile_holder_name: "Husband", wq_woman_mobile: "8888888888" },
]);

assert.equal(singleMobile, null);
assert.equal(mobilePanel.type, "paneldynamic");
assert.equal(mobilePanel.panelCount, 1);
assert.equal(mobilePanel.minPanelCount, 1);
assert.equal(
  mobilePanel.visibleIf,
  "{hhq_consent_study_provide_pis_explain_study_adult_member} = 1"
);
assert.equal(mobilePanel.isRequired, undefined);
assert.equal(mobilePanel.templateElements.length, 2);
assert.equal(mobilePanel.templateElements[0].name, "mobile_holder_name");
assert.equal(mobilePanel.templateElements[0].inputType, "text");
assert.equal(mobilePanel.templateElements[1].name, "mobile_number");
assert.equal(mobilePanel.templateElements[1].inputType, "tel");
assert.equal(mobilePanel.templateElements[1].isRequired, true);
assert.deepEqual(mobilePanel.templateElements[1].validators, [
  {
    type: "regex",
    regex: "^[0-9]{10}$",
    text: {
      default: "Enter exactly 10 digits.",
      hi: "",
      kn: "",
      mr: "",
      ta: "",
      te: "",
      ur: ""
    }
  }
]);
assert.equal(memberMaritalStatus.visibleIf, "{panel.member_age_years} >= 13");
assert.equal(memberBirthRegistration.visibleIf, "{panel.member_age_years} >= 0 and {panel.member_age_years} <= 4");
assert.equal(memberEverAttendedSchool.visibleIf, "{panel.member_age_years} >= 5");
assert.equal(memberHighestGrade.type, "text");
assert.equal(memberHighestGrade.renderAs, "years_with_special_codes");
assert.deepEqual(memberHighestGrade.choices.map((choice) => choice.value), [0, 98]);
assert.equal(memberHighestGrade.visibleIf, "{panel.member_ever_attended_school} = 1");
assert.notEqual(memberLivingSinceBirth.isRequired, true);
assert.equal(memberEligibility.readOnly, true);
assert.equal(drinkingWaterSource.renderAs, "grouped_drinking_water_source");
assert.deepEqual(
  drinkingWaterSource.choices.map((choice) => choice.value),
  [11, 12, 13, 14, 21, 31, 32, 41, 42, 51, 61, 71, 81, 91, 92, 96]
);
assert.equal(toiletFacilityType.renderAs, "grouped_toilet_facility_type");
assert.deepEqual(
  toiletFacilityType.choices.map((choice) => choice.value),
  [11, 12, 13, 14, 15, 21, 22, 23, 31, 41, 51, 96]
);
assert.equal(floorMaterialType.renderAs, "grouped_floor_material_type");
assert.deepEqual(
  floorMaterialType.choices.map((choice) => choice.value),
  [11, 12, 13, 21, 22, 23, 24, 31, 32, 33, 34, 35, 36, 96]
);
assert.equal(roofMaterialType.renderAs, "grouped_roof_material_type");
assert.deepEqual(
  roofMaterialType.choices.map((choice) => choice.value),
  [11, 12, 13, 14, 15, 21, 22, 23, 24, 25, 31, 32, 33, 34, 35, 36, 37, 38, 39, 96]
);
assert.equal(wallMaterialType.renderAs, "grouped_external_wall_material_type");
assert.deepEqual(
  wallMaterialType.choices.map((choice) => choice.value),
  [11, 12, 13, 14, 21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 36, 96]
);
assert.equal(householdTotal.renderAs, "readonly_calculated_numeric");
assert.equal(householdNumber.renderAs, "db_check");
assert.equal(visitNo.renderAs, "readonly_summary");
assert.equal(visitNo.readOnly, true);
assert.equal(visitNo.visibleIf, "{hhq_interview_date} notempty");
assert.equal(visitNo.isRequired, undefined);
assert.equal(
  surveyJson.pages[0].elements.findIndex((element) => element.name === "hhq_visit_no"),
  surveyJson.pages[0].elements.findIndex((element) => element.name === "hhq_interview_date") + 1,
);
assert.equal(competentRespondent.renderAs, "radio");
assert.equal(competentRespondent.visibleIf, "{hhq_interview_date} notempty");
assert.equal(competentRespondent.choices.length, 3);
assert.equal(competentRespondent.choices[2].visibleIf, "{hhq_visit_no} < 3");
assert.equal(consent.visibleIf, "{hhq_competent_respondent_available} = 1");
assert.ok(outcomeResult.choices.every((choice) => choice.visibleIf));
assert.equal(surveyJson.clearInvisibleValues, "onHiddenContainer");
assert.equal(
  surveyJson.pages[1].visibleIf,
  "{hhq_consent_study_provide_pis_explain_study_adult_member} = 1"
);

const consentModel = new Model(surveyJson);
assert.equal(consentModel.getQuestionByName("hhq_visit_no").isVisible, false);
assert.equal(consentModel.getQuestionByName("hhq_competent_respondent_available").isVisible, false);
consentModel.setValue("hhq_interview_date", "2026-09-01");
assert.equal(consentModel.getQuestionByName("hhq_visit_no").isVisible, true);
assert.equal(consentModel.getQuestionByName("hhq_competent_respondent_available").isVisible, true);
consentModel.setValue("hhq_visit_no", 1);
assert.deepEqual(
  consentModel
    .getQuestionByName("hhq_competent_respondent_available")
    .visibleChoices.map((choice) => choice.value),
  [1, 2, 3],
);
consentModel.setValue("hhq_visit_no", 3);
assert.deepEqual(
  consentModel
    .getQuestionByName("hhq_competent_respondent_available")
    .visibleChoices.map((choice) => choice.value),
  [1, 2],
);
consentModel.setValue("hhq_competent_respondent_available", 2);
assert.equal(
  consentModel.getQuestionByName("hhq_consent_study_provide_pis_explain_study_adult_member").isVisible,
  false,
);
assert.equal(consentModel.visiblePages.length, 1);
consentModel.setValue("hhq_competent_respondent_available", 1);

const scheduleModel = new Model(surveyJson);
scheduleModel.setValue("hhq_site_id", 1);
scheduleModel.setValue("hhq_locality_code", "01");
scheduleModel.setValue("hhq_structure_map_id", "0001");
scheduleModel.setValue("hhq_household_number", "01");
scheduleModel.setValue("hhq_interview_date", "2026-09-01");
scheduleModel.setValue("hhq_competent_respondent_available", 1);
scheduleModel.setValue("hhq_consent_study_provide_pis_explain_study_adult_member", 1);
const scheduleRoster = scheduleModel.getQuestionByName("hhq_household_members");
scheduleRoster.value = [
  {
    member_name: "Age Twelve",
    member_age_years: 12,
    member_sex: 2,
    member_marital_status: 7,
  },
];
let schedulePanel = scheduleRoster.panels[0];
assert.equal(schedulePanel.getQuestionByName("member_marital_status").isVisible, false);
assert.equal(schedulePanel.getQuestionByName("member_birth_registration_status").isVisible, false);
assert.equal(schedulePanel.getQuestionByName("member_ever_attended_school").isVisible, true);
assert.equal(schedulePanel.getQuestionByName("member_highest_grade_completed").isVisible, false);

scheduleRoster.value = [
  {
    member_name: "Age Four",
    member_age_years: 4,
  },
];
schedulePanel = scheduleRoster.panels[0];
assert.equal(schedulePanel.getQuestionByName("member_birth_registration_status").isVisible, true);
assert.equal(schedulePanel.getQuestionByName("member_ever_attended_school").isVisible, false);

scheduleRoster.value = [
  {
    member_name: "Age Five",
    member_age_years: 5,
    member_ever_attended_school: 2,
  },
];
schedulePanel = scheduleRoster.panels[0];
assert.equal(schedulePanel.getQuestionByName("member_birth_registration_status").isVisible, false);
assert.equal(schedulePanel.getQuestionByName("member_ever_attended_school").isVisible, true);
assert.equal(schedulePanel.getQuestionByName("member_highest_grade_completed").isVisible, false);
scheduleRoster.value = [
  {
    member_name: "Age Five",
    member_age_years: 5,
    member_ever_attended_school: 1,
  },
];
schedulePanel = scheduleRoster.panels[0];
assert.equal(schedulePanel.getQuestionByName("member_highest_grade_completed").isVisible, true);
assert.equal(
  consentModel.getQuestionByName("hhq_consent_study_provide_pis_explain_study_adult_member").isVisible,
  true,
);
assert.equal(interviewDate.inputType, "date");
consentModel.setValue("hhq_consent_study_provide_pis_explain_study_adult_member", 1);
consentModel.setValue("hhq_result_interview", 1);
consentModel.setValue("hhq_language_questionnaire", 1);
consentModel.setValue("hhq_consent_study_provide_pis_explain_study_adult_member", 2);
assert.equal(consentModel.visiblePages.length, 1);
assert.equal(consentModel.getQuestionByName("hhq_result_interview").isVisible, false);
assert.equal(consentModel.getValue("hhq_result_interview"), undefined);
assert.equal(consentModel.getValue("hhq_language_questionnaire"), undefined);

const outcomeModel = new Model(surveyJson);
outcomeModel.setValue("hhq_interview_date", "2026-09-01");
outcomeModel.setValue("hhq_competent_respondent_available", 1);
outcomeModel.setValue("hhq_consent_study_provide_pis_explain_study_adult_member", 1);
const outcomeQuestion = outcomeModel.getQuestionByName("hhq_result_interview");
outcomeModel.setValue("hhq_we_like_learn_about_places_that_households_use", 2);
assert.deepEqual(outcomeQuestion.visibleChoices.map((choice) => choice.value), [1]);
outcomeModel.setValue("hhq_we_like_learn_about_places_that_households_use", 3);
assert.deepEqual(outcomeQuestion.visibleChoices.map((choice) => choice.value), [1]);
outcomeModel.setValue("hhq_we_like_learn_about_places_that_households_use", 4);
assert.deepEqual(outcomeQuestion.visibleChoices.map((choice) => choice.value), [10]);
outcomeModel.setValue("hhq_we_like_learn_about_places_that_households_use", 1);
outcomeModel.setValue("hhq_observation_only", ["A"]);
assert.deepEqual(outcomeQuestion.visibleChoices.map((choice) => choice.value), [1]);

console.log("Validated questionnaire SurveyJS JSON transforms.");
