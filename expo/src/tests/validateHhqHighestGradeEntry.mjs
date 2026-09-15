import assert from "node:assert/strict";
import fs from "node:fs";
import { Model } from "survey-core";

import { setNativeQuestionValue } from "../components/forms/nativeSurveyModel.js";
import {
  acceptHhqHighestGradeYearEntry,
  isHhqHighestGradeYearEntry,
} from "../components/forms/renderers/hhqHighestGrade.js";
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";

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
assert.equal(setNativeQuestionValue(highestGrade, "12"), true);
assert.equal(isHhqHighestGradeYearEntry(highestGrade), true);
assert.equal(acceptHhqHighestGradeYearEntry(highestGrade), true);
assert.equal(highestGrade.value, "12");
assert.equal(roster.value[0].member_highest_grade_completed, "12");
assert.equal(highestGrade.errors.length, 0);

highestGrade.value = 0;
assert.equal(isHhqHighestGradeYearEntry(highestGrade), false);
highestGrade.value = 98;
assert.equal(isHhqHighestGradeYearEntry(highestGrade), false);
highestGrade.value = "123";
assert.equal(isHhqHighestGradeYearEntry(highestGrade), false);

assert.equal(
  acceptHhqHighestGradeYearEntry({ name: "some_other_question", value: "12", errors: [] }),
  false
);

console.log("Validated BHQ Q12_i numeric-year entry persistence.");
