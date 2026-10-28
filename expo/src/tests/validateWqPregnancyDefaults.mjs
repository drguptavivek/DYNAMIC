import assert from "node:assert/strict";
import fs from "node:fs";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { getPreparedSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { NATIVE_FORM_TEXT, NATIVE_QUESTION_TITLE_KEYS } from "../lib/nativeFormText.js";
import formTranslation from "../../../shared/formTranslation.cjs";
import { getNativeRendererKind, getNativeQuestionChoices } from "../components/forms/nativeSurveyModel.js";
import {
  WQ_AGE_FIELD,
  WQ_CONTRACEPTION_FIELD,
  WQ_CURRENT_MARITAL_STATUS_FIELD,
  WQ_INTERVIEW_DATE_FIELD,
  WQ_LMP_FIELD,
  WQ_PREGNANT_FIELD,
  WQ_STERILIZATION_FIELD,
  WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD,
  applyWqLmpTimingChecks,
  applyWqPregnancyTrackingEligibility,
  applyWqDomesticViolenceSiteAccess,
  applyWqBiomarkerSiteAccess,
  attachWqValidation,
  shouldCompleteWqInterviewAfterPage,
  shouldRecalculateWqPregnancyTrackingEligibility,
  shouldRecalculateWqLmpTimingChecks,
} from "../lib/womanSurveyBehaviors.js";

const definition = JSON.parse(fs.readFileSync(new URL(
  "../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json", import.meta.url,
), "utf8"));

function createModel(answers = {}) {
  const model = createSurveyModel(getPreparedSurveyJson(definition));
  model.data = { [WQ_CURRENT_MARITAL_STATUS_FIELD]: 1, ...answers };
  // These are the same initialization and Q32-change hooks used by the dashboard.
  applyWqLmpTimingChecks(model);
  applyWqPregnancyTrackingEligibility(model);
  attachWqValidation(model);
  model.onValueChanged.add((sender, options) => {
    if (shouldRecalculateWqLmpTimingChecks(options.name)) applyWqLmpTimingChecks(sender);
    if (shouldRecalculateWqPregnancyTrackingEligibility(options.name)) applyWqPregnancyTrackingEligibility(sender);
  });
  return model;
}

function assertDefaults(model) {
  assert.equal(model.getValue(WQ_CONTRACEPTION_FIELD), 2);
  assert.equal(model.getValue(WQ_STERILIZATION_FIELD), 4);
  for (const name of [WQ_CONTRACEPTION_FIELD, WQ_STERILIZATION_FIELD]) {
    assert.equal(model.getQuestionByName(name).isVisible, true, `${name} remains visible`);
    assert.equal(model.getQuestionByName(name).isReadOnly, false, `${name} remains editable`);
  }
}

const codes = createModel();
assert.equal(codes.getQuestionByName(WQ_PREGNANT_FIELD).choices.find(c => c.value === 1).text, "yes");
assert.equal(codes.getQuestionByName(WQ_CONTRACEPTION_FIELD).choices.find(c => c.value === 2).text, "no");
assert.equal(codes.getQuestionByName(WQ_STERILIZATION_FIELD).choices.find(c => c.value === 4).text, "No, neither sterilized");

for (const yes of [1, "1"]) {
  const restored = createModel({
    [WQ_PREGNANT_FIELD]: yes,
    [WQ_CONTRACEPTION_FIELD]: 1,
    [WQ_STERILIZATION_FIELD]: 2,
  });
  assertDefaults(restored);
  const saved = structuredClone(restored.data);
  assertDefaults(createModel(saved));
  restored.setValue(WQ_PREGNANT_FIELD, 2);
  assert.equal(restored.getValue(WQ_CONTRACEPTION_FIELD), 1, "Restore contraception overwritten by Yes");
  assert.equal(restored.getValue(WQ_STERILIZATION_FIELD), 2, "Restore sterilization overwritten by Yes");

  const previouslyReportedNo = createModel({
    [WQ_PREGNANT_FIELD]: 2,
    [WQ_CONTRACEPTION_FIELD]: "2",
    [WQ_STERILIZATION_FIELD]: "4",
  });
  previouslyReportedNo.setValue(WQ_PREGNANT_FIELD, yes);
  previouslyReportedNo.setValue(WQ_PREGNANT_FIELD, 2);
  assert.equal(Number(previouslyReportedNo.getValue(WQ_CONTRACEPTION_FIELD)), 2);
  assert.equal(Number(previouslyReportedNo.getValue(WQ_STERILIZATION_FIELD)), 4);

  const changed = createModel();
  changed.setValue(WQ_PREGNANT_FIELD, yes);
  assertDefaults(changed);
  changed.setValue(WQ_PREGNANT_FIELD, 2);
  assert.equal(changed.getValue(WQ_CONTRACEPTION_FIELD), undefined);
  assert.equal(changed.getValue(WQ_STERILIZATION_FIELD), undefined);

  changed.setValue(WQ_PREGNANT_FIELD, yes);
  changed.setValue(WQ_CONTRACEPTION_FIELD, 1);
  changed.setValue(WQ_STERILIZATION_FIELD, 3);
  changed.setValue(WQ_PREGNANT_FIELD, 98);
  assert.equal(changed.getValue(WQ_CONTRACEPTION_FIELD), 1, "Keep manually changed contraception");
  assert.equal(changed.getValue(WQ_STERILIZATION_FIELD), 3, "Keep manually changed sterilization");
}

for (const pregnant of [undefined, 2, "2", 98, "98"]) {
  const model = createModel({
    [WQ_PREGNANT_FIELD]: pregnant,
    [WQ_CONTRACEPTION_FIELD]: 1,
    [WQ_STERILIZATION_FIELD]: 2,
  });
  assert.equal(model.getValue(WQ_CONTRACEPTION_FIELD), 1);
  assert.equal(model.getValue(WQ_STERILIZATION_FIELD), 2);
}

const lateRestore = createModel();
lateRestore.data = { [WQ_CURRENT_MARITAL_STATUS_FIELD]: 1, [WQ_PREGNANT_FIELD]: "1" };
applyWqLmpTimingChecks(lateRestore);
assertDefaults(lateRestore);

const messageKey = "wq_pregnancy_lmp_minimum_days";
const message = NATIVE_FORM_TEXT.WQ[messageKey];
assert.ok(NATIVE_QUESTION_TITLE_KEYS[WQ_LMP_FIELD].includes(messageKey));
for (const [code, texts] of Object.entries(NATIVE_FORM_TEXT)) {
  assert.equal(messageKey in texts, code === "WQ", "LMP minimum message belongs only to BWQ");
}
assert.ok(formTranslation.flattenFormText(getPreparedSurveyJson(definition))
  .some(row => row.name === `@native:${messageKey}`));
const invalidKey = "wq_pregnancy_lmp_invalid";
assert.ok(NATIVE_QUESTION_TITLE_KEYS[WQ_LMP_FIELD].includes(invalidKey));
assert.ok(formTranslation.flattenFormText(getPreparedSurveyJson(definition))
  .some(row => row.name === `@native:${invalidKey}`));
for (const [code, texts] of Object.entries(NATIVE_FORM_TEXT)) {
  assert.equal(invalidKey in texts, code === "WQ");
}

for (const [value, valid] of [
  [{ mode: "relative", unit: "days", value: "27" }, false],
  [{ mode: "relative", unit: "days", value: "28" }, true],
  [{ mode: "relative", unit: "weeks", value: "3" }, false],
  [{ mode: "relative", unit: "weeks", value: "4" }, true],
  [{ mode: "relative", unit: "months", value: "0" }, false],
  [{ mode: "relative", unit: "months", value: "1" }, true],
  [{ mode: "relative", unit: "years", value: "1" }, true],
  [{ mode: "date", day: "27", month: "09", year: "2026" }, false],
  [{ mode: "date", day: "26", month: "09", year: "2026" }, true],
]) {
  const model = createModel({
    [WQ_INTERVIEW_DATE_FIELD]: "2026-10-24",
    [WQ_PREGNANT_FIELD]: "1",
    [WQ_LMP_FIELD]: value,
  });
  const question = model.getQuestionByName(WQ_LMP_FIELD);
  assert.equal(question.validate(), valid, JSON.stringify(value));
  if (!valid) assert.ok(question.errors.some(error => error.text === message));
  assert.deepEqual(model.getValue(WQ_LMP_FIELD), value, "Validation never rewrites the answer");
  for (const notPregnant of [2, 98]) {
    model.setValue(WQ_PREGNANT_FIELD, notPregnant);
    assert.equal(question.validate(), true, "No/unsure do not use the pregnancy minimum");
  }
  model.setValue(WQ_PREGNANT_FIELD, 1);
  assert.equal(question.validate(), valid, "Q32 Yes immediately reapplies the minimum");
}

for (const value of [
  { mode: "date", day: "31", month: "09", year: "2025" },
  { mode: "date", day: "30", month: "02", year: "2024" },
  { mode: "date", day: "29", month: "02", year: "2025" },
  { mode: "date", day: "", month: "09", year: "2026" },
  { mode: "date", day: "01", month: "", year: "2026" },
  { mode: "date", day: "01", month: "09", year: "" },
  { mode: "relative", unit: "days", value: "" },
  { mode: "relative", unit: "unknown", value: "30" },
  { mode: "relative", unit: "days", value: "-1" },
  { mode: "relative", unit: "days", value: "abc" },
]) {
  const model = createModel({ [WQ_PREGNANT_FIELD]: 1, [WQ_LMP_FIELD]: value });
  const question = model.getQuestionByName(WQ_LMP_FIELD);
  assert.equal(question.validate(), false, JSON.stringify(value));
  assert.ok(question.errors.some(error => error.text === NATIVE_FORM_TEXT.WQ[invalidKey]));
  assert.deepEqual(model.getValue(WQ_LMP_FIELD), value);
}
const leapYear = createModel({
  [WQ_PREGNANT_FIELD]: 1,
  [WQ_INTERVIEW_DATE_FIELD]: "2024-03-28",
  [WQ_LMP_FIELD]: { mode: "date", day: "29", month: "02", year: "2024" },
});
assert.equal(leapYear.getQuestionByName(WQ_LMP_FIELD).validate(), true);
for (const code of [993, 994, 995, 996]) {
  const model = createModel({ [WQ_PREGNANT_FIELD]: 1, [WQ_LMP_FIELD]: code });
  assert.equal(model.getQuestionByName(WQ_LMP_FIELD).validate(), true, "Existing special response unchanged");
}
console.log("BWQ pregnancy defaults and inclusive 28-day LMP minimum passed.");

// Exercise Survey Core's real Next navigation, including restored drafts with Q38=2.
for (const siteId of [1, 2, 3, 4]) {
  for (const age of [30, 46]) {
    for (const lmp of [
      { mode: "relative", unit: "days", value: "30" },
      { mode: "date", day: "15", month: "09", year: "2026" },
    ]) {
      const answers = {
        [WQ_AGE_FIELD]: age, [WQ_PREGNANT_FIELD]: 1,
        [WQ_STERILIZATION_FIELD]: 4,
        [WQ_LMP_FIELD]: lmp,
        [WQ_INTERVIEW_DATE_FIELD]: "2026-10-26",
        wq_woman_available: 1, wq_consent_study: 1,
      };
      const original = createModel(answers);
      for (const model of [original, createModel(structuredClone(original.data))]) {
        const context = { taskContext: { site_id: siteId } };
        applyWqDomesticViolenceSiteAccess(model, context);
        applyWqBiomarkerSiteAccess(model, context);
        const eligibility = model.getQuestionByName(WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD);
        assert.equal(eligibility.value, age === 30 ? 1 : 2, "Keep actual Q38 eligibility codes");
        assert.equal(getNativeRendererKind(eligibility), "select-one");
        assert.equal(getNativeQuestionChoices(eligibility, "en")
          .find(choice => choice.value === eligibility.value).text,
        age === 30 ? "Yes, eligible" : "No, not eligible", "Show the choice label instead of a bare code");
        // Isolate routing from unrelated required interview answers.
        model.checkErrorsMode = "onComplete";
        model.currentPage = eligibility.page;
        const expectedPages = ["page_03_other_health_issues", "page_04_husband_background_woman_work",
          "page_06_biomarkers", ...(siteId === 4 ? ["page_05_domestic_violence"] : []), "page_outcome"];
        for (const page of expectedPages) {
          const previous = model.currentPage.name;
          assert.equal(model.nextPage(), true);
          assert.equal(model.currentPage.name, page, `Site ${siteId}, age ${age}: Next must not skip ${page}`);
          assert.equal(shouldCompleteWqInterviewAfterPage(model, previous), page === "page_outcome",
            "Only the last applicable section marks the full interview complete");
        }
        assert.equal(model.getQuestionByName("wq_blood_pressure_measured_site").readOnly, siteId !== 1);
        assert.equal(model.getQuestionByName("wq_hemoglobin_measured_site").readOnly, siteId !== 1);
        model.setValue(WQ_PREGNANT_FIELD, 2);
        assert.equal(model.getPageByName("page_03_other_health_issues").isVisible, true);
        model.setValue(WQ_PREGNANT_FIELD, 1);
        assert.equal(model.getPageByName("page_06_biomarkers").isVisible, true);
        model.setValue("wq_consent_study", 2);
        assert.equal(model.getPageByName("page_06_biomarkers").isVisible, false, "Consent stop still applies");
      }
    }
  }
}
console.log("BWQ pregnant interview navigation, draft restoration, Q38 labels and site restrictions passed.");

// Q38 controls tracking eligibility, not continuation through the remaining interview.
for (const siteId of [1, 2, 3, 4]) {
  for (const pregnant of [2, 98]) {
    for (const scenario of [
      { label: "eligible", age: 30, lmp: { mode: "relative", unit: "days", value: "30" }, sterilization: 4, eligibility: 1 },
      { label: "age outside tracking range", age: 46, lmp: { mode: "relative", unit: "days", value: "30" }, sterilization: 4, eligibility: 2 },
      { label: "sterilized", age: 30, lmp: { mode: "relative", unit: "days", value: "30" }, sterilization: 1, eligibility: 2 },
      { label: "menopause", age: 30, lmp: 994, sterilization: 4, eligibility: 2 },
      { label: "hysterectomy", age: 30, lmp: 993, sterilization: 4, eligibility: 2 },
    ]) {
      const original = createModel({
        [WQ_AGE_FIELD]: scenario.age, [WQ_PREGNANT_FIELD]: pregnant,
        [WQ_STERILIZATION_FIELD]: scenario.sterilization, [WQ_LMP_FIELD]: scenario.lmp,
        [WQ_INTERVIEW_DATE_FIELD]: "2026-10-28", wq_woman_available: 1, wq_consent_study: 1,
      });
      for (const model of [original, createModel(structuredClone(original.data))]) {
        const context = { taskContext: { site_id: siteId } };
        applyWqDomesticViolenceSiteAccess(model, context);
        applyWqBiomarkerSiteAccess(model, context);
        const eligibility = model.getQuestionByName(WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD);
        assert.equal(eligibility.value, scenario.eligibility, `${scenario.label}: preserve Q38's actual code`);
        model.checkErrorsMode = "onComplete";
        model.currentPage = eligibility.page;
        const expectedPages = ["page_03_other_health_issues", "page_04_husband_background_woman_work",
          "page_06_biomarkers", ...(siteId === 4 ? ["page_05_domestic_violence"] : []), "page_outcome"];
        for (const page of expectedPages) {
          const previous = model.currentPage.name;
          assert.equal(model.nextPage(), true);
          assert.equal(model.currentPage.name, page, `${scenario.label}, site ${siteId}, Q32=${pregnant}: Next must not skip ${page}`);
          assert.equal(shouldCompleteWqInterviewAfterPage(model, previous), page === "page_outcome");
        }
        assert.equal(model.getValue(WQ_PREGNANCY_TRACKING_ELIGIBLE_FIELD), scenario.eligibility);
        assert.equal(model.getQuestionByName("wq_blood_pressure_measured_site").readOnly, siteId !== 1);
        assert.equal(model.getQuestionByName("wq_hemoglobin_measured_site").readOnly, siteId !== 1);
        for (const [field, value] of [["wq_consent_study", 2], ["wq_woman_available", 2], [WQ_CURRENT_MARITAL_STATUS_FIELD, 7]]) {
          const before = model.getValue(field);
          model.setValue(field, value);
          for (const page of expectedPages.slice(0, 3)) assert.equal(model.getPageByName(page).isVisible, false, `${field}: existing stop guard remains`);
          model.setValue(field, before);
        }
      }
    }
  }
}
console.log("BWQ non-pregnant/unsure Q38 ineligible navigation and existing section restrictions passed.");
