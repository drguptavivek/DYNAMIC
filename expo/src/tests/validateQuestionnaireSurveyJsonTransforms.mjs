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
const householdTotal = findElementByName(surveyJson, "hhq_total_household_members");
const householdNumber = findElementByName(surveyJson, "hhq_household_number");
const interviewDate = findElementByName(surveyJson, "hhq_interview_date");
const visitNo = findElementByName(surveyJson, "hhq_visit_no");

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
assert.equal(surveyJson.clearInvisibleValues, "onHiddenContainer");
assert.equal(
  surveyJson.pages[1].visibleIf,
  "{hhq_consent_study_provide_pis_explain_study_adult_member} = 1"
);

const consentModel = new Model(surveyJson);
assert.equal(consentModel.getQuestionByName("hhq_visit_no").isVisible, false);
consentModel.setValue("hhq_interview_date", "2026-09-01");
assert.equal(consentModel.getQuestionByName("hhq_visit_no").isVisible, true);
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
