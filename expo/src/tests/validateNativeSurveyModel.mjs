/** Verifies native renderer coverage, validation, localization, repeats, and preview modeling. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

const {
  assertNativeSurveySupport,
  buildNativeSurveyPreview,
  getNativeQuestionErrors,
  getNativeQuestionTitle,
  getNativeRendererKind,
  getVisiblePageQuestions,
  setNativeQuestionValue,
} = await import("../components/forms/nativeSurveyModel.js");
const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);
const { getRegexValidationErrors } = await import(
  "../components/forms/validators/RegexValidator.js"
);
const {
  formatSurveyDate,
  formatSurveyDateDisplay,
  parseSurveyDate,
} = await import("../components/forms/dateValue.js");
const { attachHouseholdSurveyBehaviors, refreshHouseholdSurveyBehaviors } = await import(
  "../lib/householdSurveyBehaviors.js"
);

const root = path.dirname(fileURLToPath(import.meta.url));
const hhqPath = path.resolve(
  root,
  "../data/forms/baseline_household_questionnaire_v2026.05.09.json"
);
const hhq = JSON.parse(fs.readFileSync(hhqPath, "utf8"));
const model = new Model(prepareQuestionnaireSurveyJson(hhq));
attachHouseholdSurveyBehaviors(model, hhq);

assert.deepEqual(assertNativeSurveySupport(model), []);
assert.doesNotThrow(() => model.getAllQuestions().map(getNativeRendererKind));
assert.equal(model.pages.length, 3);
assert.ok(getVisiblePageQuestions(model.pages[0]).length > 0);

const structure = model.getQuestionByName("hhq_structure_map_id");
setNativeQuestionValue(structure, "42");
assert.deepEqual(getRegexValidationErrors(structure), ["Enter exactly 4 digits."]);
setNativeQuestionValue(structure, "0042");
assert.deepEqual(getRegexValidationErrors(structure), []);
assert.equal(structure.value, "0042");

assert.equal(formatSurveyDateDisplay("2026-07-28"), "28-Jul-2026");
assert.equal(formatSurveyDate(parseSurveyDate("2026-07-28")), "2026-07-28");
assert.equal(parseSurveyDate("2026-02-30"), null);

const site = model.getQuestionByName("hhq_site_id");
const consent = model.getQuestionByName(
  "hhq_consent_study_provide_pis_explain_study_adult_member"
);
const localizedQuestion = model.getQuestionByName("hhq_residence_area_type");
const defaultLocalizedTitle = getNativeQuestionTitle(localizedQuestion);
model.locale = "hi";
assert.notEqual(getNativeQuestionTitle(localizedQuestion), defaultLocalizedTitle);
model.locale = "default";
setNativeQuestionValue(site, 1);
assert.equal(site.value, 1);
setNativeQuestionValue(consent, 1);
assert.equal(model.visiblePages.length, 3);

const roster = model.getQuestionByName("hhq_household_members");
roster.value = [
  {
    member_name: "Asha",
    member_relationship_to_head: 1,
    member_sex: 2,
    member_residence_duration: { months: 0, years: 20 },
    member_age_years: 25,
    member_marital_status: 1,
  },
];
refreshHouseholdSurveyBehaviors(model, hhq);

const memberPanel = roster.panels[0];
const maritalStatus = memberPanel.getQuestionByName("member_marital_status");
assert.equal(maritalStatus.isVisible, true);
assert.match(getNativeQuestionTitle(maritalStatus), /Asha/);
assert.equal(model.data.hhq_total_household_members, 1);
assert.equal(model.data.hhq_total_eligible_women, 1);

const invalidAge = memberPanel.getQuestionByName("member_age_years");
setNativeQuestionValue(invalidAge, "19");
const refreshedInvalidAge = roster.panels[0].getQuestionByName("member_age_years");
assert.ok(getNativeQuestionErrors(refreshedInvalidAge).length > 0);
setNativeQuestionValue(refreshedInvalidAge, "25");

const preview = buildNativeSurveyPreview(model);
assert.equal(preview[0].name, "page_01_identification");
assert.ok(
  preview.some((page) =>
    page.questions.some(
      (question) =>
        question.name === "hhq_household_members" && question.panelRows.length === 1
    )
  )
);

roster.addPanel();
assert.equal(roster.panelCount, 2);
roster.removePanel(1);
assert.equal(roster.panelCount, 1);

console.log("Validated native Survey Core model adapter for HHQ.");
