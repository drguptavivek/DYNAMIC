/** Exercises the actual HHQ component hooks with real Survey Core models and isolated draft state. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { performance } from "node:perf_hooks";
import { transformSync } from "@babel/core";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import * as masters from "../lib/householdMasterChoices.js";
import * as behavior from "../lib/householdSurveyBehaviors.js";
import * as transforms from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import * as taskPrefill from "../modules/households/hhqTaskPrefill.js";
import * as navigation from "../modules/questionnaires/surveyNavigation.js";
import * as memberSummary from "../modules/questionnaires/householdMemberSummary.js";
import * as nativeModel from "../components/forms/nativeSurveyModel.js";
import * as householdIds from "../modules/households/householdIds.js";
import * as nativeFormText from "../lib/nativeFormText.js";
import dwellingOutcome from "../../../shared/householdDwellingOutcome.cjs";

// Load the real prefill helpers without importing native task storage in Node.
const prefillContext = { exports: {}, require: (id) => id.endsWith("/householdGpsRepository.js") ? { getSavedHouseholdGps: () => null } : {} };
vm.runInNewContext(transformSync(fs.readFileSync(new URL("../lib/prefillMapper.js", import.meta.url), "utf8"), { babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"] }).code, prefillContext);
const prefill = prefillContext.exports;

const source = fs.readFileSync(new URL("../modules/households/BaselineHouseholdForm.js", import.meta.url), "utf8");
const form = JSON.parse(fs.readFileSync(new URL("../data/forms/baseline_household_questionnaire_v2026.05.09.json", import.meta.url), "utf8"));
const slots = [];
let cursor = 0;
const models = [];
const timings = [];
const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
    return [slots[index].value, (value) => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
  },
  useRef(current) { const index = cursor++; slots[index] ??= { current }; return slots[index]; },
  useMemo(create, deps) {
    const index = cursor++;
    if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: create(), deps };
    return slots[index].value;
  },
  useCallback(callback, deps) { return this.useMemo(callback, deps); },
  useEffect() { cursor++; },
};
react.useCallback = (callback, deps) => react.useMemo(() => callback, deps);
const imports = {
  react,
  "../../../../shared/householdDwellingOutcome.cjs": dwellingOutcome,
  "react-native": { useWindowDimensions: () => ({ width: 400 }), StyleSheet: { create: (styles) => styles }, View: "View", Text: "Text", ScrollView: "ScrollView", Pressable: "Pressable" },
  "../../components/forms/NativeSurveyRenderer.js": { NativeSurveyRenderer: "NativeSurveyRenderer" },
  "../../components/forms/nativeSurveyModel.js": nativeModel,
  "../../components/forms/renderers/DisplayRenderer.js": { DisplayRenderer: "DisplayRenderer" },
  "../questionnaires/surveyNavigation.js": navigation,
  "../questionnaires/householdMemberSummary.js": memberSummary,
  "./householdIds.js": householdIds,
  "../../lib/nativeFormText.js": nativeFormText,
  "../../lib/householdMasterChoices.js": masters,
  "../../lib/prefillMapper.js": prefill,
  "../../lib/householdSurveyBehaviors.js": behavior,
  "../questionnaires/questionnaireSurveyJsonTransforms.js": transforms,
  "./hhqTaskPrefill.js": taskPrefill,
  "../../lib/householdSync.js": { getHouseholdSync: () => null },
  "../../lib/perfLog.js": { startTiming: () => () => {} },
  "../../polyfills/surveyCoreNative.js": { createSurveyModel(json) {
    const start = performance.now();
    const model = createSurveyModel(json);
    timings.push(performance.now() - start);
    models.push(model);
    return model;
  } },
};
const context = { exports: {}, setTimeout, clearTimeout, require: (id) => imports[id] || {} };
vm.runInNewContext(transformSync(source, { babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-react-jsx", "@babel/plugin-transform-modules-commonjs"] }).code, context);
const props = { form, locale: "default", user: { user_id: "worker", site_id: 2, area_assignments: [{ site_id: 2, locality_code: "11" }] }, localities: [{ site_id: 2, locality_code: "11", locality_name: "Dayalpur" }], selectedLocalityCode: "11" };
const render = () => { cursor = 0; return context.exports.BaselineHouseholdForm(props); };
render();
assert.equal(models.length, 0, "initial unresolved draft must not construct a throwaway model");
const draftSlot = slots.find((slot) => slot?.value?.key === "" && slot.value.loading === true);
const key = slots.find((slot) => typeof slot?.value === "string" && slot.value.includes('"formCode":"HHQ"')).value;
draftSlot.value = { key, loading: true, draft: null };
render();
assert.equal(models.length, 0, "lookup start must not construct another throwaway model");
draftSlot.value = { key, loading: false, draft: null };
render();
assert.equal(models.length, 1, "fresh form constructs exactly one model after lookup");
assert.equal(models[0].getValue("hhq_locality_code"), "11");
render();
assert.equal(models.length, 1, "ordinary rerenders reuse the live model");
// Device settings/context refreshes must not restore the original draft over live answers.
const liveModel = models[0];
const consentField = "hhq_consent_study_provide_pis_explain_study_adult_member";
liveModel.setValue("hhq_competent_respondent_available", 1);
liveModel.setValue(consentField, 1);
liveModel.setValue("hhq_household_head_name", "Live household head");
liveModel.setValue("hhq_contact_mobile_numbers", [{ mobile_holder_name: "Live household head", mobile_number: "9876543210" }]);
liveModel.setValue("hhq_gps_longitude", 77.3);
liveModel.setValue("hhq_gps_latitude", 28.4);
function assertContextRefreshRetainsInterview(liveModel) {
  const count = models.length;
  const liveAnswers = JSON.stringify(liveModel.data);
  const livePage = liveModel.currentPage;
  const liveSnapshotRef = slots.find((slot) => slot?.current?.hhq_gps_latitude === 28.4);
  assert.ok(liveSnapshotRef, "Coordinate writes must reach the host's draft snapshot");
  const liveSnapshot = liveSnapshotRef.current;
  for (const refresh of [
    () => { props.user = structuredClone(props.user); },
    () => { props.localities = structuredClone(props.localities); },
    () => { props.taskContext = {}; },
    () => { props.form = structuredClone(props.form); },
  ]) {
    refresh(); render();
    assert.equal(models.length, count, "Same-interview context refresh must retain the live Survey Core model");
    assert.equal(models.at(-1), liveModel);
    assert.equal(liveModel.getValue(consentField), 1);
    assert.equal(liveModel.getQuestionByName("hhq_gps_latitude").isVisible, true);
    assert.equal(liveModel.getQuestionByName("hhq_contact_mobile_numbers").isVisible, true);
    assert.equal(JSON.stringify(liveModel.data), liveAnswers);
    assert.equal(liveModel.currentPage, livePage);
    assert.equal(liveSnapshotRef.current, liveSnapshot, "A context refresh must retain the unsaved draft snapshot");
  }
}
assertContextRefreshRetainsInterview(liveModel);
// Restore an available, consenting household draft; only that branch exposes the roster.
draftSlot.value = { key, loading: false, draft: { draft_id: "saved", json_payload: { hhq_competent_respondent_available: 1, hhq_consent_study_provide_pis_explain_study_adult_member: 1, hhq_household_head_name: "Saved head", hhq_household_members: [{ member_name: "Saved member", member_age_years: 30, member_sex: 2 }] } } };
render();
assert.equal(models.length, 2);
assert.equal(models[1].getValue("hhq_household_head_name"), "Saved head");
assert.equal(models[1].getQuestionByName("hhq_household_members").panels[0].getQuestionByName("member_name").value, "Saved member");
const scheduleQuestions = nativeModel.getVisiblePageQuestions(models[1].getPageByName("page_02_household_schedule"));
assert.equal(scheduleQuestions[0].name, "hhq_household_schedule_intro");
assert.equal(scheduleQuestions[0].renderAs, "instruction");
assert.equal(scheduleQuestions[0].html, "Now I Would like to ask about the members of your Household. Please give me the names of persons who usually live in your household, starting with the head of the household.");
assert.equal(scheduleQuestions[1].name, "hhq_household_members");
render();
assert.equal(models.length, 2, "restored draft rerenders retain the same model and answers");

// Exercise the summary and checklist handlers in the same mobile component harness.
slots.find((slot) => slot?.value === "loading").value = "locked";
const rosterModel = models[1];
rosterModel.setValue("hhq_household_members", Array.from({ length: 20 }, (_, index) => ({
  member_name: `Member ${index + 1}`, member_age_years: 30, member_sex: 2,
})));
const descendants = (node) => !node || typeof node !== "object" ? [] :
  [node, ...(node.props?.children || []).flat(Infinity).flatMap(descendants)];
const findNode = (tree, type) => descendants(tree).find((node) => node.type === type);
const textContent = (node) => (node?.props?.children || []).flat(Infinity).map((child) =>
  typeof child === "object" ? textContent(child) : String(child ?? "")).join("");
const button = (tree, label) => descendants(tree).find((node) => node.type === "Pressable" && textContent(node) === label);
const openSummary = () => {
  const renderer = findNode(render(), "NativeSurveyRenderer");
  assert.equal(renderer.props.onNextRequested(rosterModel, rosterModel.getPageByName("page_02_household_schedule")), true);
  const summary = findNode(render(), "ScrollView");
  assert.ok(summary, "member summary must scroll vertically instead of clipping its checklist below a long roster");
  assert.notEqual(summary.props.horizontal, true);
  assert.equal(summary.props.style.flex, 1);
  assert.equal(summary.props.style.minHeight, 0);
  assert.ok(summary.props.contentContainerStyle.paddingBottom > 0);
  assert.equal(summary.props.keyboardShouldPersistTaps, "handled");
  const rows = findNode(summary, "DisplayRenderer").props.rows;
  assert.equal(rows.length, 20, "all members remain in the scroll content");
  assert.equal(rows[19].memberName, "Member 20");
  assert.ok(button(summary, "Edit roster"), "roster editing stays within the reachable scroll content");
  assert.ok(button(summary, "Yes, add member"));
  return summary;
};
let summary = openSummary();
await button(summary, "Yes, add member").props.onPress();
assert.equal(rosterModel.currentPage.name, "page_02_household_schedule");
assert.ok(rosterModel.getQuestionByName("hhq_household_members").dynamicAddRequestToken);
summary = openSummary();
button(summary, "Edit roster").props.onPress();
assert.equal(rosterModel.currentPage.name, "page_02_household_schedule");
assert.ok(findNode(render(), "NativeSurveyRenderer"));


summary = openSummary();
button(summary, "No").props.onPress();
summary = findNode(render(), "ScrollView");
assert.match(textContent(summary), /B\) Are there other people/);
assert.ok(button(summary, "No, go to Section 3"), "checklist B continuation stays inside the vertical scroll");
await button(summary, "No, go to Section 3").props.onPress();
assert.ok(findNode(render(), "NativeSurveyRenderer").props.validationFocusRequest?.question,
  "An incomplete roster must still queue focus on its actual validation error");
summary = openSummary();
button(summary, "No").props.onPress();
summary = findNode(render(), "ScrollView");
// Existing schedule validation is tested separately; isolate navigation after a valid schedule.
const schedule = rosterModel.getPageByName("page_02_household_schedule");
const getScheduleQuestions = schedule.getAllQuestions;
schedule.getAllQuestions = () => [];
await button(summary, "No, go to Section 3").props.onPress();
schedule.getAllQuestions = getScheduleQuestions;
assert.equal(rosterModel.currentPage.name, "page_03_household_characteristics");
assert.ok(findNode(render(), "NativeSurveyRenderer"));
assert.ok(findNode(render(), "NativeSurveyRenderer").props.validationFocusRequest === null,
  "Confirmed roster must not replay the corrected Section 2 error when the renderer remounts");

// Saved target-language text must reach the custom BHQ roster host, not just SurveyJS questions.
const translatedHostKeys = [
  "bhq_member_summary_heading", "bhq_member_summary_one", "bhq_member_summary_many",
  "bhq_summary_count", "bhq_summary_name", "bhq_summary_age", "bhq_summary_sex",
  "bhq_check_listing_heading", "bhq_check_listing_intro", "bhq_check_listing_a", "bhq_check_listing_b",
  "bhq_yes_add_member", "bhq_no", "bhq_no_go_section_3", "bhq_edit_roster",
  "bhq_confirm_roster_before_section_03", "bhq_roster_confirmed", "bhq_add_member_required",
  "bhq_add_missing_child", "bhq_add_other_resident", "bhq_complete_roster_fields",
];
rosterModel.nativeText = Object.fromEntries(translatedHostKeys.map((name) => [name, {
  default: nativeFormText.NATIVE_FORM_TEXT.HHQ[name], hi: `हिन्दी ${name}${name.includes("summary_one") || name.includes("summary_many") ? " {count}" : ""}`,
}]));
rosterModel.locale = "hi";
const viewSlot = slots.find((slot) => slot?.value === "form");
const checklistSlot = slots.find((slot) => slot?.value === "b");
viewSlot.value = "member-summary";
checklistSlot.value = "a";
let translatedSummary = findNode(render(), "ScrollView");
let translatedDisplay = findNode(translatedSummary, "DisplayRenderer");
assert.equal(translatedDisplay.props.title, "हिन्दी bhq_member_summary_heading");
assert.equal(translatedDisplay.props.subtitle, "हिन्दी bhq_member_summary_many 20");
assert.deepEqual(Array.from(translatedDisplay.props.columns, (column) => column.title),
  ["count", "name", "age", "sex"].map((name) => `हिन्दी bhq_summary_${name}`));
for (const key of ["bhq_check_listing_heading", "bhq_check_listing_intro", "bhq_check_listing_a", "bhq_edit_roster"]) {
  assert.ok(textContent(translatedSummary).includes(`हिन्दी ${key}`), `${key} uses saved Hindi text`);
}
button(translatedSummary, "हिन्दी bhq_no").props.onPress();
translatedSummary = findNode(render(), "ScrollView");
assert.ok(textContent(translatedSummary).includes("हिन्दी bhq_check_listing_b"));
schedule.getAllQuestions = () => [];
await button(translatedSummary, "हिन्दी bhq_no_go_section_3").props.onPress();
schedule.getAllQuestions = getScheduleQuestions;
assert.equal(findNode(render(), "NativeSurveyRenderer").props.notice, "हिन्दी bhq_roster_confirmed");
const twentyMembers = rosterModel.getValue("hhq_household_members");
rosterModel.setValue("hhq_household_members", twentyMembers.slice(0, 1));
viewSlot.value = "member-summary";
assert.equal(findNode(render(), "DisplayRenderer").props.subtitle, "हिन्दी bhq_member_summary_one 1");
rosterModel.setValue("hhq_household_members", []);
assert.ok(textContent(findNode(render(), "ScrollView")).includes("हिन्दी bhq_add_member_required"));
rosterModel.setValue("hhq_household_members", twentyMembers);
rosterModel.locale = "default";
viewSlot.value = "form";

// Resume a draft saved before consent, then keep the newly entered consent/GPS after refresh.
draftSlot.value = { key, loading: false, draft: { draft_id: "before-consent", json_payload: {
  hhq_competent_respondent_available: 1, hhq_household_head_name: "Draft household head",
} } };
render();
const resumedModel = models.at(-1);
assert.equal(resumedModel.getValue(consentField), undefined);
assert.equal(resumedModel.getQuestionByName("hhq_gps_latitude").isVisible, false);
resumedModel.setValue(consentField, 1);
resumedModel.setValue("hhq_contact_mobile_numbers", [{ mobile_holder_name: "Draft household head", mobile_number: "9876543210" }]);
resumedModel.setValue("hhq_gps_longitude", 77.3);
resumedModel.setValue("hhq_gps_latitude", 28.4);
assertContextRefreshRetainsInterview(resumedModel);

// A new Other reason is entered at Q9 before navigation, including restored blank drafts.
draftSlot.value = { key, loading: false, draft: { draft_id: "terminal", json_payload: {
  hhq_site_id: 2, hhq_residence_area_type: 2, hhq_locality_code: "11",
  hhq_structure_map_id: "0001", hhq_household_number: "01",
  hhq_household_head_name: "Household head", hhq_household_address: "Address",
  hhq_interview_date: "2026-10-24", hhq_visit_no: 1,
  hhq_competent_respondent_available: 12,
} } };
render();
const terminalModel = models.at(-1);
await findNode(render(), "NativeSurveyRenderer").props.onPreviewRequested();
assert.ok(findNode(render(), "NativeSurveyRenderer"), "blank restored Other reason must block preview");
assert.equal(terminalModel.currentPage.name, "page_01_identification");
assert.ok(terminalModel.getQuestionByName("hhq_competent_respondent_other_specify").errors.length);
assert.equal(findNode(render(), "NativeSurveyRenderer").props.validationFocusRequest.question,
  terminalModel.getQuestionByName("hhq_competent_respondent_other_specify"), "BHQ queues exact focus after a blocked preview");
terminalModel.setValue("hhq_competent_respondent_available", 11);
assert.equal(terminalModel.currentPage.name, "page_04_outcome", "shifted dwelling goes directly to Outcome");
navigation.goToSurveySection(terminalModel, "page_01_identification");
terminalModel.setValue("hhq_competent_respondent_available", 12);
assert.equal(terminalModel.currentPage.name, "page_01_identification", "Other must remain at Q9 for reason entry");
terminalModel.setValue("hhq_competent_respondent_other_specify", "M");
assert.equal(terminalModel.currentPage.name, "page_01_identification", "typing the first character must not navigate");
terminalModel.setValue("hhq_competent_respondent_other_specify", "Moved permanently");
assert.equal(terminalModel.nextPage(), true);
assert.equal(terminalModel.currentPage.name, "page_04_outcome");
assert.equal(terminalModel.getValue("hhq_dwelling_other_specify"), "Moved permanently");

// Execute the actual browse effect, proving opening HHQ does not query an invisible list.
const householdSource = fs.readFileSync(new URL("../modules/households/HouseholdModule.js", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const browseEffect = householdSource.match(/useEffect\(\(\) => \{\n    if \(showForm\) return undefined;\n    refreshHouseholds\(\);[\s\S]*?\}, \[showForm,[^\]]*\]\);/);
assert.ok(browseEffect, "browse lifecycle must depend on form visibility");
let browseCalls = 0;
const browseContext = { showForm: true, householdRequestRef: { current: 0 }, refreshHouseholds: () => { browseCalls++; }, useEffect: (callback) => callback() };
const effectBody = browseEffect[0].slice(0, browseEffect[0].lastIndexOf(", [")) + ");";
vm.runInNewContext(effectBody, browseContext);
assert.equal(browseCalls, 0);
browseContext.showForm = false;
vm.runInNewContext(effectBody, browseContext);
assert.equal(browseCalls, 1, "returning to browsing loads the household list");
assert.match(householdSource, /useEffect\(\(\) => \{\n    if \(showForm\) return undefined;\n    let active = true;/, "hidden member search is gated too");
// New interview identities still wait for their own draft and construct a fresh model.
for (const changeInterview of [
  () => { props.selectedLocalityCode = "12"; },
  () => { props.user = { ...props.user, user_id: "another-worker" }; },
  () => { props.taskContext = { id: "another-task", household_id: "2-11-0002-01" }; },
  () => { props.form = { ...props.form, version: "another-version" }; },
]) {
  const previousModel = models.at(-1);
  previousModel.setValue(consentField, 1);
  const count = models.length;
  changeInterview(); render();
  assert.equal(models.length, count, "A different interview must wait for its draft lookup");
  const nextKey = slots.find((slot) => typeof slot?.value === "string" && slot.value.includes('"formCode":"HHQ"')).value;
  assert.notEqual(nextKey, draftSlot.value.key);
  draftSlot.value = { key: nextKey, loading: false, draft: null };
  render();
  assert.equal(models.length, count + 1);
  assert.notEqual(models.at(-1), previousModel);
  assert.equal(models.at(-1).getValue(consentField), undefined, "Consent must not leak into another interview");
}
models.forEach((model) => model.dispose());
console.log(`HHQ startup lifecycle passed: 3 initial model builds reduced to 1; host model construction ${timings.map((time) => time.toFixed(1)).join(", ")} ms. No hidden household query during interview.`);
