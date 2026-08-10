/** Verifies HHQ definition transforms used by the native Survey Core renderer. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);

const root = path.dirname(fileURLToPath(import.meta.url));
const hhqPath = path.resolve(
  root,
  "../data/forms/baseline_household_questionnaire_v2026.05.09.json"
);
const hhq = JSON.parse(fs.readFileSync(hhqPath, "utf8"));

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

const surveyJson = prepareQuestionnaireSurveyJson(hhq);
const mobilePanel = findElementByName(surveyJson, "hhq_contact_mobile_numbers");
const singleMobile = findElementByName(surveyJson, "hhq_contact_mobile");
const memberMaritalStatus = findElementByName(surveyJson, "member_marital_status");
const memberEligibility = findElementByName(surveyJson, "member_woman_questionnaire_eligible");
const memberBirthRegistration = findElementByName(surveyJson, "member_birth_registration_status");
const memberEverAttendedSchool = findElementByName(surveyJson, "member_ever_attended_school");
const memberHighestGrade = findElementByName(surveyJson, "member_highest_grade_completed");
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

assert.equal(singleMobile, null);
assert.equal(mobilePanel.type, "paneldynamic");
assert.equal(mobilePanel.panelCount, 1);
assert.equal(mobilePanel.minPanelCount, 1);
assert.equal(
  mobilePanel.visibleIf,
  "{hhq_consent_study_provide_pis_explain_study_adult_member} = 1"
);
assert.equal(mobilePanel.isRequired, undefined);
assert.equal(mobilePanel.templateElements.length, 1);
assert.equal(mobilePanel.templateElements[0].name, "mobile_number");
assert.equal(mobilePanel.templateElements[0].inputType, "tel");
assert.equal(mobilePanel.templateElements[0].isRequired, true);
assert.deepEqual(mobilePanel.templateElements[0].validators, [
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
assert.equal(memberHighestGrade.visibleIf, "{panel.member_ever_attended_school} = 1");
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

console.log("Validated questionnaire SurveyJS JSON transforms.");
