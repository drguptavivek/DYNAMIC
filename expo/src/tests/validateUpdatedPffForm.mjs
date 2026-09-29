/** Validates the 25 August 2026 PFF workbook mapping, routing, and native controls. */
import assert from "node:assert/strict";
import { Model } from "survey-core";
import form from "../data/forms/pregnancy_followup_form_v2026.08.25.json" with { type: "json" };
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { shouldShowPffOutcomeReminder } from "../lib/pffOutcomeReminder.js";
import {
  assertNativeSurveySupport,
  getNativeRendererKind,
} from "../components/forms/nativeSurveyModel.js";
import {
  buildPffLinkedSourcePrefill,
  buildPffPefSnapshot,
  findPffSourcePefResponse,
  findPreviousPffResponse,
  parsePffSourceAnswers,
} from "../lib/pffPrefillHelpers.js";

const elements = form.pages.flatMap((page) => page.elements || []);
const byName = new Map(elements.map((element) => [element.name, element]));

assert.equal(form.form_code, "PFF");
assert.equal(shouldShowPffOutcomeReminder("PFF", { pff_pregnancy_status: 2, pff_vital_migration_status_woman: 1 }), true);
assert.equal(shouldShowPffOutcomeReminder("PFF", { pff_pregnancy_status: 1, pff_vital_migration_status_woman: 1 }), false);
assert.equal(shouldShowPffOutcomeReminder("PFF", { pff_pregnancy_status: 3, pff_vital_migration_status_woman: 1 }), false);
assert.equal(shouldShowPffOutcomeReminder("PFF", { pff_pregnancy_status: 2, pff_vital_migration_status_woman: 2 }), false);
assert.equal(shouldShowPffOutcomeReminder("PEF", { pff_pregnancy_status: 2, pff_vital_migration_status_woman: 1 }), false);
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
assert.deepEqual(
  byName.get("pff_vital_migration_status_woman").choices.map((choice) => [choice.value, choice.text.default]),
  [
    [1, "Alive"],
    [2, "Dead"],
    [3, "Shifted within the area / temporarily away"],
    [4, "Permanently moved outside the catchment area"],
  ],
);
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
for (const element of elements.filter((item) => /^\d+$/.test(item.sourceCode || ""))) {
  const title = model.getQuestionByName(element.name).title;
  assert.ok(title.startsWith(`${element.sourceCode}. `), `Question ${element.sourceCode} lost its number`);
  assert.ok(!title.startsWith(`${element.sourceCode}. ${element.sourceCode}. `), `Question ${element.sourceCode} has duplicate numbering`);
}
assert.equal(model.getQuestionByName("pff_first_ultrasound_report_image").title, "Upload first ultrasound report");
assert.equal(getNativeRendererKind(model.getQuestionByName("pff_first_ultrasound_report_image")), "pef-anc-card-image");
assert.equal(getNativeRendererKind(model.getQuestionByName("pff_additional_ultrasound_reports")), "pef-ultrasound-reports");

model.setValue("pff_visit_type", 1);
model.setValue("pff_vital_migration_status_woman", 1);
model.setValue("pff_pregnancy_status", 1);
assert.equal(model.getQuestionByName("pff_difficult_rapid_breathing").isVisible, false);
assert.equal(model.getPageByName("page_03_telephonic_symptoms").isVisible, false);
assert.equal(model.getPageByName("page_04_measurements_and_anc").isVisible, false);

model.setValue("pff_visit_type", 2);
model.setValue("pff_temporarily_away_status", 1);
assert.equal(model.getQuestionByName("pff_difficult_rapid_breathing").isVisible, true);
assert.equal(model.getPageByName("page_03_telephonic_symptoms").isVisible, true);
assert.equal(model.getPageByName("page_04_measurements_and_anc").isVisible, true);
model.setValue("pff_vital_migration_status_woman", 4);
model.setValue("pff_visit_type", 1);
assert.equal(model.getPageByName("page_03_telephonic_symptoms").isVisible, true);
assert.equal(model.getPageByName("page_04_measurements_and_anc").isVisible, true);
assert.equal(model.getQuestionByName("pff_short_form_stop_note").isVisible, false);
model.setValue("pff_visit_type", 2);
assert.equal(model.getPageByName("page_03_telephonic_symptoms").isVisible, true);
assert.equal(model.getPageByName("page_04_measurements_and_anc").isVisible, true);
model.setValue("pff_vital_migration_status_woman", 3);
model.setValue("pff_visit_type", 1);
assert.equal(model.getPageByName("page_03_telephonic_symptoms").isVisible, true);
assert.equal(model.getPageByName("page_04_measurements_and_anc").isVisible, true);
model.setValue("pff_vital_migration_status_woman", 1);

