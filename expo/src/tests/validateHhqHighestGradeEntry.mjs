import assert from "node:assert/strict";
import fs from "node:fs";
import { Model } from "survey-core";

import {
  hasNativeValidationProblem,
  setNativeQuestionValue,
} from "../components/forms/nativeSurveyModel.js";
import {
  acceptHhqHighestGradeYearEntry,
  isHhqHighestGradeYearEntry,
} from "../components/forms/renderers/hhqHighestGrade.js";
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { buildSurveySections } from "../modules/questionnaires/surveyNavigation.js";

const form = JSON.parse(
  fs.readFileSync("src/data/forms/baseline_household_questionnaire_v2026.05.09.json", "utf8")
);
const model = new Model(prepareQuestionnaireSurveyJson(form));
const roster = model.getQuestionByName("hhq_household_members");
roster.value = [{
  member_name: "Ajay",
  member_age_years: 20,
  member_sex: 1,
  member_marital_status: 7,
  member_ever_attended_school: 1,
}];

const highestGrade = roster.panels[0].getQuestionByName("member_highest_grade_completed");
assert.equal(highestGrade.getType(), "text");
assert.equal(setNativeQuestionValue(highestGrade, "12"), true);
assert.equal(isHhqHighestGradeYearEntry(highestGrade), true);
assert.equal(acceptHhqHighestGradeYearEntry(highestGrade), true);
assert.equal(highestGrade.validate(), true);
assert.equal(highestGrade.value, "12");
assert.equal(roster.value[0].member_highest_grade_completed, "12");
assert.equal(highestGrade.errors.length, 0);

highestGrade.value = 0;
assert.equal(isHhqHighestGradeYearEntry(highestGrade), false);
highestGrade.value = 98;
assert.equal(isHhqHighestGradeYearEntry(highestGrade), false);
highestGrade.value = "123";
assert.equal(isHhqHighestGradeYearEntry(highestGrade), false);

const navigationModel = new Model({
  pages: [
    {
      name: "schedule",
      elements: [{
        type: "paneldynamic",
        name: "members",
        panelCount: 1,
        templateElements: [{
          ...memberHighestGradeDefinition(),
          name: "member_highest_grade_completed",
        }],
      }],
    },
    { name: "next_section", elements: [{ type: "text", name: "next_answer" }] },
  ],
});
const navigationGrade = navigationModel
  .getQuestionByName("members")
  .panels[0]
  .getQuestionByName("member_highest_grade_completed");
navigationGrade.value = "12";
assert.equal(navigationModel.nextPage(), true);
assert.equal(navigationModel.currentPage.name, "next_section");
assert.equal(navigationGrade.value, "12");

// A committed BHQ roster row using years/months must be able to leave Section 2.
// member_living_since_birth is a mutually exclusive backend alternative inside
// Q6_i, not an additional required question.
[
  {
    label: "Q6_i years/months and Q12_i numeric years",
    expectedTotal: 9,
    answers: {
      member_residence_duration: { years: 10, months: 0 },
      member_ever_attended_school: 1,
      member_highest_grade_completed: "12",
    },
  },
  {
    label: "Q6_i living since birth and Q12_i numeric years",
    expectedTotal: 9,
    answers: {
      member_residence_duration: { living_since_birth: 95 },
      member_living_since_birth: 95,
      member_ever_attended_school: 1,
      member_highest_grade_completed: "12",
    },
  },
  {
    label: "Q12_i less than one year",
    expectedTotal: 9,
    answers: {
      member_residence_duration: { years: 10, months: 0 },
      member_ever_attended_school: 1,
      member_highest_grade_completed: 0,
    },
  },
  {
    label: "Q12_i don't know",
    expectedTotal: 9,
    answers: {
      member_residence_duration: { years: 10, months: 0 },
      member_ever_attended_school: 1,
      member_highest_grade_completed: 98,
    },
  },
  {
    label: "Q11_i no skips Q12_i",
    expectedTotal: 8,
    answers: {
      member_residence_duration: { years: 10, months: 0 },
      member_ever_attended_school: 2,
    },
  },
  {
    label: "Q11_i don't know skips Q12_i",
    expectedTotal: 8,
    answers: {
      member_residence_duration: { years: 10, months: 0 },
      member_ever_attended_school: 8,
    },
  },
  {
    label: "child under 5 uses birth-registration question and skips school",
    expectedTotal: 7,
    answers: {
      member_age_years: 2,
      member_residence_duration: { years: 2, months: 0 },
      member_birth_registration_status: 1,
    },
  },
  {
    label: "child age 5-12 uses school question and skips marital status",
    expectedTotal: 7,
    answers: {
      member_age_years: 10,
      member_residence_duration: { years: 10, months: 0 },
      member_ever_attended_school: 2,
    },
  },
].forEach(({ label, answers, expectedTotal }) =>
  assertBhqSectionTwoAdvances(label, answers, expectedTotal)
);

