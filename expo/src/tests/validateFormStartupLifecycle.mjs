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
  "react-native": { useWindowDimensions: () => ({ width: 400 }), StyleSheet: { create: (styles) => styles }, View: "View", Text: "Text" },
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
const render = () => { cursor = 0; context.exports.BaselineHouseholdForm(props); };
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
// Resolve a recovered draft, including a member roster, through the unchanged real initializer.
draftSlot.value = { key, loading: false, draft: { draft_id: "saved", json_payload: { hhq_consent_study_provide_pis_explain_study_adult_member: 1, hhq_household_head_name: "Saved head", hhq_household_members: [{ member_name: "Saved member", member_age_years: 30, member_sex: 2 }] } } };
render();
assert.equal(models.length, 2);
assert.equal(models[1].getValue("hhq_household_head_name"), "Saved head");
assert.equal(models[1].getQuestionByName("hhq_household_members").panels[0].getQuestionByName("member_name").value, "Saved member");
render();
assert.equal(models.length, 2, "restored draft rerenders retain the same model and answers");

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
