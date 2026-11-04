import assert from "node:assert/strict";
import fs from "node:fs";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { setNativeQuestionValue, getNativeQuestionChoices, getNativeRendererKind } from "../components/forms/nativeSurveyModel.js";
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { applyPefBiomarkerSiteRequirements, applyPefOnSpotUptSiteVisibility } from "../lib/pefPrefillHelpers.js";
import { applyWqBiomarkerSiteAccess, applyWqDomesticViolenceSiteAccess,
  applyWqReproductionSummary, applyWqPregnancyHistoryCalculations, applyWqPregnancyTrackingEligibility,
  applyWqLmpTimingChecks, applyWqDomesticViolenceCalculations, attachWqValidation,
} from "../lib/womanSurveyBehaviors.js";

const load = (file) => JSON.parse(fs.readFileSync(new URL(`../data/forms/${file}`, import.meta.url), "utf8"));
const definitions = [
  load("baseline_woman_s_questionnaire_v2026.05.09.json"),
  load("pregnancy_enrollment_form_v2026.08.25.json"),
];
const allElements = (elements) => elements.flatMap((element) => [
  element, ...allElements(element.elements || []), ...allElements(element.templateElements || []),
]);
const elements = (form) => allElements(form.pages.flatMap((page) => page.elements));
const isolated = (question, locale = "en") => createSurveyModel({
  locale,
  pages: [{ name: "interview", elements: [{ ...question, visible: true, visibleIf: "", readOnly: false }] },
    { name: "outcome", elements: [{ type: "text", name: "outcome" }] }],
});

for (const definition of definitions) {
  // A cached/downloaded older definition with missing flags must receive the same rules.
  for (const question of elements(definition)) delete question.isRequired;
  const before = JSON.stringify(definition);
  const prepared = prepareQuestionnaireSurveyJson(definition);
  const required = elements(prepared).filter((question) => question.isRequired && !question.readOnly);
  assert.ok(required.length > (definition.form_code === "WQ" ? 100 : 35));
  for (const locale of ["en", "hi", "kn", "mr", "ta", "te"]) {
    for (const question of required) {
      const model = isolated(question, locale);
      const item = model.getQuestionByName(question.name);
      assert.equal(item.validate(), false, `${definition.form_code}/${locale}: blank ${question.name} must fail`);
      assert.equal(model.nextPage(), false, `Next must block blank ${question.name}`);
      assert.equal(model.validate(), false, `Final validation must block blank ${question.name}`);
      item.visible = false;
      assert.equal(model.validate(), true, `Hidden ${question.name} must not block`);
      item.visible = true;
      item.readOnly = true;
      assert.equal(model.validate(), true, `Locked ${question.name} must not block`);
    }
  }
  const name = definition.form_code === "WQ" ? "wq_name_woman" : "pef_woman_name";
  const active = createSurveyModel(prepared);
  assert.equal(active.nextPage(), false, `${definition.form_code} blank opening page must block`);
  assert.equal(active.getQuestionByName(name).isRequired, true);
  assert.equal(before, JSON.stringify(definition), "Preparation must not mutate a cached definition");
  for (const question of elements(prepared).filter((question) => question.type === "multipletext")) {
    assert.equal(question.items?.some((item) => item.isRequired === true) || false, false,
      `${question.name}: compound alternatives must not all become required`);
  }
}