model.setValue("pff_visit_type", 2);
model.setValue("pff_ultrasound_form_already_been_filled", 1);
model.setValue("pff_any_time_during_pregnancy_ultrasound_test", 1);
model.setValue("pff_first_ultrasound_report", 1);
model.setValue("pff_other_ultrasound_tests_since_first", 1);
model.setValue("pff_vital_migration_status_woman", 2);
assert.equal(model.getQuestionByName("pff_dead_stop_message").isVisible, true);
for (const page of form.pages.slice(1)) {
  assert.equal(model.getPageByName(page.name).isVisible, false, `${page.name} must stop after a reported death`);
}
const firstPageElements = form.pages[0].elements;
for (const element of firstPageElements.slice(firstPageElements.findIndex((item) => item.name === "pff_vital_migration_status_woman") + 1)) {
  if (element.name === "pff_dead_stop_message") continue;
  assert.equal(model.getQuestionByName(element.name).isVisible, false, `${element.name} must stop after a reported death`);
}

// A synced PFF can retain this version label while carrying older visibility
// rules. The runtime stop must still hide Q12 and every later section.
const staleCachedPff = structuredClone(form);
const staleFirstPage = staleCachedPff.pages[0];
delete staleFirstPage.elements.find((item) => item.name === "pff_any_time_during_pregnancy_ultrasound_test").visibleIf;
delete staleCachedPff.pages[1].visibleIf;
const staleModel = new Model(prepareQuestionnaireSurveyJson(staleCachedPff));
staleModel.setValue("pff_visit_type", 2);
staleModel.setValue("pff_vital_migration_status_woman", 1);
staleModel.setValue("pff_pregnancy_status", 1);
staleModel.setValue("pff_ultrasound_form_already_been_filled", 1);
assert.equal(staleModel.getQuestionByName("pff_any_time_during_pregnancy_ultrasound_test").isVisible, true);
staleModel.setValue("pff_vital_migration_status_woman", 2);
assert.equal(staleModel.getQuestionByName("pff_any_time_during_pregnancy_ultrasound_test").isVisible, false);
assert.equal(staleModel.getPageByName("page_02_care_and_symptoms").isVisible, false);
staleModel.setValue("pff_vital_migration_status_woman", 1);
assert.equal(staleModel.getQuestionByName("pff_any_time_during_pregnancy_ultrasound_test").isVisible, true);
model.setValue("pff_vital_migration_status_woman", 1);

model.setValue("pff_ultrasound_form_already_been_filled", 2);
assert.equal(model.getQuestionByName("pff_any_time_during_pregnancy_ultrasound_test").isVisible, false);
assert.equal(model.getQuestionByName("pff_other_ultrasound_tests_since_first").isVisible, true);

model.setValue("pff_pregnancy_status", 2);
assert.equal(model.getQuestionByName("pff_other_ultrasound_tests_since_first").isVisible, true);
assert.equal(model.getQuestionByName("pff_pregnancy_ended_stop_message").isVisible, true);
for (const page of form.pages.slice(1)) {
  assert.equal(model.getPageByName(page.name).isVisible, false, `${page.name} must stop after Q15 when pregnancy has ended`);
}

model.setValue("pff_pregnancy_status", 3);
assert.equal(model.getQuestionByName("pff_never_pregnant_stop_message").isVisible, true);
for (const page of form.pages.slice(1)) {
  assert.equal(model.getPageByName(page.name).isVisible, false, `${page.name} must stop after Q10 when pregnancy never occurred`);
}
for (const element of firstPageElements.slice(firstPageElements.findIndex((item) => item.name === "pff_pregnancy_status") + 1)) {
  if (element.name === "pff_never_pregnant_stop_message") continue;
  assert.equal(model.getQuestionByName(element.name).isVisible, false, `${element.name} must stop after Q10`);
}

