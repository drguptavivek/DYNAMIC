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
import * as householdIds from "../modules/households/householdIds.js";
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
  "../../components/forms/renderers/DisplayRenderer.js": { DisplayRenderer: "DisplayRenderer" },
  "../questionnaires/surveyNavigation.js": navigation,
  "../questionnaires/householdMemberSummary.js": memberSummary,
  "./householdIds.js": householdIds,
  "../../lib/nativeFormText.js": { getNativeFormText: (_model, _key, fallback) => fallback },
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
// Restore an available, consenting household draft; only that branch exposes the roster.
draftSlot.value = { key, loading: false, draft: { draft_id: "saved", json_payload: { hhq_competent_respondent_available: 1, hhq_consent_study_provide_pis_explain_study_adult_member: 1, hhq_household_head_name: "Saved head", hhq_household_members: [{ member_name: "Saved member", member_age_years: 30, member_sex: 2 }] } } };
render();
assert.equal(models.length, 2);
assert.equal(models[1].getValue("hhq_household_head_name"), "Saved head");
assert.equal(models[1].getQuestionByName("hhq_household_members").panels[0].getQuestionByName("member_name").value, "Saved member");
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
// Existing schedule validation is tested separately; isolate navigation after a valid schedule.
const schedule = rosterModel.getPageByName("page_02_household_schedule");
const getScheduleQuestions = schedule.getAllQuestions;
schedule.getAllQuestions = () => [];
await button(summary, "No, go to Section 3").props.onPress();
schedule.getAllQuestions = getScheduleQuestions;
assert.equal(rosterModel.currentPage.name, "page_03_household_characteristics");
assert.ok(findNode(render(), "NativeSurveyRenderer"));

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
models.forEach((model) => model.dispose());
console.log(`HHQ startup lifecycle passed: 3 initial model builds reduced to 1; host model construction ${timings.map((time) => time.toFixed(1)).join(", ")} ms. No hidden household query during interview.`);