const wq = prepareQuestionnaireSurveyJson(definitions[0]);
const pef = prepareQuestionnaireSurveyJson(definitions[1]);
const byName = (prepared, name) => elements(prepared).find((question) => question.name === name);
for (const prepared of [wq, pef]) {
  for (const definition of elements(prepared).filter((question) =>
    ["wq_lmp_timing", "lmp_timing", "years_with_special_codes", "days_with_special_codes"].includes(question.renderAs))) {
    const model = isolated(definition);
    const question = model.getQuestionByName(definition.name);
    assert.equal(question.getType(), "text");
    const lmp = definition.renderAs.endsWith("lmp_timing");
    assert.equal(getNativeRendererKind(question), lmp ? "wq-lmp-timing" : "select-one");
    assert.deepEqual(getNativeQuestionChoices(question).map((choice) => choice.value), definition.choices.map((choice) => choice.value));
    const values = lmp
      ? [{ mode: "date", day: "01", month: "08", year: "2026" },
        { mode: "relative", value: "12", unit: "weeks" }, 993]
      : ["05", "00", definition.choices[0].value];
    for (const value of values) {
      setNativeQuestionValue(question, value);
      assert.deepEqual(question.value, definition.inputType === "number" ? Number(value) : value,
        `${question.name} must preserve its existing input representation`);
      assert.equal(question.validate(), true, `${question.name} must accept ${JSON.stringify(value)}`);
    }
    if (lmp) {
      for (const value of [
        { mode: "date", day: "", month: "", year: "" },
        { mode: "date", day: "01", month: "08", year: "" },
        { mode: "relative", value: "", unit: "weeks" },
      ]) {
        setNativeQuestionValue(question, value);
        assert.equal(question.validate(), false, `${question.name} must require entered LMP components`);
        assert.equal(model.nextPage(), false);
        assert.equal(model.validate(), false);
      }
      setNativeQuestionValue(question, { mode: "relative", value: "12", unit: "weeks" });
      assert.equal(question.validate(), true, "Completing relative LMP must clear its required error");
      setNativeQuestionValue(question, 993);
      assert.equal(question.validate(), true, "Special LMP answer must not require date components");
    }
    setNativeQuestionValue(question, undefined);
    assert.equal(question.validate(), false, `${question.name} must still require an answer`);
  }
}
for (const [prepared, name, value] of [
  [wq, "wq_pregnant", 2],
  [wq, "wq_02_reproduction_how_many_sons_live_with_you", "0"],
  [pef, "pef_current_diabetes", 2],
]) {
  const model = isolated(byName(prepared, name));
  model.setValue(name, value);
  assert.equal(model.nextPage(), true, `${name}: No/zero must count as an answer`);
  assert.equal(model.validate(), true);
}

// Actual repeat rows enforce their visible child questions, without requiring a phantom row.
const pregnancy = byName(wq, "wq_pregnancy_history");
const repeat = isolated({ ...pregnancy, panelCount: 1, minPanelCount: 0 });
const panel = repeat.getQuestionByName(pregnancy.name).panels[0];
const plurality = panel.questions.find((question) => question.name.includes("think_back_to_your_first_pregnancy"));
plurality.visibleIf = "";
plurality.visible = true;
assert.equal(plurality.isRequired, true);
assert.equal(plurality.validate(), false);
plurality.value = 1;
assert.equal(plurality.validate(), true);
const childFollowup = byName(wq, "wq_born_alive_child_followups");
const childRepeat = isolated({ ...childFollowup, panelCount: 1 });
const child = childRepeat.getQuestionByName(childFollowup.name).panels[0].questions
  .find((question) => question.name === "pregnancy_02_reproduction_is_name_still_alive");
child.visibleIf = "";
child.visible = true;
assert.equal(child.validate(), false, "Each child's answer must be required");
child.value = 2;
assert.equal(child.validate(), true);

