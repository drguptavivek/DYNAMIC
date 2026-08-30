/** Verifies the Excel-derived Pregnancy Surveillance form and stop conditions. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);
const { getNativeRendererKind } = await import("../components/forms/nativeSurveyModel.js");
const { applyPregnancySurveillanceCalculations, calculatePsfTrackingDisposition } =
  await import("../lib/pregnancySurveillanceBehaviors.js");
const { buildPsfPrefill } = await import("../lib/prefillMapper.js");

const root = path.dirname(fileURLToPath(import.meta.url));
const formPath = path.resolve(root, "../data/forms/pregnancy_surveillance_form_v2026.07.19.json");
const form = JSON.parse(fs.readFileSync(formPath, "utf8"));
const model = new Model(prepareQuestionnaireSurveyJson(form));

assert.equal(form.form_code, "PSF");
assert.equal(form.version, "28 JUNE 2026");
const elementNames = form.pages[0].elements.map((element) => element.name);
assert.ok(elementNames.indexOf("psf_sterilization_status") < elementNames.indexOf("psf_sterilization_reconfirmation"));
assert.ok(elementNames.indexOf("psf_sterilization_reconfirmation") < elementNames.indexOf("psf_hysterectomy_status"));
assert.deepEqual(
  form.pages[0].elements
    .filter((element) => /^\d+(?:_address)?$/.test(String(element.sourceCode)))
    .map((element) => element.sourceCode),
  ["1", "2", "3", "4", "5", "6", "7", "8", "8_address", "9", "10", "11", "12", "13"],
);
assert.equal(getNativeRendererKind(model.getQuestionByName("psf_last_menstrual_period")), "wq-lmp-timing");

model.setValue("psf_same_address_status", 2);
assert.equal(model.getQuestionByName("psf_new_address").isVisible, true);
model.setValue("psf_same_address_status", 3);
assert.equal(model.getQuestionByName("psf_new_address").isVisible, false);
assert.equal(model.getQuestionByName("psf_current_marital_status").isVisible, false);
assert.deepEqual(calculatePsfTrackingDisposition(model.data), {
  disposition: "stopped",
  stopReason: "shifted_outside_study_area",
});

model.clear();
model.setValue("psf_same_address_status", 1);
model.setValue("psf_current_marital_status", 3);
assert.equal(model.getQuestionByName("psf_sterilization_status").isVisible, false);
assert.equal(calculatePsfTrackingDisposition(model.data).stopReason, "marital_status");

model.clear();
model.setValue("psf_same_address_status", 1);
model.setValue("psf_current_marital_status", 1);
model.setValue("psf_sterilization_status", 2);
assert.equal(model.getQuestionByName("psf_hysterectomy_status").isVisible, false);
assert.equal(calculatePsfTrackingDisposition(model.data).stopReason, "sterilized");

model.clear();
model.setValue("psf_same_address_status", 1);
model.setValue("psf_current_marital_status", 1);
model.setValue("psf_sterilization_status", 4);
assert.equal(model.getQuestionByName("psf_sterilization_reconfirmation").isVisible, true);
assert.equal(model.getQuestionByName("psf_hysterectomy_status").isVisible, false);
model.setValue("psf_sterilization_reconfirmation", 1);
assert.equal(model.getQuestionByName("psf_hysterectomy_status").isVisible, true);

model.clear();
model.setValue("psf_same_address_status", 1);
model.setValue("psf_current_marital_status", 1);
model.setValue("psf_sterilization_status", 4);
model.setValue("psf_hysterectomy_status", 1);
assert.equal(model.getQuestionByName("psf_pregnant_now").isVisible, false);
assert.equal(model.getQuestionByName("psf_last_menstrual_period").isVisible, false);
assert.equal(calculatePsfTrackingDisposition(model.data).stopReason, "hysterectomy");

model.setValue("psf_hysterectomy_status", 2);
model.setValue("psf_pregnant_now", 1);
model.setValue("psf_last_menstrual_period", { mode: "relative", unit: "weeks", value: "04" });
applyPregnancySurveillanceCalculations(model);
assert.equal(model.getValue("psf_tracking_disposition"), "active");
assert.equal(model.getValue("psf_pregnancy_detected"), 1);

model.setValue("psf_last_menstrual_period", 994);
applyPregnancySurveillanceCalculations(model);
assert.equal(model.getValue("psf_tracking_disposition"), "stopped");
assert.equal(model.getValue("psf_stop_reason"), "menopause");

const { prefill, readOnlyFields } = buildPsfPrefill(
  { line_number: 7, individual_id: "woman-7", member_name: "Test Woman", husband_name: "Test Husband" },
  { household_id: "household-1", address: "Test address" },
  new Date("2026-08-30T10:00:00Z"),
);
assert.equal(prefill.psf_woman_line_number, "07");
assert.equal(prefill.psf_interview_date, "2026-08-30");
assert.equal(prefill.psf_current_address, "Test address");
assert.ok(readOnlyFields.includes("psf_woman_id"));

console.log("Pregnancy Surveillance Excel conversion and skip-logic tests passed.");