const incompleteSectionModel = new Model(prepareQuestionnaireSurveyJson(form));
incompleteSectionModel.setValue("hhq_interview_date", "2026-09-15");
incompleteSectionModel.setValue("hhq_visit_no", 1);
incompleteSectionModel.setValue("hhq_competent_respondent_available", 1);
incompleteSectionModel.setValue("hhq_consent_study_provide_pis_explain_study_adult_member", 1);
incompleteSectionModel.getQuestionByName("hhq_household_members").value = [{
  member_name: "Missing sex",
  member_relationship_to_head: 1,
  member_last_residence_place: 1,
  member_residence_duration: { years: 20, months: 0 },
  member_age_years: 20,
  member_marital_status: 7,
  member_ever_attended_school: 1,
  member_highest_grade_completed: "12",
}];
incompleteSectionModel.currentPage = incompleteSectionModel.getPageByName(
  "page_02_household_schedule",
);
const incompleteProgress = buildSurveySections(incompleteSectionModel)[1];
assert.equal(incompleteProgress.answered, 8);
assert.equal(incompleteProgress.total, 9);
assert.equal(incompleteProgress.status, "in_progress");
const missingSexQuestion = incompleteSectionModel
  .getQuestionByName("hhq_household_members")
  .panels[0]
  .getQuestionByName("member_sex");
assert.equal(missingSexQuestion.isRequired, true);
assert.equal(
  hasNativeValidationProblem(missingSexQuestion),
  true,
  "a genuinely missing member answer must block native Next",
);

assert.equal(
  acceptHhqHighestGradeYearEntry({ name: "some_other_question", value: "12", errors: [] }),
  false
);

console.log("Validated BHQ Q12_i numeric-year entry persistence.");

function memberHighestGradeDefinition() {
  return {
    type: "text",
    isRequired: true,
    renderAs: "years_with_special_codes",
    choices: [
      { value: 0, text: "Less than one year completed" },
      { value: 98, text: "Don't know" },
    ],
  };
}

function assertBhqSectionTwoAdvances(label, answers, expectedTotal) {
  const sectionModel = new Model(prepareQuestionnaireSurveyJson(form));
  sectionModel.setValue("hhq_interview_date", "2026-09-15");
  sectionModel.setValue("hhq_visit_no", 1);
  sectionModel.setValue("hhq_competent_respondent_available", 1);
  sectionModel.setValue("hhq_consent_study_provide_pis_explain_study_adult_member", 1);
  const sectionRoster = sectionModel.getQuestionByName("hhq_household_members");
  sectionRoster.value = [{
    member_name: "Valid member",
    member_relationship_to_head: 1,
    member_sex: 1,
    member_last_residence_place: 1,
    member_age_years: 20,
    member_marital_status: 7,
    ...answers,
  }];
  const sectionPanel = sectionRoster.panels[0];
  assert.equal(
    sectionPanel.getQuestionByName("member_living_since_birth").isRequired,
    false,
    label,
  );
  sectionModel.currentPage = sectionModel.getPageByName("page_02_household_schedule");
  const scheduleProgress = buildSurveySections(sectionModel).find(
    (section) => section.name === "page_02_household_schedule",
  );
  assert.equal(scheduleProgress.total, expectedTotal, `${label}: answerable question count`);
  assert.equal(scheduleProgress.answered, scheduleProgress.total, `${label}: progress`);
  assert.equal(scheduleProgress.status, "complete", `${label}: status`);
  assert.equal(sectionModel.nextPage(), true, label);
  assert.equal(sectionModel.currentPage.name, "page_03_household_characteristics", label);
}