const linkedPef = {
  id: "pef-response-linked",
  form_code: "PEF",
  submitted_at: "2026-09-20T10:00:00.000Z",
  answers_json: {
    pef_pregnancy_id: "1-01-0001-02-1",
    pef_woman_name: "Sita Devi",
    pef_husband_name: "Mohan Lal",
  },
};
const newerPef = {
  id: "pef-response-newer",
  form_code: "PEF",
  submitted_at: "2026-09-21T10:00:00.000Z",
  answers_json: JSON.stringify({ pef_pregnancy_id: "wrong-pregnancy" }),
};
assert.equal(
  findPffSourcePefResponse(
    [newerPef, linkedPef],
    { source_form_response_id: linkedPef.id },
  ),
  linkedPef,
  "PFF identity must come from the PEF response that generated its task",
);
assert.deepEqual(parsePffSourceAnswers(linkedPef), linkedPef.answers_json);
assert.deepEqual(parsePffSourceAnswers(newerPef), { pef_pregnancy_id: "wrong-pregnancy" });

const olderPff = {
  id: "pff-response-older",
  task_id: "pff-task-1",
  form_code: "PFF",
  submitted_at: "2026-09-22T10:00:00.000Z",
  answers_json: { pff_visit_date: "2026-09-22" },
};
const latestPff = {
  id: "pff-response-latest",
  task_id: "pff-task-2",
  form_code: "PFF",
  submitted_at: "2026-09-25T10:00:00.000Z",
  answers_json: { pff_visit_date: "2026-09-25" },
};
assert.equal(
  findPreviousPffResponse([olderPff, latestPff], { id: "pff-task-3" }),
  latestPff,
  "PFF last visit date must come from the latest earlier PFF",
);
assert.equal(
  findPreviousPffResponse([latestPff], { id: "pff-task-2" }),
  null,
  "The first PFF must leave last visit date available for manual entry",
);
assert.deepEqual(
  buildPffLinkedSourcePrefill(
    [newerPef, linkedPef, olderPff, latestPff],
    { id: "pff-task-3", source_form_response_id: linkedPef.id },
  ),
  {
    pefAnswers: linkedPef.answers_json,
    previousPffAnswers: latestPff.answers_json,
    prefill: {
      pff_pregnancy_id: "1-01-0001-02-1",
      pff_woman_name: "Sita Devi",
      pff_husband_name: "Mohan Lal",
      pff_last_contact_date: "2026-09-25",
    },
    readOnlyFields: [
      "pff_pregnancy_id",
      "pff_woman_name",
      "pff_husband_name",
      "pff_last_contact_date",
    ],
  },
);
const firstPffPrefill = buildPffLinkedSourcePrefill(
  [linkedPef],
  { id: "pff-task-1", source_form_response_id: linkedPef.id },
);
assert.equal(firstPffPrefill.prefill.pff_last_contact_date, "");
assert.equal(firstPffPrefill.readOnlyFields.includes("pff_last_contact_date"), false);

const retainedPef = buildPffPefSnapshot({
  ...linkedPef.answers_json,
  pef_woman_hh_member_id: "1-01-0001-02",
  pef_height_cm: "165.5",
  pef_first_ultrasound_report: 1,
  unrelated_sensitive_answer: "do not copy",
});
assert.equal(retainedPef.unrelated_sensitive_answer, undefined);
const syncedPffPrefill = buildPffLinkedSourcePrefill([], {
  id: "pff-task-after-sync",
  subject_id: "1-01-0001-02-1",
  pff_pef_snapshot_json: JSON.stringify(retainedPef),
});
assert.equal(syncedPffPrefill.prefill.pff_pregnancy_id, linkedPef.answers_json.pef_pregnancy_id);
assert.equal(syncedPffPrefill.prefill.pff_woman_name, "Sita Devi");
assert.equal(syncedPffPrefill.prefill.pff_husband_name, "Mohan Lal");
assert.equal(syncedPffPrefill.prefill.pff_last_contact_date, "");
assert.equal(syncedPffPrefill.pefAnswers.pef_height_cm, "165.5");
assert.ok(syncedPffPrefill.readOnlyFields.includes("pff_pregnancy_id"));
assert.equal(buildPffLinkedSourcePrefill([], {
  pff_pef_snapshot_json: JSON.stringify(retainedPef),
  pff_last_visit_date: "2026-09-25",
}).prefill.pff_last_contact_date, "2026-09-25");
assert.equal(byName.get("pff_pregnancy_id").description, undefined);

console.log("Validated updated PFF workbook mapping and routing.");