for (const site of [1, 2, 3, 4]) {
  const context = { taskContext: { site_id: site } };
  const pefModel = createSurveyModel(pef);
  applyPefOnSpotUptSiteVisibility(pefModel, context);
  applyPefBiomarkerSiteRequirements(pefModel, context);
  pefModel.setValue("pef_pregnancy_confirmed_upt", 2);
  assert.equal(pefModel.getQuestionByName("pef_on_spot_upt_result").isVisible, site === 1);
  for (const name of ["pef_weight_kg", "pef_height_cm"]) {
    assert.equal(pefModel.getQuestionByName(name).isRequired, site === 3 || site === 4);
  }
  assert.equal(pefModel.getQuestionByName("pef_blood_pressure").isRequired, false);
  const wqModel = createSurveyModel(wq);
  wqModel.data = { wq_woman_available: 1, wq_consent_study: 1,
    wq_current_marital_status: 1, wq_pregnancy_tracking_eligible: 2 };
  applyWqDomesticViolenceSiteAccess(wqModel, context);
  applyWqBiomarkerSiteAccess(wqModel, context);
  for (const name of ["wq_blood_pressure_measured_site", "wq_hemoglobin_measured_site"]) {
    assert.equal(wqModel.getQuestionByName(name).isReadOnly, site !== 1);
  }
  assert.equal(wqModel.getPageByName("page_05_domestic_violence").isVisible, site === 4,
    "Q38 No continues the interview while retaining the existing violence-site restriction");
}
const conditional = createSurveyModel(wq);
conditional.data = { wq_woman_available: 1, wq_consent_study: 1,
  wq_current_marital_status: 1, wq_pregnancy_tracking_eligible: 2 };
const diabetes = "wq_03_other_health_issues_do_you_currently_have_diabetes";
const treatment = conditional.getQuestionByName("wq_03_other_health_issues_have_you_sought_treatment_for_this_problem");
conditional.setValue(diabetes, 2);
assert.equal(treatment.isVisible, false);
assert.equal(treatment.validate(), true, "A No answer must not require its skipped follow-up");
conditional.setValue(diabetes, 1);
assert.equal(treatment.isVisible, true);
assert.equal(treatment.validate(), false, "A Yes answer must require the visible follow-up");
for (const name of ["pef_ultrasound_reports", "pef_anc_card_image"]) {
  assert.equal(byName(pef, name).isRequired, undefined, "Uploads retain dedicated attachment validation");
}
assert.equal(byName(wq, "wq_woman_mobile_numbers").minPanelCount, 0);
assert.equal(byName(wq, "wq_husband_partner_mobile").isRequired, undefined);

// Fill complete consenting routes using real visibility, validators and repeat rows.
const wholeWq = createSurveyModel(wq);
wholeWq.data = {
  wq_name_woman: "Test Woman", wq_interview_date: "2026-11-04", wq_visit_no: 1,
  wq_woman_available: 1, wq_consent_study: 1, wq_current_marital_status: 1,
  wq_age_last_birthday: "30",
  wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born: { day: "01", month: "01", year: "1996" },
  wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously: "10",
  wq_husband_partner_name: "Test Husband", wq_husband_partner_line_number: "02",
  wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt: 2,
  wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does: 1,
  wq_02_reproduction_how_many_miscarriages_abortions_and_stillb: "1",
  wq_02_reproduction_read_the_list_of_pregnancy_outcomes_in_ord: 1,
  wq_pregnant: 2,
  wq_02_reproduction_when_did_your_last_menstrual_period_start: { mode: "relative", value: "5", unit: "weeks" },
  wq_02_reproduction_how_old_were_you_when_you_had_your_first_m: "13",
  wq_height_measured_site_cm: "160", wq_weight_measured_site_kg: "60.0",
  wq_pregnancy_history: [{
    pregnancy_02_reproduction_if_i_1_think_back_to_your_first_pregnancy: 1,
    pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor: 3,
    pregnancy_02_reproduction_how_long_did_this_pregnancy_last_in_weeks: { weeks: "12" },
    pregnancy_02_reproduction_check_16_and_17_type_of_pregnancy_outcome: { day: "01", month: "08", year: "2025" },
  }],
};
const context = { taskContext: { site_id: 2 } };
applyWqBiomarkerSiteAccess(wholeWq, context);
applyWqDomesticViolenceSiteAccess(wholeWq, context);
attachWqValidation(wholeWq);
function fillVisibleAnswers(model) {
  for (let pass = 0; pass < 5; pass += 1) {
    for (const page of model.visiblePages) {
      for (const question of page.questions) {
        if (!question.isVisible || question.isReadOnly || !question.isRequired || !question.isEmpty()) continue;
        const choices = question.visibleChoices || [];
        if (choices.length) {
          const value = choices.find((choice) => choice.value === 2)?.value ?? choices[0].value;
          question.value = question.getType() === "checkbox" ? [value] : value;
        } else if (question.getType() === "text") {
          question.value = question.name.includes("name") || question.name.includes("occupation") ? "Test answer" : "0";
        }
      }
    }
  }
}
fillVisibleAnswers(wholeWq);
applyWqReproductionSummary(wholeWq);
applyWqPregnancyHistoryCalculations(wholeWq);
applyWqLmpTimingChecks(wholeWq);
applyWqPregnancyTrackingEligibility(wholeWq);
applyWqDomesticViolenceCalculations(wholeWq);
fillVisibleAnswers(wholeWq);
const errors = (model) => model.getAllQuestions().filter((question) => question.errors.length)
  .map((question) => `${question.name}: ${question.errors.map((error) => error.getText()).join(";")}`);
