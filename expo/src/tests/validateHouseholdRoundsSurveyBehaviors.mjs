import assert from "node:assert/strict";
import { Model } from "survey-core";
import hrfForm from "../data/forms/household_rounds_form_v2026.05.14.json" with { type: "json" };
import {
  HRF_HOUSEHOLD_HEAD_ID_FIELD,
  HRF_NEW_WOMEN_PANEL,
  HRF_NEW_WOMAN_ELIGIBLE_FIELD,
  HRF_NEW_WOMAN_LINE_NUMBER_FIELD,
  applyHrfHouseholdContext,
  applyHrfNewWomanEligibilityCalculations,
  attachHouseholdRoundsSurveyBehaviors,
  calculateHrfPregnancyTrackingEligibilityValue,
  shouldRecalculateHrfNewWomanEligibility,
} from "../lib/householdRoundsSurveyBehaviors.js";
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";

assert.equal(
  calculateHrfPregnancyTrackingEligibilityValue({
    hrf_new_woman_age_years: "18",
    hrf_new_woman_current_marital_status: 1,
  }),
  1,
);
assert.equal(
  calculateHrfPregnancyTrackingEligibilityValue({
    hrf_new_woman_age_years: "44",
    hrf_new_woman_current_marital_status: 8,
  }),
  1,
);
assert.equal(
  calculateHrfPregnancyTrackingEligibilityValue({
    hrf_new_woman_age_years: "45",
    hrf_new_woman_current_marital_status: 1,
  }),
  2,
);
assert.equal(
  calculateHrfPregnancyTrackingEligibilityValue({
    hrf_new_woman_age_years: "30",
    hrf_new_woman_current_marital_status: 7,
  }),
  2,
);

assert.equal(shouldRecalculateHrfNewWomanEligibility(HRF_NEW_WOMEN_PANEL), true);
assert.equal(shouldRecalculateHrfNewWomanEligibility("hrf_new_woman_age_years"), true);
assert.equal(shouldRecalculateHrfNewWomanEligibility("hrf_new_woman_name"), false);

const model = new Model(prepareQuestionnaireSurveyJson(hrfForm));
model.setValue(HRF_NEW_WOMEN_PANEL, [
  {
    hrf_new_woman_age_years: "30",
    hrf_new_woman_current_marital_status: 1,
  },
  {
    hrf_new_woman_age_years: "30",
    hrf_new_woman_current_marital_status: 7,
  },
]);

attachHouseholdRoundsSurveyBehaviors(model, hrfForm);
applyHrfHouseholdContext(model, [
  {
    individual_id: "2-02-0003-01-01",
    line_number: 1,
    relationship_to_head: 1,
  },
  {
    individual_id: "2-02-0003-01-02",
    line_number: 2,
    relationship_to_head: 2,
  },
]);
applyHrfNewWomanEligibilityCalculations(model);

assert.equal(model.getValue(HRF_HOUSEHOLD_HEAD_ID_FIELD), "2-02-0003-01-01");
assert.deepEqual(
  model.getValue(HRF_NEW_WOMEN_PANEL).map((member) => member[HRF_NEW_WOMAN_LINE_NUMBER_FIELD]),
  ["03", "04"],
);
assert.deepEqual(
  model.getValue(HRF_NEW_WOMEN_PANEL).map((member) => member[HRF_NEW_WOMAN_ELIGIBLE_FIELD]),
  [1, 2],
);

model.setValue(HRF_NEW_WOMEN_PANEL, [
  {
    hrf_new_woman_age_years: "17",
    hrf_new_woman_current_marital_status: 1,
  },
]);
applyHrfNewWomanEligibilityCalculations(model);

assert.deepEqual(
  model.getValue(HRF_NEW_WOMEN_PANEL).map((member) => member[HRF_NEW_WOMAN_ELIGIBLE_FIELD]),
  [2],
);

console.log("Household rounds survey behavior checks passed");
