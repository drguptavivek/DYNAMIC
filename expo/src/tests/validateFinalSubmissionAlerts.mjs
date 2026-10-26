import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { getPreparedSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { NATIVE_FORM_POPUP_TEXT, FINAL_SUBMISSION_POPUP_TRANSLATIONS } from "../lib/nativeFormPopupText.js";
import { showFormAlert, translateFormPopupText } from "../lib/nativeFormPopups.js";
import formTranslation from "../../../shared/formTranslation.cjs";

import {
  FINAL_SUBMISSION_CONFIRMATION_MESSAGE,
  requestFinalSubmissionConfirmation,
  waitForSubmissionAcknowledgement,
} from "../modules/households/finalSubmissionAlerts.js";

const alerts = [];
let submitCount = 0;
const showAlert = (title, message, buttons, options) => {
  alerts.push({ title, message, buttons, options });
};

requestFinalSubmissionConfirmation({
  showAlert,
  onConfirm: () => {
    submitCount += 1;
  },
});

assert.equal(alerts[0].message, FINAL_SUBMISSION_CONFIRMATION_MESSAGE);
assert.deepEqual(alerts[0].buttons.map((button) => button.text), ["No", "Yes"]);
assert.equal(submitCount, 0, "opening the confirmation must not submit the form");

alerts[0].buttons[0].onPress?.();
assert.equal(submitCount, 0, "No must leave the form unsubmitted");

requestFinalSubmissionConfirmation({ showAlert, onConfirm: () => { submitCount += 1; } });
alerts[1].buttons[1].onPress();
alerts[1].buttons[1].onPress();
assert.equal(submitCount, 1, "Yes must invoke final submission once");

const acknowledgement = waitForSubmissionAcknowledgement(showAlert);
assert.equal(alerts[2].title, "Form is submitted");
assert.equal(alerts[2].options.cancelable, false);

let acknowledged = false;
acknowledgement.then(() => {
  acknowledged = true;
});
await Promise.resolve();
assert.equal(acknowledged, false, "completion must wait for the success acknowledgement");

alerts[2].buttons[0].onPress();
await acknowledgement;
assert.equal(acknowledged, true);

console.log("Final submission alert flow validation passed.");

const popupKeys = ["popup_final_submission", "popup_final_submission_confirmation", "popup_form_submitted", "popup_no", "popup_yes", "popup_ok"];
const catalog = JSON.parse(fs.readFileSync(new URL("../data/forms/index.json", import.meta.url), "utf8"));
for (const entry of catalog) {
  const raw = JSON.parse(fs.readFileSync(new URL(`../data/forms/${entry.file_name}`, import.meta.url), "utf8"));
  const prepared = getPreparedSurveyJson(raw);
  const rows = formTranslation.flattenFormText(prepared);
  for (const key of popupKeys) {
    assert(rows.some(row => row.name === `@native:${key}` && row.kind === "native"), `${entry.form_code}: ${key} available in admin app-message inventory`);
  }
  for (const locale of ["en", "hi", "kn", "mr", "ta", "te"]) {
    const translations = Object.fromEntries(popupKeys.map(key => [`@native:${key}`, { title: `${entry.form_code} ${locale} ${key}` }]));
    const translated = formTranslation.applyFormTextTranslations(prepared, locale, translations);
    const extracted = formTranslation.extractFormTextTranslations(translated, locale);
    const model = createSurveyModel(translated);
    model.locale = locale;
    for (const key of popupKeys) {
      assert.equal(extracted[`@native:${key}`].title, translations[`@native:${key}`].title, `${entry.form_code}: export/import round trip for ${locale}`);
      assert.equal(translateFormPopupText(model, NATIVE_FORM_POPUP_TEXT[entry.form_code][key]), translations[`@native:${key}`].title, `${entry.form_code}: saved ${locale} override reaches popup`);
    }
  }
}
for (const [locale, defaults] of Object.entries(FINAL_SUBMISSION_POPUP_TRANSLATIONS)) {
  for (const key of popupKeys) {
    assert.equal(translateFormPopupText({ locale }, NATIVE_FORM_POPUP_TEXT.WQ[key]), defaults[key], `${locale}: localized popup before any admin override exists`);
  }
}
assert.equal(translateFormPopupText({ locale: "hi" }, FINAL_SUBMISSION_CONFIRMATION_MESSAGE), FINAL_SUBMISSION_POPUP_TRANSLATIONS.hi.popup_final_submission_confirmation);

// Execute the real shared questionnaire host's finalization functions without a device or DB.
const dashboard = fs.readFileSync(new URL("../modules/questionnaires/QuestionnaireDashboard.js", import.meta.url), "utf8");
const requestSource = dashboard.slice(dashboard.indexOf("  function requestCompleteFromModel("), dashboard.indexOf("  function markDirty("));
const completionSource = dashboard.slice(dashboard.indexOf("    let submissionStarted = false;"), dashboard.indexOf("    endOpen({ questions:"));
function host({ failSave = false, special = false } = {}) {
  const log = { alerts: [], navigations: [], saves: 0, draftSubmitted: 0, previewOpened: 0, invalidFocused: 0 };
  const model = {
    locale: "hi", data: { answer: 1 }, isCompleted: false, valid: true,
    get state() { return this.isCompleted ? "completed" : "running"; },
    clear(clearData, goToFirstPage) { assert.equal(clearData, false); assert.equal(goToFirstPage, false); this.isCompleted = false; },
    validate() { return this.valid; }, getQuestionByName() { return null; },
    onComplete: { add(callback) { model.complete = callback; } },
    doComplete() { this.isCompleted = true; log.completing = this.complete(this); },
  };
  const context = {
    model, getDataSignature: JSON.stringify,
    hasPreviewedRef: { current: true }, previewSignatureRef: { current: JSON.stringify(model.data) },
    finalConfirmationPendingRef: { current: false },
    requestFinalSubmissionConfirmation, waitForSubmissionAcknowledgement,
    Alert: { alert: (...args) => log.alerts.push(args) },
    showFormAlert,
    form: { form_code: special ? "PSF" : "WQ", version: "1" },
    isWomanQuestionnaire: () => !special, hasIncompleteWqBornAliveChildFollowups: () => false,
    hasWqReproductionComparisonDeficit: () => false, WQ_REPRODUCTION_COMPARISON_FIELD: "comparison",
    findFirstNativeValidationQuestion: () => null,
    revealValidationError: () => { log.invalidFocused++; }, setSaveMessage: () => {},
    openPreviewFromModel: () => { log.previewOpened++; }, startTiming: () => () => {},
    saveQuestionnaireSubmission: async () => { log.saves++; if (failSave && log.saves === 1) throw new Error("disk unavailable"); return { submission_id: "response-1" }; },
    taskContext: null, correctionContext: null, user: {}, draftIdRef: { current: "draft-1" },
    markQuestionnaireDraftSubmitted: async () => { log.draftSubmitted++; }, onDraftSaved: () => {},
    isPregnancySurveillanceForm: () => special, shouldShowPffOutcomeReminder: () => false,
    isWqRevisitStop: () => false, navigateTo: (...args) => log.navigations.push(args),
    ROUTES: { completedForms: "/completed" },
  };
  vm.createContext(context);
  vm.runInContext(`${requestSource}\n${completionSource}\nthis.request = requestCompleteFromModel;`, context);
  return { context, model, log };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const main = host();
main.context.request(main.model);
assert.equal(main.log.saves, 0);
assert.equal(main.log.alerts[0][1], FINAL_SUBMISSION_POPUP_TRANSLATIONS.hi.popup_final_submission_confirmation);
main.context.request(main.model);
assert.equal(main.log.alerts.length, 1, "double tap must not open a second pending confirmation");
main.log.alerts[0][2][0].onPress();
assert.equal(main.log.saves, 0, "cancel must never create finalized evidence");
main.context.request(main.model);
main.log.alerts[1][2][1].onPress();
main.log.alerts[1][2][1].onPress();
await nextTurn();
assert.equal(main.log.saves, 1);
assert.equal(main.log.draftSubmitted, 1);
assert.equal(main.log.alerts[2][0], FINAL_SUBMISSION_POPUP_TRANSLATIONS.hi.popup_form_submitted);
assert.equal(main.log.navigations.length, 0, "saved form stays mounted until success acknowledgement");
main.log.alerts[2][2][0].onPress();
await main.log.completing;
assert.equal(main.log.navigations[0][0], "/completed");
main.context.request(main.model);
assert.equal(main.log.saves, 1, "a completed form cannot be resubmitted by tapping again");

const invalid = host(); invalid.model.valid = false;
invalid.context.request(invalid.model);
assert.equal(invalid.log.invalidFocused, 1);
assert.equal(invalid.log.alerts.length, 0);
assert.equal(invalid.log.saves, 0);
const changed = host(); changed.model.data.answer = 2;
changed.context.request(changed.model);
assert.equal(changed.log.previewOpened, 1);
assert.equal(changed.log.alerts.length, 0, "changed answers require a new preview before confirmation");
const revalidate = host(); revalidate.context.request(revalidate.model); revalidate.model.valid = false;
revalidate.log.alerts[0][2][1].onPress();
assert.equal(revalidate.log.invalidFocused, 1);
assert.equal(revalidate.log.saves, 0, "confirmation must revalidate current answers");
const failed = host({ failSave: true });
failed.context.request(failed.model); failed.log.alerts[0][2][1].onPress();
await failed.log.completing;
assert.equal(failed.log.draftSubmitted, 0);
assert.equal(failed.log.navigations.length, 0);
assert.equal(failed.log.alerts.length, 2);
assert.equal(failed.log.alerts[1][0], "Unable to save form", "save failure cannot show a success acknowledgement");
assert.equal(failed.model.state, "running");
assert.equal(failed.model.data.answer, 1, "failed save keeps answers");
failed.context.request(failed.model); failed.log.alerts[2][2][1].onPress(); await nextTurn();
assert.equal(failed.log.saves, 2, "failed write permits a successful retry");
assert.equal(failed.log.alerts[3][0], FINAL_SUBMISSION_POPUP_TRANSLATIONS.hi.popup_form_submitted);
failed.log.alerts[3][2][0].onPress(); await failed.log.completing;
assert.equal(failed.log.navigations[0][0], "/completed");
const real = createSurveyModel({ elements: [{ name: "answer", type: "text" }] });
real.setValue("answer", "retained"); real.doComplete(); real.clear(false, false);
assert.equal(real.state, "running"); assert.equal(real.getValue("answer"), "retained");
const stopped = host({ special: true }); stopped.model.data.psf_tracking_disposition = "stopped";
stopped.context.previewSignatureRef.current = JSON.stringify(stopped.model.data);
stopped.context.request(stopped.model); stopped.log.alerts[0][2][1].onPress(); await nextTurn();
stopped.log.alerts[1][2][0].onPress(); await stopped.log.completing;
assert.equal(stopped.log.alerts[2][0], "Thank you. This woman has exited from the study.", "form-specific outcome notice remains after generic success acknowledgement");
assert.equal(stopped.log.navigations.length, 0);
stopped.log.alerts[2][2][0].onPress();
assert.equal(stopped.log.navigations[0][0], "/completed");
console.log("All 12 forms expose per-language popup editing/export/import; shared host preserves validation, preview, confirmation, single save and success acknowledgement.");