assert.equal(wholeWq.validate(), true, JSON.stringify(errors(wholeWq)));
assert.equal(wholeWq.getQuestionByName("wq_pregnancy_history").panels.length, 1);
wholeWq.currentPage = wholeWq.pages[0];
wholeWq.setValue("wq_name_woman", undefined);
assert.equal(wholeWq.nextPage(), false, "Clearing an answer in an otherwise valid BWQ must block Next");
assert.equal(wholeWq.validate(), false, "It must also block final submission");
wholeWq.setValue("wq_name_woman", "Test Woman");
assert.equal(wholeWq.validate(), true);

// Never-pregnant women must not be forced to invent a pregnancy for Q22_i.
const historyReviewField = "pregnancy_02_reproduction_if_row_i_1_were_there_any_other_pregnancie";
const historyCheckField = "wq_02_reproduction_check_12";
const lossField = "wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does";
const lossCountField = "wq_02_reproduction_how_many_miscarriages_abortions_and_stillb";
for (const no of [2, "2"]) {
  const noHistory = createSurveyModel(wq);
  noHistory.data = { ...structuredClone(wholeWq.data),
    wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt: no,
    wq_02_reproduction_have_you_ever_given_birth_to_a_boy_or_girl: no,
    wq_02_reproduction_probe_born_alive_signs_of_life: no,
    [lossField]: no, wq_pregnancy_history: undefined,
    [historyReviewField]: undefined,
  };
  applyWqReproductionSummary(noHistory);
  applyWqPregnancyHistoryCalculations(noHistory);
  assert.equal(noHistory.getValue(historyCheckField), 2);
  const review = noHistory.getQuestionByName(historyReviewField);
  assert.equal(review.isVisible, false, "No previous pregnancy must hide the empty required review");
  assert.equal(noHistory.getPageByName("page_02a_pregnancy_history").isVisible, false);
  noHistory.currentPage = noHistory.getPageByName("page_02_reproduction");
  assert.equal(noHistory.nextPage(), true, "The answered reproduction screen must advance");
  assert.notEqual(noHistory.currentPage.name, "page_02b_reproduction_follow_up");
  assert.equal(noHistory.nextPage(), true, "Existing empty child summary must not block continuation");
  assert.equal(noHistory.currentPage.name, "page_02e_reproduction_after_comparison");
  assert.equal(noHistory.getValue(historyReviewField), undefined, "Do not fabricate a review answer");
  assert.equal(noHistory.getQuestionByName("wq_pregnancy_history").panels.length, 0);
  applyWqBiomarkerSiteAccess(noHistory, context);
  applyWqDomesticViolenceSiteAccess(noHistory, context);
  attachWqValidation(noHistory);
  fillVisibleAnswers(noHistory);
  assert.equal(noHistory.validate(), true, "Skipped history must not block final validation");
  const restored = createSurveyModel(wq);
  restored.data = structuredClone(noHistory.data);
  applyWqReproductionSummary(restored);
  assert.equal(restored.getQuestionByName(historyReviewField).isVisible, false);
  restored.setValue(lossField, 1);
  restored.setValue(lossCountField, "1");
  applyWqReproductionSummary(restored);
  assert.equal(restored.getValue("wq_pregnant"), 2, "Current pregnancy does not control past-history review");
  const restoredReview = restored.getQuestionByName(historyReviewField);
  assert.equal(restoredReview.isVisible, true, "Miscarriage-only history still needs review");
  assert.equal(restoredReview.isRequired, true);
  assert.equal(restoredReview.validate(), false);
  restored.setValue(lossField, no);
  applyWqReproductionSummary(restored);
  assert.equal(restoredReview.isVisible, false, "Changing back to no history must hide the review again");
}
const retainedHistory = createSurveyModel(wq);
retainedHistory.data = structuredClone(wholeWq.data);
const retainedRows = structuredClone(retainedHistory.getValue("wq_pregnancy_history"));
retainedHistory.setValue(historyCheckField, 2);
assert.equal(retainedHistory.getQuestionByName(historyReviewField).isVisible, false);
assert.deepEqual(retainedHistory.getValue("wq_pregnancy_history"), retainedRows, "Hiding review must not delete saved rows");
retainedHistory.setValue(historyCheckField, "1");
assert.equal(retainedHistory.getQuestionByName(historyReviewField).isVisible, true);
const previouslyGuarded = load("baseline_woman_s_questionnaire_v2026.05.09.json");
elements(previouslyGuarded).find((question) => question.name === historyReviewField).visibleIf = "{wq_woman_available} = 1";
const guardedBefore = JSON.stringify(previouslyGuarded);
const guardedReviewModel = createSurveyModel(prepareQuestionnaireSurveyJson(previouslyGuarded));
assert.equal(JSON.stringify(previouslyGuarded), guardedBefore, "Downloaded definition must remain unchanged");
guardedReviewModel.data = { wq_woman_available: 2, [historyCheckField]: 1 };
assert.equal(guardedReviewModel.getQuestionByName(historyReviewField).isVisible, false);
guardedReviewModel.setValue("wq_woman_available", 1);
assert.equal(guardedReviewModel.getQuestionByName(historyReviewField).isVisible, true,
  "The original review condition and past-pregnancy condition must both hold");
