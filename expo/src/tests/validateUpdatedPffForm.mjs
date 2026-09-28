/** Validates the 25 August 2026 PFF workbook mapping, routing, and native controls. */
import assert from "node:assert/strict";
import { Model } from "survey-core";
import form from "../data/forms/pregnancy_followup_form_v2026.08.25.json" with { type: "json" };
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import {
  assertNativeSurveySupport,
  getNativeRendererKind,
} from "../components/forms/nativeSurveyModel.js";

const elements = form.pages.flatMap((page) => page.elements || []);
const byName = new Map(elements.map((element) => [element.name, element]));

assert.equal(form.form_code, "PFF");
assert.equal(form.version, "25 AUGUST 2026");
assert.equal(form.source_excel, "07 - pregnancy follow-up form.xlsx");
for (const sourceCode of [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15",
  "16", "17", "18", "19", "20", "23", "24", "25", "28", "29", "30", "32", "33", "34",
  "35", "36", "37", "38", "39",
]) {
  assert.ok(elements.some((element) => element.sourceCode === sourceCode), `Missing workbook question ${sourceCode}`);
}

assert.deepEqual(byName.get("pff_visit_type").choices.map((choice) => choice.value), [1, 2]);
assert.deepEqual(byName.get("pff_pregnancy_status").choices.map((choice) => choice.value), [1, 2, 3]);
assert.equal(byName.get("pff_care_locations").type, "checkbox");
assert.equal(byName.get("pff_additional_symptom_types").type, "checkbox");
assert.equal(
  byName.get("pff_additional_symptom_types").choices.find((choice) => choice.value === "N").isExclusive,
  true,
);
assert.equal(byName.get("pff_first_ultrasound_report_image").renderAs, "form_single_image");
assert.equal(byName.get("pff_additional_ultrasound_reports").renderAs, "form_ultrasound_reports");
assert.equal(byName.get("pff_anc_card_image").renderAs, "form_single_image");
assert.equal(byName.get("pff_weight_kg_measured_site").validators[1].regex, "^\\d{2,3}\\.\\d$");
assert.equal(
  byName.get("pff_height_cm_automatically_filled_woman_s_questionnaire").validators[1].regex,
  "^\\d{3}(?:\\.\\d)?$",
);

const model = new Model(prepareQuestionnaireSurveyJson(form));
assert.deepEqual(assertNativeSurveySupport(model), []);
assert.equal(getNativeRendererKind(model.getQuestionByName("pff_first_ultrasound_report_image")), "pef-anc-card-image");
assert.equal(getNativeRendererKind(model.getQuestionByName("pff_additional_ultrasound_reports")), "pef-ultrasound-reports");

model.setValue("pff_visit_type", 1);
model.setValue("pff_vital_migration_status_woman", 1);
model.setValue("pff_pregnancy_status", 1);
assert.equal(model.getQuestionByName("pff_difficult_rapid_breathing").isVisible, false);
assert.equal(model.getQuestionByName("pff_weight_kg_measured_site").isVisible, true);

model.setValue("pff_visit_type", 2);
model.setValue("pff_temporarily_away_status", 1);
assert.equal(model.getQuestionByName("pff_difficult_rapid_breathing").isVisible, true);
assert.equal(model.getPageByName("page_03_measurements_and_anc").isVisible, false);

model.setValue("pff_ultrasound_form_already_been_filled", 2);
assert.equal(model.getQuestionByName("pff_any_time_during_pregnancy_ultrasound_test").isVisible, false);
assert.equal(model.getQuestionByName("pff_other_ultrasound_tests_since_first").isVisible, true);

model.setValue("pff_pregnancy_status", 3);
assert.equal(model.getPageByName("page_02_care_and_symptoms").isVisible, false);

console.log("Validated updated PFF workbook mapping and routing.");
