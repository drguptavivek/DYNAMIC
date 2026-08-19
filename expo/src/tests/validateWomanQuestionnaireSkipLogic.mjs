/** Verifies Excel-derived WQ skip logic in the Survey Core runtime. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);
const {
  WQ_AGE_FIELD,
  WQ_CURRENT_MARITAL_STATUS_FIELD,
  WQ_HYSTERECTOMY_FIELD,
  WQ_LMP_FIELD,
  WQ_STERILIZATION_FIELD,
  buildWqHusbandPartnerChoices,
  calculateWqPregnancyTrackingEligibilityValue,
  getWqOutsideHouseholdHusbandLineNumber,
} = await import("../lib/womanSurveyBehaviors.js");

const root = path.dirname(fileURLToPath(import.meta.url));
const wqPath = path.resolve(
  root,
  "../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json"
);
const wq = JSON.parse(fs.readFileSync(wqPath, "utf8"));

function createWqModel() {
  return new Model(prepareQuestionnaireSurveyJson(wq));
}

function question(model, name) {
  const item = model.getQuestionByName(name);
  assert.ok(item, `Expected WQ question ${name} to exist`);
  return item;
}

function isVisible(model, name) {
  return question(model, name).isVisible;
}

const model = createWqModel();

assert.equal(isVisible(model, "wq_consent_study"), false);
assert.equal(isVisible(model, "wq_visit_no"), false);
const interviewDateQuestion = question(model, "wq_interview_date");
assert.equal(interviewDateQuestion.inputType, "date");
assert.equal(interviewDateQuestion.renderAs, "date_picker");
assert.ok(
  !interviewDateQuestion.validators.some((validator) => validator.getType?.() === "numeric"),
  "WQ interview date must not use numeric validation"
);
model.setValue("wq_interview_date", "2026-08-14");
model.setValue("wq_visit_no", 1);
assert.equal(isVisible(model, "wq_visit_no"), true);
model.setValue("wq_woman_available", 1);
assert.equal(isVisible(model, "wq_consent_study"), true);
model.setValue("wq_consent_study", 1);
assert.equal(model.getPageByName("page_outcome").isVisible, true);

const residenceDurationQuestion = question(
  model,
  "wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously"
);
assert.equal(residenceDurationQuestion.getType(), "radiogroup");
assert.equal(residenceDurationQuestion.renderAs, "years_with_special_codes");
assert.equal(residenceDurationQuestion.jsonObj?.inputType, "number");
assert.equal(residenceDurationQuestion.jsonObj?.maxLength, 2);
assert.equal(residenceDurationQuestion.jsonObj?.preserveString, true);
assert.deepEqual(
  residenceDurationQuestion.choices.map((choice) => choice.value),
  [95, 96]
);

const birthMonthYearQuestion = question(
  model,
  "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born"
);
assert.equal(birthMonthYearQuestion.getType(), "multipletext");
assert.deepEqual(
  birthMonthYearQuestion.items.map((item) => ({
    name: item.name,
    inputType: item.inputType,
    maxLength: item.maxLength,
    preserveString: item.jsonObj?.preserveString,
    unknownValue: item.jsonObj?.unknownChoice?.value,
  })),
  [
    { name: "month", inputType: "number", maxLength: 2, preserveString: true, unknownValue: 98 },
    { name: "year", inputType: "number", maxLength: 4, preserveString: true, unknownValue: 9998 },
  ]
);
assert.equal(
  model.getQuestionByName("wq_01_respondent_s_backgr_birth_month_year_unknown"),
  null
);
const ageLastBirthdayQuestion = question(model, "wq_age_last_birthday");
assert.equal(ageLastBirthdayQuestion.inputType, "text");
assert.equal(ageLastBirthdayQuestion.jsonObj?.maxLength, 2);
assert.equal(ageLastBirthdayQuestion.renderAs, "numeric_textbox");

const q4VisitModel = createWqModel();
q4VisitModel.setValue("wq_interview_date", "2026-08-14");
q4VisitModel.setValue("wq_visit_no", 3);
const q4Choices = question(q4VisitModel, "wq_woman_available").visibleChoices.map((choice) => choice.value);
assert.deepEqual(q4Choices, [1, 2, 4]);

const q4IncapacitatedModel = createWqModel();
q4IncapacitatedModel.setValue("wq_interview_date", "2026-08-14");
q4IncapacitatedModel.setValue("wq_visit_no", 1);
q4IncapacitatedModel.setValue("wq_woman_available", 2);
assert.equal(q4IncapacitatedModel.getPageByName("page_02_reproduction").isVisible, false);
assert.equal(q4IncapacitatedModel.getPageByName("page_outcome").isVisible, true);

const hhqPath = path.resolve(
  root,
  "../data/forms/baseline_household_questionnaire_v2026.05.09.json"
);
const hhq = JSON.parse(fs.readFileSync(hhqPath, "utf8"));
const findElement = (form, name) => {
  for (const page of form.pages) {
    for (const element of page.elements) {
      if (element.name === name) return element;
    }
  }
  return null;
};
const wqOutcomeElement = findElement(wq, "wq_result_interview");
const hhqOutcomeElement = findElement(hhq, "hhq_result_interview");
assert.deepEqual(
  wqOutcomeElement.choices,
  hhqOutcomeElement.choices,
  "WQ outcome options must match the HHQ outcome list"
);
assert.equal(wqOutcomeElement.choices.length, 10);

const outcomeParityModel = createWqModel();
outcomeParityModel.setValue("wq_interview_date", "2026-08-14");
outcomeParityModel.setValue("wq_visit_no", 1);
outcomeParityModel.setValue("wq_woman_available", 1);
outcomeParityModel.setValue("wq_consent_study", 1);
const specifyQuestion = question(outcomeParityModel, "wq_result_interview_other_specify");
assert.equal(specifyQuestion.isRequired, true);
assert.equal(isVisible(outcomeParityModel, "wq_result_interview_other_specify"), false);
outcomeParityModel.setValue("wq_result_interview", 10);
assert.equal(isVisible(outcomeParityModel, "wq_result_interview_other_specify"), true);
assert.deepEqual(
  question(outcomeParityModel, "wq_result_interview").visibleChoices.map((choice) => choice.value),
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
);

const q4RevisitModel = createWqModel();
q4RevisitModel.setValue("wq_interview_date", "2026-08-14");
q4RevisitModel.setValue("wq_visit_no", 1);
q4RevisitModel.setValue("wq_woman_available", 4);
assert.equal(q4RevisitModel.getPageByName("page_02_reproduction").isVisible, false);
assert.equal(q4RevisitModel.getPageByName("page_outcome").isVisible, false);

assert.equal(
  isVisible(model, "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed"),
  false
);
model.setValue("wq_01_respondent_s_backgr_have_you_ever_attended_school", 1);
assert.equal(
  isVisible(model, "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed"),
  true
);
model.setValue("wq_01_respondent_s_backgr_have_you_ever_attended_school", 2);
assert.equal(
  isVisible(model, "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed"),
  false
);

model.setValue("wq_current_marital_status", 7);
assert.equal(isVisible(model, "wq_husband_partner_name"), false);
assert.equal(model.getPageByName("page_02_reproduction").isVisible, false);
assert.equal(model.getPageByName("page_outcome").isVisible, true);
assert.equal(isVisible(model, "wq_pregnancy_tracking_eligible"), false);
model.setValue("wq_current_marital_status", 1);
assert.equal(isVisible(model, "wq_husband_partner_name"), true);
assert.equal(model.getPageByName("page_02_reproduction").isVisible, true);
assert.equal(question(model, "wq_husband_partner_name").renderAs, "household_member_dropdown");
assert.deepEqual(
  buildWqHusbandPartnerChoices([
    { member_name: "Male Fifteen", sex: 1, age_years: 15, line_number: 1, individual_id: "hh-01" },
    { member_name: "Male Sixteen", sex: 1, age_years: 16, line_number: 2, individual_id: "hh-02" },
    { member_name: "Female Adult", sex: 2, age_years: 30, line_number: 3, individual_id: "hh-03" },
    { member_name: "Male Unknown Age", sex: 1, age_years: null, line_number: 4, individual_id: "hh-04" },
  ]).map((choice) => choice.value),
  ["Male Sixteen", "Husband not in household"]
);
const outsideHusbandMembers = [
  { member_name: "Woman One", sex: 2, age_years: 24, line_number: 1, individual_id: "2-02-0003-01-01" },
  { member_name: "Woman Two", sex: 2, age_years: 30, line_number: 2, individual_id: "2-02-0003-01-02" },
  { member_name: "Woman Three", sex: 2, age_years: 38, line_number: 3, individual_id: "2-02-0003-01-03" },
];
assert.equal(
  getWqOutsideHouseholdHusbandLineNumber({
    members: outsideHusbandMembers,
    currentWomanId: "2-02-0003-01-01",
  }),
  "00"
);
assert.equal(
  getWqOutsideHouseholdHusbandLineNumber({
    members: outsideHusbandMembers,
    currentWomanId: "2-02-0003-01-02",
  }),
  "99"
);
assert.equal(
  getWqOutsideHouseholdHusbandLineNumber({
    members: outsideHusbandMembers,
    currentWomanId: "2-02-0003-01-03",
  }),
  "98"
);
assert.equal(
  buildWqHusbandPartnerChoices(outsideHusbandMembers, {
    currentWomanId: "2-02-0003-01-02",
  }).at(-1).lineNumber,
  "99"
);

model.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 2);
assert.equal(
  isVisible(model, "wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom"),
  false
);
model.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 1);
assert.equal(
  isVisible(model, "wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom"),
  true
);
model.setValue("wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom", 2);
assert.equal(isVisible(model, "wq_02_reproduction_how_many_sons_live_with_you"), false);
model.setValue("wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom", 1);
assert.equal(isVisible(model, "wq_02_reproduction_how_many_sons_live_with_you"), true);

model.setValue("wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does", 2);
assert.equal(
  isVisible(model, "wq_02_reproduction_how_many_miscarriages_abortions_and_stillb"),
  false
);
model.setValue("wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does", 1);
assert.equal(
  isVisible(model, "wq_02_reproduction_how_many_miscarriages_abortions_and_stillb"),
  true
);

model.setValue("wq_pregnancy_tracking_eligible", 2);
assert.equal(model.getPageByName("page_03_other_health_issues").isVisible, false);
assert.equal(model.getPageByName("page_04_husband_background_woman_work").isVisible, false);
model.setValue("wq_pregnancy_tracking_eligible", 1);
assert.equal(model.getPageByName("page_03_other_health_issues").isVisible, true);
assert.equal(model.getPageByName("page_04_husband_background_woman_work").isVisible, true);

const q38Question = question(model, "wq_pregnancy_tracking_eligible");
assert.equal(q38Question.readOnly, true);
model.setValue("wq_current_marital_status", 2);
assert.equal(isVisible(model, "wq_02_reproduction_are_you_or_your_partner_currently_doing_so"), true);
assert.equal(isVisible(model, "wq_02_reproduction_are_you_or_your_partner_sterilized_probe_w"), true);
assert.equal(isVisible(model, "wq_pregnancy_tracking_eligible"), true);
model.setValue("wq_current_marital_status", 3);
assert.equal(isVisible(model, "wq_pregnancy_tracking_eligible"), false);

assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 30,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 1,
    [WQ_LMP_FIELD]: 995,
    [WQ_HYSTERECTOMY_FIELD]: 2,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  1,
);
assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 45,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 1,
    [WQ_LMP_FIELD]: 995,
    [WQ_HYSTERECTOMY_FIELD]: 2,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  2,
);
assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 30,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 3,
    [WQ_LMP_FIELD]: 995,
    [WQ_HYSTERECTOMY_FIELD]: 2,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  2,
);
assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 30,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 2,
    [WQ_LMP_FIELD]: 994,
    [WQ_HYSTERECTOMY_FIELD]: 2,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  2,
);

model.setValue("wq_03_other_health_issues_do_you_currently_have_diabetes", 2);
assert.equal(
  isVisible(model, "wq_03_other_health_issues_have_you_sought_treatment_for_this_problem"),
  false
);
model.setValue("wq_03_other_health_issues_do_you_currently_have_diabetes", 1);
assert.equal(
  isVisible(model, "wq_03_other_health_issues_have_you_sought_treatment_for_this_problem"),
  true
);

model.setValue(
  "wq_04_husband_s_backgroun_check_answer_to_marital_status_on_01_respo",
  2
);
assert.equal(
  isVisible(model, "wq_04_husband_s_backgroun_how_old_was_your_husband_on_his_last_birth"),
  false
);
model.setValue(
  "wq_04_husband_s_backgroun_check_answer_to_marital_status_on_01_respo",
  1
);
assert.equal(
  isVisible(model, "wq_04_husband_s_backgroun_how_old_was_your_husband_on_his_last_birth"),
  true
);

model.setValue("wq_05_domestic_violence_check_for_presence_of_others_do_not_contin", 1);
model.setValue("wq_05_domestic_violence_check_answer_to_marital_status_on_01_respo", 1);
model.setValue("wq_05_domestic_violence_say_or_do_something_to_humiliate_you_in_fr", 2);
assert.equal(
  isVisible(model, "wq_05_domestic_violence_how_often_did_this_happen_in_the_last_12_m"),
  false
);
model.setValue("wq_05_domestic_violence_say_or_do_something_to_humiliate_you_in_fr", 1);
assert.equal(
  isVisible(model, "wq_05_domestic_violence_how_often_did_this_happen_in_the_last_12_m"),
  true
);

const panelModel = createWqModel();
panelModel.setValue("wq_woman_available", 1);
panelModel.setValue("wq_consent_study", 1);
panelModel.setValue("wq_current_marital_status", 1);
const history = question(panelModel, "wq_pregnancy_history");
history.addPanel();
const panel = history.panels[0];
const bornAlive = panel.getQuestionByName(
  "pregnancy_02_reproduction_what_name_was_given_to_the_baby"
);
const diedAge = panel.getQuestionByName(
  "pregnancy_02_reproduction_if_born_alive_and_now_dead_if_19_i_1_boy_h"
);
assert.ok(bornAlive, "Expected pregnancy-history born-alive follow-up question");
assert.ok(diedAge, "Expected pregnancy-history death-age follow-up question");
panel
  .getQuestionByName("pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor")
  .value = [1];
assert.equal(bornAlive.isVisible, true);
panel
  .getQuestionByName("pregnancy_02_reproduction_check_16_17_and_21_if_16_i_1_or_17_i_1_the")
  .value = 1;
panel.getQuestionByName("pregnancy_02_reproduction_is_name_still_alive").value = 2;
assert.equal(diedAge.isVisible, true);

await import("../polyfills/surveyCoreNative.js");

const blockedNextModel = createWqModel();
blockedNextModel.setValue("wq_interview_date", "2026-08-14");
blockedNextModel.setValue("wq_visit_no", 1);
blockedNextModel.setValue("wq_woman_available", 1);
blockedNextModel.setValue("wq_consent_study", 1);
blockedNextModel.setValue("wq_current_marital_status", 1);
blockedNextModel.setValue("wq_age_last_birthday", "3");
assert.equal(
  blockedNextModel.nextPage(),
  false,
  "Invalid section answers must block Next without throwing on DOM-less runtimes"
);
assert.equal(blockedNextModel.currentPage.name, "page_01_respondent_background");
assert.ok(
  question(blockedNextModel, "wq_age_last_birthday").errors.some((error) =>
    /2 digits/.test(error.text || "")
  ),
  "Blocked Next must leave the failing validator error on the question"
);
blockedNextModel.setValue("wq_age_last_birthday", "30");
assert.equal(blockedNextModel.nextPage(), true);
assert.equal(blockedNextModel.currentPage.name, "page_02_reproduction");

const {
  getNativeQuestionErrors,
  hasNativeValidationProblem,
} = await import("../components/forms/nativeSurveyModel.js");

const itemErrorModel = createWqModel();
itemErrorModel.setValue("wq_interview_date", "2026-08-14");
itemErrorModel.setValue("wq_visit_no", 1);
itemErrorModel.setValue("wq_woman_available", 1);
itemErrorModel.setValue("wq_consent_study", 1);
itemErrorModel.setValue("wq_current_marital_status", 1);
itemErrorModel.setValue("wq_age_last_birthday", "28");
itemErrorModel.setValue("wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born", {
  month: "2",
  year: "1996",
});
assert.equal(itemErrorModel.nextPage(), false);
assert.equal(itemErrorModel.currentPage.name, "page_01_respondent_background");
const dobQuestion = question(itemErrorModel, "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born");
const monthItem = dobQuestion.items.find((item) => item.name === "month");
assert.equal(
  dobQuestion.errors.length,
  0,
  "multipletext validators report on the item editor, not the parent question"
);
assert.equal(hasNativeValidationProblem(dobQuestion), true);
assert.ok(
  getNativeQuestionErrors(monthItem.editor ?? monthItem).some((text) => /2 digits/.test(text)),
  "Blocked Next must surface the month 2-digit validator error on the item"
);
itemErrorModel.setValue("wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born", {
  month: "02",
  year: "1996",
});
assert.equal(itemErrorModel.nextPage(), true);
assert.equal(itemErrorModel.currentPage.name, "page_02_reproduction");

console.log("Validated WQ Excel-derived skip logic.");
