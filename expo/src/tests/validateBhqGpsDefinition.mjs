import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import formTranslation from "../../../shared/formTranslation.cjs";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { prepareQuestionnaireSurveyJson, normalizeQuestionnaireSurveyData } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { getNativeRendererKind, assertNativeSurveySupport, getVisiblePageQuestions } from "../components/forms/nativeSurveyModel.js";

const raw = JSON.parse(await readFile(new URL("../data/forms/baseline_household_questionnaire_v2026.05.09.json", import.meta.url)));
const original = JSON.stringify(raw);
const prepared = prepareQuestionnaireSurveyJson(raw);
const consent = "hhq_consent_study_provide_pis_explain_study_adult_member";
const latitude = "hhq_gps_latitude";
const gps = {
  hhq_gps_latitude: 28.34,
  hhq_gps_longitude: 77.31,
};
function elements(nodes) {
  return nodes.flatMap(node => [node, ...elements(node.elements || [])]);
}
const definitions = prepared.pages.flatMap(page => elements(page.elements));
assert.equal(definitions[definitions.findIndex(node => node.name === consent) + 1].name, latitude);
const primary = definitions.find(node => node.name === latitude);
for (const text of [primary.description, primary.requiredErrorText, ...primary.validators.map(validator => validator.text)]) {
  assert.doesNotMatch(text, /accuracy|25/i, "GPS accuracy is an internal check, not questionnaire text");
}
assert.equal(JSON.stringify(raw), original, "Preparing GPS must not mutate the raw questionnaire");
assert.deepEqual(prepareQuestionnaireSurveyJson(raw), prepared, "Preparation remains deterministic");
const inventory = formTranslation.flattenFormText(prepared);
for (const field of [latitude, 'hhq_gps_longitude']) assert.ok(inventory.some(row => row.name === field && row.title), `${field} must be translatable/exportable`);
for (const field of ['hhq_gps_accuracy_m', 'hhq_gps_captured_at']) {
  assert.equal(definitions.find(node => node.name === field), undefined);
  assert.ok(!inventory.some(row => row.name === field), `${field} stays internal, outside translation/codebook inventory`);
}
assert.equal(inventory.find(row => row.name === latitude).description, primary.description);
for (const message of [primary.requiredErrorText, primary.validators[0].text, prepared.nativeText.gps_capture_failed, prepared.nativeText.gps_capture_cancelled]) {
  assert.ok(message && inventory.some(row => row.title === message), 'User-facing GPS messages remain translatable');
}
const translated = formTranslation.applyFormTextTranslations(prepared, 'hi', {
  [latitude]: { title: 'Latitude Hindi', description: 'GPS help Hindi' },
  hhq_gps_longitude: { title: 'Longitude Hindi' },
  hhq_gps_accuracy_m: { title: 'Must not apply' },
  hhq_gps_captured_at: { title: 'Must not apply' },
});
const translatedDefinitions = translated.pages.flatMap(page => elements(page.elements));
assert.equal(translatedDefinitions.find(node => node.name === latitude).title.hi, 'Latitude Hindi');
assert.equal(translatedDefinitions.find(node => node.name === latitude).description.hi, 'GPS help Hindi');
assert.equal(translatedDefinitions.find(node => node.name === 'hhq_gps_longitude').title.hi, 'Longitude Hindi');
for (const field of ['hhq_gps_accuracy_m', 'hhq_gps_captured_at']) {
  assert.equal(translatedDefinitions.find(node => node.name === field), undefined);
}

const model = createSurveyModel(prepared);
const question = model.getQuestionByName(latitude);
assert.equal(getNativeRendererKind(question), "gps");
assert.deepEqual(assertNativeSurveySupport(model), []);
assert.equal(question.isReadOnly, false, "Survey Core must enforce GPS validation");
assert.equal(question.isVisible, false);
model.setValue("hhq_interview_date", "2026-10-19");
model.setValue("hhq_competent_respondent_available", 1);
model.setValue(consent, 2);
assert.equal(question.isVisible, false);
assert.equal(question.validate(), true, "Consent refusal must not require GPS");
model.setValue(consent, 1);
assert.equal(question.isVisible, true);
assert.equal(question.validate(), false, "Consented interview requires capture");

function setGps(values) {
  for (const field of Object.keys(gps)) model.setValue(field, values[field]);
}
setGps(gps);
assert.equal(question.validate(), true, "Saved coordinates remain valid without capture metadata");
const visibleQuestions = model.pages.flatMap(page => getVisiblePageQuestions(page)).map(node => node.name);
assert.ok(visibleQuestions.includes(latitude));
for (const field of ['hhq_gps_accuracy_m', 'hhq_gps_captured_at']) {
  assert.ok(!visibleQuestions.includes(field), `${field} is never rendered as a questionnaire question`);
}
for (const [field, value] of [
  [latitude, undefined], [latitude, 90.1], [latitude, -90.1], [latitude, "invalid"],
  ["hhq_gps_longitude", undefined], ["hhq_gps_longitude", 180.1], ["hhq_gps_longitude", -180.1],
]) {
  setGps({ ...gps, [field]: value });
  assert.equal(question.validate(), false, `Reject incomplete/out-of-range ${field}: ${value}`);
}
setGps({ hhq_gps_latitude: 0, hhq_gps_longitude: 0 });
assert.equal(question.validate(), true, "Zero coordinates are valid, not missing");
const saved = JSON.parse(JSON.stringify(model.data));
const restored = createSurveyModel(prepared);
restored.data = normalizeQuestionnaireSurveyData(raw, saved);
for (const field of Object.keys(gps)) assert.equal(restored.getValue(field), saved[field], `Draft restore retains ${field}`);
assert.equal(restored.getQuestionByName(latitude).validate(), true);
restored.doComplete();
for (const field of Object.keys(gps)) assert.equal(restored.data[field], saved[field], `Completion retains ${field}`);
model.setValue("hhq_competent_respondent_available", 2);
assert.equal(question.isVisible, false);
assert.equal(question.validate(), true, "Unavailable respondent must not require GPS");
assert.ok(!('hhq_gps_accuracy_m' in restored.data) && !('hhq_gps_captured_at' in restored.data));
console.log("Validated BHQ GPS placement, consent visibility, coordinate validation, zero coordinates, coordinate-only draft/completion persistence, and translation/codebook inventory.");
