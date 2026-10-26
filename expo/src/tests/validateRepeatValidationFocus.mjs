import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "@babel/core";
import { Model } from "survey-core";
import * as nativeModel from "../components/forms/nativeSurveyModel.js";
import * as focus from "../components/forms/nativeValidationFocus.js";
import * as nativeText from "../lib/nativeFormText.js";

const slots = [];
let cursor = 0;
let dirty = false;
let effects = [];
const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => value === right[index]);
const React = {
  Fragment: "Fragment",
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
};
function useState(initial) {
  const index = cursor++;
  slots[index] ??= { value: initial };
  return [slots[index].value, (value) => {
    const next = typeof value === "function" ? value(slots[index].value) : value;
    if (next !== slots[index].value) dirty = true;
    slots[index].value = next;
  }];
}
function useEffect(callback, deps) {
  const index = cursor++;
  if (!slots[index] || !sameDeps(slots[index].deps, deps)) effects.push(callback);
  slots[index] = { deps };
}
function useRef(current) {
  const index = cursor++;
  slots[index] ??= { current };
  return slots[index];
}
function loadComponent(file, name) {
  const source = fs.readFileSync(new URL(`../components/forms/renderers/${file}`, import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;/gm, "").replace(/^export /gm, "");
  const host = {
    ...nativeModel, ...nativeText, ...focus, React, useState, useEffect, useRef,
    requestAnimationFrame: (callback) => callback(),
    StyleSheet: { create: (value) => value }, controlStyles: {},
    View: "View", Text: "Text", ScrollView: "ScrollView", Pressable: "Pressable",
    Alert: { alert() {} }, MaterialCommunityIcons: "Icon",
    getPanelRegistryDetails: () => null, isBhqRegistrySite: () => false,
    markHhqMobilePanelChildren() {}, confirmCommittedHhqMobileNumber() {},
    acceptHhqHighestGradeYearEntry: () => false, getWqChildBirthdayPrompt: () => null,
    BHQ_RESIDENCE_DURATION_FIELD: "member_residence_duration",
  };
  vm.runInNewContext(transformSync(`${source}\nthis.component = ${name};`, {
    babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-react-jsx"],
  }).code, host);
  return host.component;
}
function render(component, props) {
  let tree;
  let count = 0;
  do {
    assert.ok(++count < 15, "Repeat editor effects must settle");
    cursor = 0;
    dirty = false;
    effects = [];
    tree = component(props);
    effects.forEach((callback) => callback());
  } while (dirty);
  return tree;
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
}

const model = new Model({ elements: [{ type: "paneldynamic", name: "children", panelCount: 4,
  templateElements: [{ type: "text", name: "child_age", isRequired: true, validators: [{ type: "numeric", minValue: 0, maxValue: 99 }] }] }] });
const owner = model.getQuestionByName("children");
owner.value = ["03", "04", "05", "100"].map((child_age) => ({ child_age }));
owner.validate();
const fourth = owner.panels[3].getQuestionByName("child_age");
assert.equal(focus.findFirstNativeValidationQuestion([owner]), fourth);
assert.equal(focus.getValidationPanelIndex(owner, fourth), 3);
assert.equal(focus.getValidationPanelIndex(owner, owner.panels[0].questions[0]), 0);
assert.equal(focus.getValidationPanelIndex(owner, model.getQuestionByName("missing")), -1);
const before = JSON.stringify(model.data);
const rendered = [];
const requests = [];
const props = { question: owner, locale: "default", onChange() {},
  renderQuestion: (question) => { rendered.push(question); return { type: "Question", props: { question } }; },
  onRequestTopLevelFocus: (question) => requests.push(question),
  validationFocusRequest: { question: fourth, sequence: 1 } };
const DynamicPanel = loadComponent("DynamicPanelRenderer.js", "DynamicPanelRenderer");
let tree = render(DynamicPanel, props);
assert.ok(rendered.includes(fourth), "The fourth child with the error must open automatically");
assert.equal(JSON.stringify(model.data), before, "Revealing errors must never modify responses");
const commit = nodes(tree).find((node) => node.type === "Pressable" &&
  nodes(node).some((child) => child.type === "Text" && child.props.children.includes("Update entry")));
assert.ok(commit, "Opened entry retains its original save control");
commit.props.onPress();
assert.equal(requests.at(-1), fourth, "Entry validation must focus the exact failing child question");
fourth.value = "06";
owner.validate();
owner.panels[1].questions[0].value = "101";
owner.validate();
const second = focus.findFirstNativeValidationQuestion([owner]);
assert.equal(second, owner.panels[1].questions[0]);
rendered.length = 0;
render(DynamicPanel, { ...props, validationFocusRequest: { question: second, sequence: 2 } });
assert.ok(rendered.includes(second), "A later validation request must reveal the next failing entry");

// Even a completed born-alive child can need correction after final-form validation.
slots.length = 0;
const childModel = new Model({ elements: [{ type: "paneldynamic", name: "wq_born_alive_child_followups", panelCount: 4,
  templateElements: [
    { type: "radiogroup", name: "pregnancy_02_reproduction_is_name_still_alive", choices: [1, 2], isRequired: true },
    { type: "text", name: "pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b", isRequired: true },
    { type: "radiogroup", name: "pregnancy_02_reproduction_if_born_alive_and_still_living_is_name_liv", choices: [1, 2] },
    { type: "text", name: "pregnancy_02_reproduction_if_born_alive_and_still_living_record_hous", readOnly: true },
    { type: "text", name: "wq_followup_completed", readOnly: true },
  ] }] });
const childOwner = childModel.getQuestionByName("wq_born_alive_child_followups");
childOwner.value = Array.from({ length: 4 }, () => ({ pregnancy_02_reproduction_is_name_still_alive: 1,
  pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b: "04",
  pregnancy_02_reproduction_if_born_alive_and_still_living_is_name_liv: 1,
  wq_followup_completed: 1 }));
let automaticAdvances = 0;
childOwner.wqAdvanceToNextChild = () => { automaticAdvances++; };
const childQuestion = childOwner.panels[3].questions[1];
childQuestion.value = undefined;
childOwner.validate();
assert.equal(focus.findFirstNativeValidationQuestion([childOwner]), childQuestion);
rendered.length = 0;
const followupBefore = JSON.stringify(childModel.data);
const BornAlive = loadComponent("WqBornAliveChildFollowupsRenderer.js", "WqBornAliveChildFollowupsRenderer");
render(BornAlive, { ...props, question: childOwner, validationFocusRequest: { question: childQuestion, sequence: 3 } });
assert.ok(rendered.includes(childQuestion), "Final validation must reopen a completed fourth child's editor");
assert.equal(JSON.stringify(childModel.data), followupBefore);
assert.equal(automaticAdvances, 0, "Opening an invalid saved child must not advance or recalculate its answers");

childOwner.panels[2].getQuestionByName("wq_followup_completed").value = undefined;
requests.length = 0;
render(BornAlive, { ...props, question: childOwner, validationFocusRequest: { question: childOwner, sequence: 4 } });
assert.equal(requests.at(-1), childOwner.panels[2].questions[0],
  "A pending-save container request must reveal the first field of the exact incomplete child");

const compoundModel = new Model({ elements: [{ type: "multipletext", name: "measurement",
  items: [{ name: "systolic", isRequired: true }, { name: "diastolic", isRequired: true }] }] });
const compound = compoundModel.getQuestionByName("measurement");
compound.validate();
assert.equal(focus.findFirstNativeValidationQuestion([compound]), compound,
  "Compound-item errors must still locate their rendered question");

const internal = { name: "wq_followup_completed", isRequired: true, value: undefined, getType: () => "text" };
const lockedModel = new Model({ elements: [
  { type: "text", name: "locked_prefill", readOnly: true, isRequired: true },
  { type: "text", name: "editable_answer", isRequired: true },
] });
assert.equal(lockedModel.validate(), false);
assert.equal(focus.findFirstNativeValidationQuestion(lockedModel.currentPage.questions),
  lockedModel.getQuestionByName("editable_answer"), "Skip locked fields that Survey Core does not consider invalid");
lockedModel.setValue("editable_answer", "Complete");
assert.equal(lockedModel.validate(), true);
assert.equal(focus.findFirstNativeValidationQuestion(lockedModel.currentPage.questions), null);

const hidden = { name: "hidden", isVisible: false, isRequired: true, getType: () => "text" };
const background = { name: "background", renderAs: "background", isRequired: true, getType: () => "text" };
assert.equal(focus.findFirstNativeValidationQuestion([internal, hidden, background]), null,
  "Error focus must not send a user to hidden bookkeeping controls");
console.log("Repeated validation reveals the exact child/editor without changing answers.");
