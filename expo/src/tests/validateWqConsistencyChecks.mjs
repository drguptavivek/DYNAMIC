/** Verifies interviewer-consistency checks on the Baseline Woman's Questionnaire. */
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
  WQ_BIRTH_MONTH_YEAR_FIELD,
  WQ_INTERVIEW_DATE_FIELD,
  applyWqAgeConsistencyCheck,
  attachWqValidation,
  calculateWqAgeConsistencyMessage,
  calculateWqAgesFromBirthDate,
  shouldRecalculateWqAgeConsistency,
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

assert.equal(shouldRecalculateWqAgeConsistency(WQ_BIRTH_MONTH_YEAR_FIELD), true);
assert.equal(shouldRecalculateWqAgeConsistency(WQ_AGE_FIELD), true);
assert.equal(shouldRecalculateWqAgeConsistency(WQ_INTERVIEW_DATE_FIELD), true);
assert.equal(shouldRecalculateWqAgeConsistency("wq_visit_no"), false);

console.log("Validated WQ interviewer-consistency checks.");
