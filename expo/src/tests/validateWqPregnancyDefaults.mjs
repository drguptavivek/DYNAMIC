import assert from "node:assert/strict";
import fs from "node:fs";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { getPreparedSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { NATIVE_FORM_TEXT, NATIVE_QUESTION_TITLE_KEYS } from "../lib/nativeFormText.js";
import formTranslation from "../../../shared/formTranslation.cjs";
import {
  WQ_CONTRACEPTION_FIELD,
  WQ_CURRENT_MARITAL_STATUS_FIELD,
  WQ_INTERVIEW_DATE_FIELD,
  WQ_LMP_FIELD,
  WQ_PREGNANT_FIELD,
  WQ_STERILIZATION_FIELD,
  applyWqLmpTimingChecks,
  attachWqValidation,
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
  attachWqValidation(model);
  model.onValueChanged.add((sender, options) => {
    if (shouldRecalculateWqLmpTimingChecks(options.name)) applyWqLmpTimingChecks(sender);
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