guardedReviewModel.setValue(historyCheckField, "2");
assert.equal(guardedReviewModel.getQuestionByName(historyReviewField).isVisible, false);
const wholePef = createSurveyModel(pef);
wholePef.data = {
  pef_pregnancy_information_source: 1, pef_woman_hh_member_id: "2-39-0002-01-02",
  pef_woman_name: "Test Woman", pef_husband_name: "Test Husband",
  pef_household_head_name: "Test Head", pef_current_address: "Test address",
  pef_enrollment_date: "2026-11-04", pef_pregnancy_confirmed_upt: 1,
  pef_pregnancy_rank_since_baseline: 1, pef_pregnancy_id: "2-39-0002-01-02-1",
  pef_gestation_unit: { weeks: "12" },
  pef_lmp_start: { mode: "relative", value: "12", unit: "weeks" },
};
applyPefOnSpotUptSiteVisibility(wholePef, context);
applyPefBiomarkerSiteRequirements(wholePef, context);
fillVisibleAnswers(wholePef);
assert.equal(wholePef.validate(), true, JSON.stringify(errors(wholePef)));
wholePef.setValue("pef_current_diabetes", undefined);
assert.equal(wholePef.nextPage(), false, "Clearing an answer in an otherwise valid PEF must block Next");
assert.equal(wholePef.validate(), false);
wholePef.setValue("pef_current_diabetes", 2);
assert.equal(wholePef.validate(), true);
console.log("BWQ/PEF mandatory questions, navigation, final validation, repeats, locales and site exceptions passed");
