import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { NATIVE_FORM_TEXT } from "../lib/nativeFormText.js";
import { getPanelCommitLabel } from "../components/forms/nativeSurveyModel.js";
import { formatNativeFormText, getNativeFormText } from "../lib/nativeFormText.js";
import { NATIVE_ANC_IMAGE_FORM_TEXT, NATIVE_IMAGE_FORM_TEXT } from "../lib/nativeFormTextExtra.js";
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
// Shared renderer files do not make their form-specific branches applicable everywhere.
const formCodes = Object.keys(NATIVE_FORM_TEXT);
const scopedNativeKeys = {
  pregnancy_entry: ["WQ"], pregnancy_lasts: ["WQ"], born_status: ["WQ"],
  s_no: ["WQ"], name_of_child: ["WQ"], sex: ["WQ"],
  close_pregnancy_entry: ["WQ"], add_pregnancy_outcome: ["WQ"],
  lookup: ["HHQ"], find_hdss_person: ["HHQ"],
  replace_linked_hdss_person: ["HHQ"], unlink_hdss_person: ["HHQ"],
  capture_gps: ["HHQ"], household_characteristics_intro: ["HHQ"],
  camera: ["PEF", "PFF"], gallery: ["PEF", "PFF"], retake: ["PEF", "PFF"],
  how_many_reports_do_you_have: ["PEF", "PFF"], choose_file: ["UF"],
  popup_partner_mobile_confirmation: ["WQ"],
  popup_history_totals_title: ["WQ"], popup_correction_period_ended: ["WQ"],
  popup_final_submission: ["HHQ"], popup_form_submitted: ["HHQ"],
  popup_answer_fields_saved: ["HHQ"], popup_household_excluded: ["HHQ"],
  popup_database_search_title: ["PEF"], popup_fill_pof: ["PFF"],
  popup_pef_generated: ["PSF"], popup_woman_exited: ["PSF"],
  popup_unable_to_save: formCodes.filter(code => code !== "HHQ"),
};
for (const key of ["add_entry", "update_entry", "entry_entrynumber", "add_row", "panel_entry_count", "new_entry", "edit_entry_entrynumber", "close_entry_editor", "preview_row"]) {
  scopedNativeKeys[key] = ["HHQ", "WQ", "HRF"];
}
scopedNativeKeys.not_calculated_yet = ["HHQ", "WQ", "HRF"];
for (const key of ["age_unavailable", "age_years", "status_unavailable", "hdss_id_unavailable", "unnamed_person", "count_shown", "select_hdss_person_name", "hdss_record_linked", "could_not_search_hdss_registry"]) {
  scopedNativeKeys[key] = ["HHQ"];
}
for (const key of Object.keys(NATIVE_IMAGE_FORM_TEXT)) scopedNativeKeys[key] = ["PEF", "PFF"];
for (const key of Object.keys(NATIVE_ANC_IMAGE_FORM_TEXT)) scopedNativeKeys[key] = ["PEF", "PFF"];
for (const [key, expectedCodes] of Object.entries(scopedNativeKeys)) {
  assert.deepEqual(formCodes.filter(code => key in NATIVE_FORM_TEXT[code]).sort(), [...expectedCodes].sort(), `${key} must be offered only in questionnaires that render it`);
  for (const code of expectedCodes) {
    const english = NATIVE_FORM_TEXT[code][key];
    const model = { locale: "hi", nativeText: { [key]: { default: english, hi: `translated ${english}` } } };
    assert.equal(getNativeFormText(model, key, english), `translated ${english}`, `${code}: scoped key still uses its saved translation`);
  }
}
for (const code of ["HHQ", "WQ", "HRF"]) {
  const model = { locale: "hi", nativeText: { update_entry: { hi: `${code} translated update` }, add_entry: { hi: `${code} translated add` } } };
  assert.equal(getPanelCommitLabel({ survey: model }, {}, "edit", false), `${code} translated update`);
  assert.equal(getPanelCommitLabel({ survey: model }, {}, "add", false), `${code} translated add`);
}
console.log("All 12 native translation inventories retain relevant controls and exclude other forms' branches.");
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

// Lookup fallbacks translate while imported identity data stays unchanged.
const lookupSource = fs.readFileSync(new URL("../components/forms/renderers/BhqRegistryLookupDrawer.js", import.meta.url), "utf8");
const lookupContext = { getNativeFormText, formatNativeFormText, buildRegistryFacingId: () => "" };
vm.createContext(lookupContext);
vm.runInContext(lookupSource.slice(lookupSource.indexOf("function formatAge("), lookupSource.indexOf("export function BhqRegistryLookupDrawer")), lookupContext);
const lookupModel = { locale: "hi", nativeText: {
  age_unavailable: { hi: "translated missing age" }, age_years: { hi: "age {age}" },
  status_unavailable: { hi: "translated missing status" }, hdss_id_unavailable: { hi: "translated missing ID" },
  count_shown: { hi: "shown {count}" }, select_hdss_person_name: { hi: "select {name}" },
} };
assert.equal(lookupContext.formatAge({}, lookupModel), "translated missing age");
assert.equal(lookupContext.formatAge({ age_years: 42 }, lookupModel), "age 42");
assert.equal(lookupContext.getPersonStatus({}, lookupModel), "translated missing status");
assert.equal(lookupContext.getPersonStatus({ domicile: "Resident" }, lookupModel), "Resident");
assert.equal(lookupContext.personFacingId({}, lookupModel), "translated missing ID");
assert.equal(lookupContext.personFacingId({ original_id: "10-0011-01-01" }, lookupModel), "10-0011-01-01");
assert.equal(formatNativeFormText(lookupModel, "count_shown", "{count} shown", { count: 10 }), "shown 10");
assert.equal(formatNativeFormText(lookupModel, "select_hdss_person_name", "Select HDSS person {name}", { name: "Asha" }), "select Asha");
for (const renderer of ["PefAncCardImageRenderer", "PefUltrasoundReportsRenderer"]) {
  const source = fs.readFileSync(new URL(`../components/forms/renderers/${renderer}.js`, import.meta.url), "utf8");
  assert.match(source, /getNativeFormText\(question.survey, "camera_permission_required"/);
  assert.match(source, /getNativeFormText\(question.survey, "gallery_permission_required"/);
  assert.match(source, /storageError\?\.message \|\|/);
  assert.doesNotMatch(source, /\} permission is required/);
}
console.log("Calculated, lookup and image-control labels retain translations, scope and imported data.");
