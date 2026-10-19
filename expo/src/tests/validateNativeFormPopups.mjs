import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { NATIVE_FORM_TEXT } from "../lib/nativeFormText.js";
import { getNativeFormText } from "../lib/nativeFormText.js";
import { showFormAlert, translateFormPopupText } from "../lib/nativeFormPopups.js";
import { requestFinalSubmissionConfirmation, waitForSubmissionAcknowledgement } from "../modules/households/finalSubmissionAlerts.js";

const survey = { locale: "hi", nativeText: {
  popup_final_submission: { hi: "अंतिम जमा" },
  popup_final_submission_confirmation: { hi: "जमा करें?" },
  popup_form_submitted: { hi: "जमा हो गया" },
  popup_no: { hi: "नहीं" }, popup_yes: { hi: "हाँ" }, popup_ok: { hi: "ठीक" },
  popup_answer_fields_saved: { hi: "{count} उत्तर सहेजे गए।" },
  clear_the_saved_q24_i_q28_i_details_for_name: { hi: "{name} का विवरण हटाएँ?" },
} };
assert.equal(translateFormPopupText(survey, "12 answer fields saved on this device."), "12 उत्तर सहेजे गए।");
assert.equal(translateFormPopupText(survey, "Clear the saved Q24_i-Q28_i details for Asha (2)?"), "Asha (2) का विवरण हटाएँ?");
assert.equal(translateFormPopupText(survey, "Unknown server error"), "Unknown server error");
assert.equal(translateFormPopupText({ locale: "en", nativeText: survey.nativeText }, "Yes"), "Yes");
assert.equal(translateFormPopupText(survey, "Are you sure you want to final submit this form?extra"), "Are you sure you want to final submit this form?extra");
let submitCount = 0;
const alerts = [];
const showAlert = (...args) => alerts.push(args);
requestFinalSubmissionConfirmation({ survey, showAlert, onConfirm: () => submitCount++ });
assert.deepEqual(alerts[0].slice(0, 2), ["अंतिम जमा", "जमा करें?"]);
assert.deepEqual(alerts[0][2].map((b) => b.text), ["नहीं", "हाँ"]);
assert.equal(alerts[0][2][0].style, "cancel");
assert.equal(submitCount, 0);
alerts[0][2][0].onPress?.(); assert.equal(submitCount, 0);
alerts[0][2][1].onPress(); assert.equal(submitCount, 1);
let acknowledged = false;
const promise = waitForSubmissionAcknowledgement(showAlert, survey).then(() => { acknowledged = true; });
await Promise.resolve(); assert.equal(acknowledged, false);
assert.equal(alerts[1][0], "जमा हो गया");
assert.equal(alerts[1][3].cancelable, false);
alerts[1][2][0].onPress(); await promise; assert.equal(acknowledged, true);
const callback = () => {};
const options = { cancelable: false, onDismiss: callback };
showFormAlert(survey, showAlert, "Yes", "", [{ text: "No", onPress: callback, style: "destructive" }], options);
assert.equal(alerts[2][2][0].onPress, callback);
assert.equal(alerts[2][2][0].style, "destructive");
assert.equal(alerts[2][3], options);
for (const code of ["HHQ", "WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "PSF"]) {
  assert.equal(NATIVE_FORM_TEXT[code].popup_draft_saved, "Form saved as draft.");
  assert.equal(NATIVE_FORM_TEXT[code].popup_ok, "OK");
}
for (const relative of ["../modules/households/BaselineHouseholdForm.js", "../modules/questionnaires/QuestionnaireDashboard.js", "../components/forms/renderers/TextRenderer.js", "../components/forms/renderers/NumberRenderer.js", "../components/forms/renderers/DynamicPanelRenderer.js"]) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  assert.match(source, /showFormAlert\(/);
  assert.doesNotMatch(source, /\bAlert\.alert\(/, `${relative} must translate only at alert delivery`);
}
console.log("Native form popup translations preserve dynamic values, callbacks, final-submit and acknowledgement gates.");

// Execute the actual host callback, including its local model argument and navigation closure.
const dashboard = fs.readFileSync(new URL("../modules/questionnaires/QuestionnaireDashboard.js", import.meta.url), "utf8");
const saveSource = dashboard.slice(dashboard.indexOf("async function saveDraftFromModel("), dashboard.indexOf("  async function openPreviewFromModel("));
const navigations = [];
const context = {
  draftContext: {}, formLocaleRef: { current: "hi" }, answerSnapshotRef: { current: {} },
  draftIdRef: { current: null }, dirtyRef: { current: true }, form: { form_code: "WQ" },
  correctionContext: null, activeLocale: "hi", onDraftSaved: () => {},
  setRendererAnswerData: () => {}, startTiming: () => () => {},
  saveQuestionnaireDraft: async () => ({ draft_id: "draft-1", updated_at: "now" }),
  setDraftId: () => {}, setLastSavedAt: () => {}, setDirty: () => {}, setSaveMessage: () => {},
  getNativeFormText, getDraftSavedMessage: () => "Built-in Hindi draft title",
  showFormAlert, Alert: { alert: showAlert }, navigateTo: (...args) => navigations.push(args),
  ROUTES: { completedForms: "/completed", worklist: "/worklist" },
};
vm.createContext(context);
vm.runInContext(`${saveSource}\nthis.saveDraft = saveDraftFromModel;`, context);
survey.nativeText.popup_draft_saved = { hi: "व्यवस्थापक का मसौदा संदेश" };
const saved = await context.saveDraft(survey, { manual: true });
assert.equal(saved.draft_id, "draft-1");
assert.equal(alerts.at(-1)[0], "व्यवस्थापक का मसौदा संदेश");
assert.equal(alerts.at(-1)[2][0].text, "ठीक");
assert.equal(navigations.length, 0);
alerts.at(-1)[2][0].onPress();
assert.equal(navigations[0][0], "/worklist");
showFormAlert(survey, showAlert, "Unknown message");
assert.equal(alerts.at(-1)[2][0].text, "ठीक", "the implicit native OK must also be translated");
console.log("Actual questionnaire manual draft popup uses its model, admin override and original acknowledgement navigation.");
