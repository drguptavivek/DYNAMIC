/** Verifies interviewer-consistency checks on the Baseline Woman's Questionnaire. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";

const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);
const {
  WQ_AGE_FIELD,
  WQ_BIRTH_MONTH_YEAR_FIELD,
  WQ_BOYS_DEAD_FIELD,
  WQ_BORN_ALIVE_LATER_DIED_FIELD,
  WQ_BORN_ALIVE_PROBE_FIELD,
  WQ_CHECK8_CONFIRMATION_FIELD,
  WQ_CHECK8_CONFIRMATION_MESSAGE,
  WQ_INTERVIEW_DATE_FIELD,
  WQ_PREGNANCY_BIRTH_DATE_FIELD,
  WQ_PREGNANCY_BIRTH_RESULT_FIELD,
  WQ_PREGNANCY_CHILD_AGE_FIELD,
  WQ_PREGNANCY_DEATH_AGE_FIELD,
  WQ_PREGNANCY_DURATION_FIELD,
  WQ_PREGNANCY_HISTORY_FIELD,
  WQ_PREGNANCY_ROW_ID_FIELD,
  WQ_PREGNANCY_SIGN_OF_LIFE_FIELD,
  WQ_TOTAL_LIVE_BIRTHS_FIELD,
  applyWqAgeConsistencyCheck,
  applyWqBornAliveProbe,
  applyWqCheck8Confirmation,
  applyWqPregnancyHistoryCalculations,
  applyWqReproductionSummary,
  attachWqValidation,
  calculateWqAgeConsistencyMessage,
  calculateWqAgesFromBirthDate,
  calculateWqChildAgeAtLastBirthdayMessage,
  calculateWqDeathAgeMessage,
  calculateWqPregnancyBirthDateMessage,
  calculateWqPregnancyDurationMessage,
  shouldRecalculateWqAgeConsistency,
  shouldRecalculateWqPregnancyHistory,
} = await import("../lib/womanSurveyBehaviors.js");

const root = path.dirname(fileURLToPath(import.meta.url));
const wqPath = path.resolve(
  root,
  "../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json"
);
const wq = JSON.parse(fs.readFileSync(wqPath, "utf8"));

function createWqModel() {
  return createSurveyModel(prepareQuestionnaireSurveyJson(wq));
}

function question(model, name) {
  const item = model.getQuestionByName(name);
  assert.ok(item, `Expected WQ question ${name} to exist`);
  return item;
}

function panelQuestion(panel, name) {
  const item = panel.getQuestionByName(name);
  assert.ok(item, `Expected pregnancy-history question ${name} to exist`);
  return item;
}

function addPregnancyHistoryPanel(model) {
  const panelDynamic = question(model, WQ_PREGNANCY_HISTORY_FIELD);
  panelDynamic.addPanel();
  return panelDynamic.panels[panelDynamic.panels.length - 1];
}

function questionHasErrorText(item, message) {
  return (item.errors || []).some((error) =>
    (error.getText ? error.getText() : String(error)).includes(message)
  );
}

function createReproductionHistoryModel() {
  const historyModel = createWqModel();
  historyModel.setValue(WQ_INTERVIEW_DATE_FIELD, "2026-08-14");
  historyModel.setValue("wq_visit_no", 1);
  historyModel.setValue("wq_woman_available", 1);
  historyModel.setValue("wq_consent_study", 1);
  historyModel.setValue("wq_current_marital_status", 1);
  historyModel.setValue("wq_02_reproduction_check_12", 1);
  return historyModel;
}

function isVisible(model, name) {
  return question(model, name).isVisible;
}

// --- calculateWqAgesFromBirthDate -----------------------------------------

assert.deepEqual(
  calculateWqAgesFromBirthDate({
    month: "03",
    year: "1999",
    referenceDate: new Date(2026, 7, 14), // 14 Aug 2026, birthday already passed
  }),
  [27],
  "Known birth month before the reference month should give exactly one completed age"
);

assert.deepEqual(
  calculateWqAgesFromBirthDate({
    month: "12",
    year: "1999",
    referenceDate: new Date(2026, 7, 14), // 14 Aug 2026, birthday has not happened yet
  }),
  [26],
  "Known birth month after the reference month should subtract one completed year"
);

assert.deepEqual(
  calculateWqAgesFromBirthDate({
    month: "98",
    year: "1999",
    referenceDate: new Date(2026, 7, 14),
  }).sort(),
  [26, 27],
  "Unknown month must yield two acceptable completed ages"
);

assert.equal(
  calculateWqAgesFromBirthDate({
    month: "03",
    year: "9998",
    referenceDate: new Date(2026, 7, 14),
  }),
  null,
  "Unknown year must skip the check entirely"
);

assert.deepEqual(
  calculateWqAgesFromBirthDate({
    month: "98",
    year: String(new Date(2026, 7, 14).getFullYear()),
    referenceDate: new Date(2026, 7, 14),
  }),
  [0],
  "Ages must never go below zero, even for an unknown-month newborn"
);

// --- calculateWqResidenceAgeMessage (Q9 vs Q11) ------------------------------

const {
  WQ_RESIDENCE_YEARS_FIELD,
  calculateWqResidenceAgeMessage,
  calculateWqQ11ConsistencyMessage,
} = await import("../lib/womanSurveyBehaviors.js");

assert.equal(
  calculateWqResidenceAgeMessage({ [WQ_RESIDENCE_YEARS_FIELD]: "12", [WQ_AGE_FIELD]: "" }),
  null,
  "Residence check waits for Q11"
);
assert.equal(
  calculateWqResidenceAgeMessage({ [WQ_RESIDENCE_YEARS_FIELD]: "12", [WQ_AGE_FIELD]: "27" }),
  null
);
assert.equal(
  calculateWqResidenceAgeMessage({ [WQ_RESIDENCE_YEARS_FIELD]: "27", [WQ_AGE_FIELD]: "27" }),
  null,
  "Equal is allowed"
);
assert.equal(
  calculateWqResidenceAgeMessage({ [WQ_RESIDENCE_YEARS_FIELD]: 95, [WQ_AGE_FIELD]: "20" }),
  null,
  "95 always is skipped"
);
assert.equal(
  calculateWqResidenceAgeMessage({ [WQ_RESIDENCE_YEARS_FIELD]: "96", [WQ_AGE_FIELD]: "20" }),
  null,
  "96 visitor is skipped"
);
assert.equal(
  calculateWqResidenceAgeMessage({ [WQ_RESIDENCE_YEARS_FIELD]: "30", [WQ_AGE_FIELD]: "27" }),
  "Q9 says 30 years living here but Q11 age is 27. Compare and correct 9 and/or 11."
);
assert.equal(
  calculateWqQ11ConsistencyMessage(
    {
      [WQ_BIRTH_MONTH_YEAR_FIELD]: { month: "03", year: "1999" },
      [WQ_AGE_FIELD]: "27",
      [WQ_RESIDENCE_YEARS_FIELD]: "30",
    },
    new Date(2026, 7, 14)
  ),
  "Q9 says 30 years living here but Q11 age is 27. Compare and correct 9 and/or 11.",
  "Combined Q11 message carries only the failing rule"
);

// --- calculateWqAgeConsistencyMessage --------------------------------------

assert.equal(
  calculateWqAgeConsistencyMessage(
    {
      [WQ_BIRTH_MONTH_YEAR_FIELD]: { month: "03", year: "1999" },
      [WQ_AGE_FIELD]: "",
    },
    new Date(2026, 7, 14)
  ),
  null,
  "An empty Q11 must not raise a consistency message"
);

assert.equal(
  calculateWqAgeConsistencyMessage(
    {
      [WQ_BIRTH_MONTH_YEAR_FIELD]: { month: "03", year: "1999" },
      [WQ_AGE_FIELD]: "27",
    },
    new Date(2026, 7, 14)
  ),
  null,
  "A consistent age must not raise a message"
);

assert.equal(
  calculateWqAgeConsistencyMessage(
    {
      [WQ_BIRTH_MONTH_YEAR_FIELD]: { month: "03", year: "1999" },
      [WQ_AGE_FIELD]: "25",
    },
    new Date(2026, 7, 14)
  ),
  "Q10 gives 27 years (born 03/1999) but Q11 says 25. Compare and correct 10 and/or 11.",
  "An inconsistent known-month age must produce the documented message"
);

assert.equal(
  calculateWqAgeConsistencyMessage(
    {
      [WQ_BIRTH_MONTH_YEAR_FIELD]: { month: "98", year: "1999" },
      [WQ_AGE_FIELD]: "25",
    },
    new Date(2026, 7, 14)
  ),
  "Q10 gives 26 or 27 years (born 1999) but Q11 says 25. Compare and correct 10 and/or 11.",
  "An inconsistent unknown-month age must list both acceptable ages"
);

// --- applyWqAgeConsistencyCheck / attachWqValidation on a live model ------

const model = createWqModel();
attachWqValidation(model);
model.setValue(WQ_INTERVIEW_DATE_FIELD, "2026-08-14");
model.setValue("wq_visit_no", 1);
model.setValue("wq_woman_available", 1);
model.setValue("wq_consent_study", 1);
model.setValue(WQ_BIRTH_MONTH_YEAR_FIELD, { month: "03", year: "1999" });
model.setValue(WQ_AGE_FIELD, "25");
applyWqAgeConsistencyCheck(model);

const ageQuestion = question(model, WQ_AGE_FIELD);
assert.ok(
  ageQuestion.errors.some((error) =>
    (error.getText ? error.getText() : String(error)).includes("Compare and correct 10 and/or 11")
  ),
  "Q11 must display the inline inconsistency message"
);

assert.equal(
  model.validate(),
  false,
  "The model must fail validation while Q10/Q11 are inconsistent"
);
assert.ok(
  ageQuestion.errors.length > 0,
  "onValidateQuestion must re-add the blocking error even after SurveyJS revalidates"
);

model.setValue(WQ_AGE_FIELD, "27");
applyWqAgeConsistencyCheck(model);
assert.equal(
  ageQuestion.errors.length,
  0,
  "Correcting Q11 to a consistent age must clear the message"
);
assert.equal(model.validate(), true, "A consistent model must pass validation");

// Q9 residence years above Q11 age blocks on Q11 and clears when corrected;
// the 95/96 special codes never block.
model.setValue(WQ_RESIDENCE_YEARS_FIELD, "30");
applyWqAgeConsistencyCheck(model);
assert.ok(
  ageQuestion.errors.some((error) =>
    (error.getText ? error.getText() : String(error)).includes("Compare and correct 9 and/or 11")
  ),
  "Q11 must display the residence inconsistency message"
);
assert.equal(model.validate(), false, "Residence years above age must block validation");
model.setValue(WQ_RESIDENCE_YEARS_FIELD, 95);
applyWqAgeConsistencyCheck(model);
assert.equal(ageQuestion.errors.length, 0, "95 always must not block");
assert.equal(model.validate(), true);
model.setValue(WQ_RESIDENCE_YEARS_FIELD, "10");
applyWqAgeConsistencyCheck(model);
assert.equal(model.validate(), true, "Residence years below age passes");
assert.equal(shouldRecalculateWqAgeConsistency(WQ_RESIDENCE_YEARS_FIELD), true);

assert.equal(shouldRecalculateWqAgeConsistency(WQ_BIRTH_MONTH_YEAR_FIELD), true);
assert.equal(shouldRecalculateWqAgeConsistency(WQ_AGE_FIELD), true);
assert.equal(shouldRecalculateWqAgeConsistency(WQ_INTERVIEW_DATE_FIELD), true);
assert.equal(shouldRecalculateWqAgeConsistency("wq_visit_no"), false);

// --- applyWqBornAliveProbe --------------------------------------------------

function createReproductionReadyModel() {
  const reproductionModel = createWqModel();
  reproductionModel.setValue(WQ_INTERVIEW_DATE_FIELD, "2026-08-14");
  reproductionModel.setValue("wq_visit_no", 1);
  reproductionModel.setValue("wq_woman_available", 1);
  reproductionModel.setValue("wq_consent_study", 1);
  reproductionModel.setValue("wq_current_marital_status", 1);
  reproductionModel.setValue(
    "wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt",
    2
  );
  return reproductionModel;
}

const probeYesModel = createReproductionReadyModel();
probeYesModel.setValue(WQ_BORN_ALIVE_LATER_DIED_FIELD, 2);
applyWqReproductionSummary(probeYesModel);
probeYesModel.setValue(WQ_BORN_ALIVE_PROBE_FIELD, 1);
const probeYesFocus = applyWqBornAliveProbe(probeYesModel, WQ_BORN_ALIVE_PROBE_FIELD);
assert.equal(
  probeYesModel.getValue(WQ_BORN_ALIVE_LATER_DIED_FIELD),
  1,
  "Probe=1 must flip Q6 to yes"
);
assert.equal(probeYesFocus, WQ_BOYS_DEAD_FIELD, "Probe=1 must request focus on Q7a");
assert.equal(
  isVisible(probeYesModel, WQ_BOYS_DEAD_FIELD),
  true,
  "Q7a must become visible once Q6 flips to yes"
);
applyWqReproductionSummary(probeYesModel);
assert.notEqual(
  probeYesModel.getValue(WQ_TOTAL_LIVE_BIRTHS_FIELD),
  undefined,
  "Q8 must still auto-sum after a probe=1 override"
);

const probeNoModel = createReproductionReadyModel();
probeNoModel.setValue(WQ_BORN_ALIVE_LATER_DIED_FIELD, 2);
applyWqReproductionSummary(probeNoModel);
probeNoModel.setValue(WQ_BORN_ALIVE_PROBE_FIELD, 2);
const probeNoFocus = applyWqBornAliveProbe(probeNoModel, WQ_BORN_ALIVE_PROBE_FIELD);
assert.equal(probeNoFocus, undefined, "Probe=2 must not request a focus jump");
assert.equal(
  probeNoModel.getValue(WQ_BORN_ALIVE_LATER_DIED_FIELD),
  2,
  "Probe=2 must leave Q6 at no"
);
applyWqReproductionSummary(probeNoModel);
assert.equal(
  probeNoModel.getValue(WQ_TOTAL_LIVE_BIRTHS_FIELD),
  "00",
  "Q8 must stay auto-summed to zero while Q6 is no"
);

const overrideModel = createReproductionReadyModel();
overrideModel.setValue(WQ_BORN_ALIVE_LATER_DIED_FIELD, 2);
applyWqReproductionSummary(overrideModel);
overrideModel.setValue(WQ_BORN_ALIVE_PROBE_FIELD, 1);
applyWqBornAliveProbe(overrideModel, WQ_BORN_ALIVE_PROBE_FIELD);
assert.equal(overrideModel.getValue(WQ_BORN_ALIVE_LATER_DIED_FIELD), 1);
// Interviewer overrides Q6 back to "no" by hand after the probe said yes.
overrideModel.setValue(WQ_BORN_ALIVE_LATER_DIED_FIELD, 2);
applyWqBornAliveProbe(overrideModel, WQ_BORN_ALIVE_LATER_DIED_FIELD);
assert.equal(
  overrideModel.getValue(WQ_BORN_ALIVE_PROBE_FIELD),
  undefined,
  "Manually overriding Q6 against the probe answer must clear the probe"
);

// --- applyWqCheck8Confirmation / Q9 blocking -------------------------------

function questionHasMessage(item, message) {
  return (item.errors || []).some((error) =>
    (error.getText ? error.getText() : String(error)).includes(message)
  );
}

const check8Model = createWqModel();
attachWqValidation(check8Model);
check8Model.setValue(WQ_INTERVIEW_DATE_FIELD, "2026-08-14");
check8Model.setValue("wq_visit_no", 1);
check8Model.setValue("wq_woman_available", 1);
check8Model.setValue("wq_consent_study", 1);
check8Model.setValue("wq_current_marital_status", 1);
check8Model.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 1);
check8Model.setValue("wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom", 2);
check8Model.setValue("wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom_2", 2);
check8Model.setValue(WQ_BORN_ALIVE_LATER_DIED_FIELD, 2);
applyWqReproductionSummary(check8Model);
assert.equal(check8Model.getValue(WQ_TOTAL_LIVE_BIRTHS_FIELD), "00");

check8Model.setValue(WQ_CHECK8_CONFIRMATION_FIELD, 2);
applyWqCheck8Confirmation(check8Model);
const check8Question = question(check8Model, WQ_CHECK8_CONFIRMATION_FIELD);
assert.ok(
  questionHasMessage(check8Question, WQ_CHECK8_CONFIRMATION_MESSAGE),
  "Q9 = no must show the reconfirmation message inline"
);
assert.equal(
  check8Model.validate(),
  false,
  "The model must fail validation while Q9 denies the Q8 total"
);

check8Model.setValue(WQ_BORN_ALIVE_LATER_DIED_FIELD, 1);
applyWqReproductionSummary(check8Model);
check8Model.setValue(WQ_CHECK8_CONFIRMATION_FIELD, 2);
applyWqCheck8Confirmation(check8Model);
assert.ok(
  questionHasMessage(question(check8Model, WQ_CHECK8_CONFIRMATION_FIELD), WQ_CHECK8_CONFIRMATION_MESSAGE),
  "Q9 = no must still block after Q6 flips to yes"
);
check8Model.setValue(WQ_BOYS_DEAD_FIELD, "02");
applyWqReproductionSummary(check8Model);
assert.equal(
  check8Model.getValue(WQ_CHECK8_CONFIRMATION_FIELD),
  undefined,
  "Changing 7a (and therefore the Q8 total) must clear the stale Q9 confirmation"
);
applyWqCheck8Confirmation(check8Model);
assert.equal(
  question(check8Model, WQ_CHECK8_CONFIRMATION_FIELD).errors.length,
  0,
  "Clearing Q9 must also clear its inline message"
);
assert.equal(check8Model.validate(), true, "A cleared Q9 must not block validation");

// --- calculateWqPregnancyDurationMessage / Q21_i ---------------------------

assert.equal(
  calculateWqPregnancyDurationMessage({
    [WQ_PREGNANCY_BIRTH_RESULT_FIELD]: 1,
    [WQ_PREGNANCY_SIGN_OF_LIFE_FIELD]: undefined,
    [WQ_PREGNANCY_DURATION_FIELD]: { weeks: "20" },
  }),
  "A born-alive pregnancy must have lasted 24 to 46 weeks (entered 20).",
  "A born-alive pregnancy under 24 weeks must be flagged"
);
assert.equal(
  calculateWqPregnancyDurationMessage({
    [WQ_PREGNANCY_BIRTH_RESULT_FIELD]: 1,
    [WQ_PREGNANCY_DURATION_FIELD]: { weeks: "30" },
  }),
  null,
  "A born-alive pregnancy of 30 weeks is consistent"
);
assert.equal(
  calculateWqPregnancyDurationMessage({
    [WQ_PREGNANCY_BIRTH_RESULT_FIELD]: 2,
    [WQ_PREGNANCY_DURATION_FIELD]: { weeks: "03" },
  }),
  "This pregnancy must have lasted 4 to 46 weeks (entered 3).",
  "A non-born-alive pregnancy under 4 weeks must be flagged"
);
assert.equal(
  calculateWqPregnancyDurationMessage({
    [WQ_PREGNANCY_BIRTH_RESULT_FIELD]: 1,
    [WQ_PREGNANCY_DURATION_FIELD]: { months: "05" },
  }),
  "A born-alive pregnancy must have lasted 6 to 10 months (entered 5).",
  "A born-alive pregnancy under 6 months must be flagged"
);
assert.equal(
  calculateWqPregnancyDurationMessage({
    [WQ_PREGNANCY_BIRTH_RESULT_FIELD]: 2,
    [WQ_PREGNANCY_DURATION_FIELD]: { months: "02" },
  }),
  null,
  "A non-born-alive pregnancy of 2 months is consistent"
);

const durationModel = createReproductionHistoryModel();
attachWqValidation(durationModel);
const durationPanel = addPregnancyHistoryPanel(durationModel);
panelQuestion(durationPanel, WQ_PREGNANCY_BIRTH_RESULT_FIELD).value = 1;
panelQuestion(durationPanel, WQ_PREGNANCY_DURATION_FIELD).value = { weeks: "20" };
applyWqPregnancyHistoryCalculations(durationModel);
const durationQuestion = panelQuestion(durationPanel, WQ_PREGNANCY_DURATION_FIELD);
assert.ok(
  questionHasErrorText(
    durationQuestion,
    "A born-alive pregnancy must have lasted 24 to 46 weeks (entered 20)."
  ),
  "Q21_i must show the inline duration mismatch"
);
assert.equal(
  durationModel.validate(),
  false,
  "The model must fail validation while Q21_i contradicts the born-alive outcome"
);
panelQuestion(durationPanel, WQ_PREGNANCY_DURATION_FIELD).value = { weeks: "30" };
applyWqPregnancyHistoryCalculations(durationModel);
assert.equal(
  panelQuestion(durationPanel, WQ_PREGNANCY_DURATION_FIELD).errors.length,
  0,
  "Correcting Q21_i must clear the duration message"
);
assert.equal(
  shouldRecalculateWqPregnancyHistory(WQ_PREGNANCY_BIRTH_DATE_FIELD),
  true,
  "20_i changes must trigger the pregnancy-history recalculation hook"
);
assert.equal(
  shouldRecalculateWqPregnancyHistory(WQ_PREGNANCY_CHILD_AGE_FIELD),
  true,
  "25_i changes must trigger the pregnancy-history recalculation hook"
);
assert.equal(
  shouldRecalculateWqPregnancyHistory(WQ_INTERVIEW_DATE_FIELD),
  true,
  "Interview date changes must trigger the pregnancy-history recalculation hook"
);

// --- calculateWqPregnancyBirthDateMessage / Q20_i --------------------------

const referenceDate2026 = new Date(Date.UTC(2026, 7, 14)); // 14 Aug 2026

assert.equal(
  calculateWqPregnancyBirthDateMessage(
    { day: "30", month: "02", year: "2020" },
    referenceDate2026,
    null
  ),
  "20_i is not a valid calendar date (entered 30/02/2020).",
  "30 February is not a real calendar date"
);
assert.equal(
  calculateWqPregnancyBirthDateMessage(
    { day: "01", month: "01", year: "2030" },
    referenceDate2026,
    null
  ),
  "20_i cannot be after the interview date (entered 01/01/2030).",
  "A date after the reference date must be flagged"
);
assert.equal(
  calculateWqPregnancyBirthDateMessage(
    { day: "01", month: "01", year: "1995" },
    referenceDate2026,
    1999
  ),
  "20_i year cannot be before the mother's own birth year 1999 (entered 01/01/1995).",
  "A pregnancy dated before the mother's own birth year must be flagged"
);
assert.equal(
  calculateWqPregnancyBirthDateMessage(
    { day: "12", month: "03", year: "2019" },
    referenceDate2026,
    1999
  ),
  null,
  "A valid, past, post-maternal-birth date is consistent"
);
assert.equal(
  calculateWqPregnancyBirthDateMessage({ day: "12", month: "03", year: "" }, referenceDate2026, null),
  null,
  "An incomplete Q20_i must skip the check"
);

// --- calculateWqChildAgeAtLastBirthdayMessage / Q25_i ----------------------

const wqBirthDate20190312 = { day: "12", month: "03", year: "2019" };

assert.equal(
  calculateWqChildAgeAtLastBirthdayMessage(wqBirthDate20190312, "05", referenceDate2026),
  "Born 12/03/2019, so age at last birthday should be 7 (entered 5).",
  "An off-by-two Q25_i must be flagged with the documented message"
);
assert.equal(
  calculateWqChildAgeAtLastBirthdayMessage(wqBirthDate20190312, "07", referenceDate2026),
  null,
  "The correct completed age must not be flagged"
);
assert.equal(
  calculateWqChildAgeAtLastBirthdayMessage(wqBirthDate20190312, "", referenceDate2026),
  null,
  "An empty Q25_i must skip the check"
);
assert.equal(
  calculateWqChildAgeAtLastBirthdayMessage({ day: "12", month: "03", year: "" }, "07", referenceDate2026),
  null,
  "An incomplete Q20_i must skip the Q25_i check"
);

// --- calculateWqDeathAgeMessage / Q28_i -------------------------------------

assert.equal(
  calculateWqDeathAgeMessage(
    { days: "10", months: "02", years: "" },
    wqBirthDate20190312,
    referenceDate2026
  ),
  "28_i must record only one of days, months, or years (entered days, months).",
  "Filling more than one unit must be flagged"
);
assert.equal(
  calculateWqDeathAgeMessage({ days: "", months: "30", years: "" }, wqBirthDate20190312, referenceDate2026),
  "28_i months must be 1 to 23 for a death under 2 years old (entered 30).",
  "Months outside 1-23 must be flagged"
);
assert.equal(
  calculateWqDeathAgeMessage({ days: "", months: "", years: "01" }, wqBirthDate20190312, referenceDate2026),
  "28_i years must be 2 or more for a death 2 years or older (entered 1).",
  "Years below 2 must be flagged"
);
assert.equal(
  calculateWqDeathAgeMessage({ days: "", months: "", years: "10" }, wqBirthDate20190312, referenceDate2026),
  "28_i age at death (about 3653 days) cannot exceed 2712 days since birth (20_i).",
  "A death age longer than the time since birth must be flagged"
);
assert.equal(
  calculateWqDeathAgeMessage({ days: "", months: "", years: "05" }, wqBirthDate20190312, referenceDate2026),
  null,
  "A death age within the time since birth is consistent"
);
assert.equal(
  calculateWqDeathAgeMessage({ days: "", months: "", years: "" }, wqBirthDate20190312, referenceDate2026),
  null,
  "An unanswered Q28_i must skip the check"
);
assert.equal(
  calculateWqDeathAgeMessage(
    { days: "", months: "", years: "05" },
    { day: "12", month: "03", year: "" },
    referenceDate2026
  ),
  null,
  "An incomplete Q20_i must skip the Q28_i check"
);

// --- live model: Q20_i/Q25_i/Q28_i wired through the dynamic panels -------

const datesModel = createReproductionHistoryModel();
attachWqValidation(datesModel);
datesModel.setValue(WQ_BIRTH_MONTH_YEAR_FIELD, { month: "06", year: "1990" });
const datesHistoryPanel = addPregnancyHistoryPanel(datesModel);
panelQuestion(datesHistoryPanel, WQ_PREGNANCY_BIRTH_RESULT_FIELD).value = 1;
panelQuestion(datesHistoryPanel, WQ_PREGNANCY_DURATION_FIELD).value = { weeks: "39" };
panelQuestion(datesHistoryPanel, WQ_PREGNANCY_BIRTH_DATE_FIELD).value = {
  day: "12",
  month: "03",
  year: "2019",
};
applyWqPregnancyHistoryCalculations(datesModel);

const datesFollowupQuestion = question(datesModel, "wq_born_alive_child_followups");
assert.equal(datesFollowupQuestion.panels.length, 1, "The born-alive child must open a follow-up row");
// The follow-up loop rebuilds its rows (and their underlying Question
// instances) whenever a change makes the row's data differ, so the current
// panel must be re-resolved after every applyWqPregnancyHistoryCalculations
// call rather than reusing a cached panel reference.
function currentDatesFollowupPanel() {
  return datesFollowupQuestion.panels[0];
}
assert.equal(
  panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_ROW_ID_FIELD).value,
  panelQuestion(datesHistoryPanel, WQ_PREGNANCY_ROW_ID_FIELD).value,
  "The follow-up row must link back to its pregnancy row"
);

panelQuestion(currentDatesFollowupPanel(), "pregnancy_02_reproduction_is_name_still_alive").value = 1;
panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_CHILD_AGE_FIELD).value = "05";
applyWqPregnancyHistoryCalculations(datesModel);
assert.ok(
  questionHasErrorText(
    panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_CHILD_AGE_FIELD),
    "so age at last birthday should be 7 (entered 5)"
  ),
  "Q25_i must show the inline mismatch against Q20_i"
);
assert.equal(
  datesModel.validate(),
  false,
  "The model must fail validation while Q25_i contradicts Q20_i"
);

panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_CHILD_AGE_FIELD).value = "07";
applyWqPregnancyHistoryCalculations(datesModel);
assert.equal(
  panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_CHILD_AGE_FIELD).errors.length,
  0,
  "Correcting Q25_i must clear the message"
);

panelQuestion(currentDatesFollowupPanel(), "pregnancy_02_reproduction_is_name_still_alive").value = 2;
panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_DEATH_AGE_FIELD).value = { years: "10" };
applyWqPregnancyHistoryCalculations(datesModel);
assert.ok(
  questionHasErrorText(
    panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_DEATH_AGE_FIELD),
    "cannot exceed"
  ),
  "Q28_i must flag a death age longer than the time since Q20_i"
);
assert.equal(
  datesModel.validate(),
  false,
  "The model must fail validation while Q28_i exceeds the time since Q20_i"
);

panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_DEATH_AGE_FIELD).value = { years: "05" };
applyWqPregnancyHistoryCalculations(datesModel);
assert.equal(
  panelQuestion(currentDatesFollowupPanel(), WQ_PREGNANCY_DEATH_AGE_FIELD).errors.length,
  0,
  "Correcting Q28_i must clear the message"
);

assert.equal(shouldRecalculateWqPregnancyHistory(WQ_PREGNANCY_DEATH_AGE_FIELD), true);

console.log("Validated WQ interviewer-consistency checks.");
