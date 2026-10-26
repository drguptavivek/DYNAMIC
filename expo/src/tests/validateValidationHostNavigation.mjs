/** Exercise the real host handlers without native storage or submitted evidence. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parse } from "@babel/parser";
import { Model } from "survey-core";
import * as navigation from "../modules/questionnaires/surveyNavigation.js";
import { hasNativeValidationProblem, validateNativeQuestionTree } from "../components/forms/nativeSurveyModel.js";
import { findFirstNativeValidationQuestion } from "../components/forms/nativeValidationFocus.js";
import { getNativeFormText } from "../lib/nativeFormText.js";

function handlers(file, names, bindings) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  if (file.includes("QuestionnaireDashboard")) {
    assert.match(source, /onPress=\{\(\) => requestCompleteFromModel\(survey\)\}/);
    assert.match(source, /onCompleteRequested=\{requestCompleteFromModel\}/);
  }
  const found = new Map();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "FunctionDeclaration" && names.includes(node.id?.name)) {
      found.set(node.id.name, source.slice(node.start, node.end));
    }
    if (names.includes("onCurrentPageChanging") && node.type === "CallExpression" &&
      node.callee?.property?.name === "add" && node.callee?.object?.property?.name === "onCurrentPageChanging") {
      const callback = node.arguments[0];
      found.set("onCurrentPageChanging", `const onCurrentPageChanging = ${source.slice(callback.start, callback.end)};`);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  }
  visit(parse(source, { sourceType: "module", plugins: ["jsx"] }));
  assert.equal(found.size, names.length);
  const context = { ...navigation, findFirstNativeValidationQuestion, ...bindings, exports: {} };
  vm.runInNewContext([...found.values()].join("\n") + `\nexports = {${names.join(",")}}`, context);
  return context.exports;
}

function repeatedModel(pageName = "page_02b_reproduction_follow_up") {
  return new Model({ pages: [
    { name: "page_02_reproduction", elements: [{ type: "text", name: "summary" }] },
    { name: pageName, elements: [{ type: "paneldynamic", name: "children", panelCount: 4,
      templateElements: [{ type: "text", name: "child_name", isRequired: true }] }] },
    { name: "page_outcome", elements: [{ type: "text", name: "outcome" }] },
  ] });
}

const model = repeatedModel();
const children = model.getQuestionByName("children");
children.panels.slice(0, 3).forEach((panel, index) => { panel.getQuestionByName("child_name").value = `Child ${index + 1}`; });
const fourthQuestion = children.panels[3].getQuestionByName("child_name");
let request = null;
let previewOpen = true;
let completed = 0;
model.onComplete.add(() => { completed++; });
const generic = handlers("../modules/questionnaires/QuestionnaireDashboard.js",
  ["revealValidationError", "requestCompleteFromModel", "handleSectionNavPress"], {
    getSurveyValidationQuestion: navigation.getSurveyValidationQuestion,
    setPreviewOpen: (value) => { previewOpen = value; },
    setMemberSummaryOpen() {}, setSectionDrawerOpen() {}, updateSurveyStatus() {},
    setValidationFocusRequest: (update) => { request = update(request); },
    form: { form_code: "WQ" }, isHouseholdQuestionnaire: () => false,
    isWomanQuestionnaire: () => true, hasIncompleteWqBornAliveChildFollowups: () => false,
    hasWqReproductionComparisonDeficit: () => false,
    WQ_REPRODUCTION_COMPARISON_FIELD: "wq_reproduction_comparison_table",
    memberSummaryConfirmedRef: { current: true },
  });
model.currentPage = model.pages[2];
const answersBefore = JSON.stringify(model.data);
assert.equal(generic.requestCompleteFromModel(model), false);
assert.equal(completed, 0, "Confirm & Submit must not finalize an invalid form");
assert.equal(previewOpen, false, "Invalid preview submission must remount the form");
assert.equal(model.currentPage.name, "page_02b_reproduction_follow_up");
assert.equal(request.question, fourthQuestion, "Queue the fourth child's actual instance, not its repeated name");
assert.equal(JSON.stringify(model.data), answersBefore, "Revealing an error never edits interview answers");

model.currentPage = model.pages[2];
generic.handleSectionNavPress(model, "page_02_reproduction");
assert.equal(model.currentPage.name, "page_02b_reproduction_follow_up",
  "The red logical reproduction section must open its actual failing subpage");
assert.equal(request.question, fourthQuestion);
assert.equal(request.sequence, 2, "Repeated requests must still reopen and scroll the same question");

fourthQuestion.value = "Child 4";
assert.equal(generic.requestCompleteFromModel(model), true);
assert.equal(completed, 1, "Valid answers still reach the existing completion/preview gate");

for (const formCode of ["HHQ", "HRF", "WQ", "PEF", "PFF", "PSF", "POF", "UF", "BAF", "NFF", "CDF", "SBF"]) {
  const simple = new Model({ elements: [{ type: "text", name: "required_answer", isRequired: true }] });
  let saves = 0;
  simple.onComplete.add(() => { saves++; });
  assert.equal(generic.requestCompleteFromModel(simple), false, `${formCode}: required validation cannot be bypassed`);
  assert.equal(saves, 0);
  assert.equal(request.question.name, "required_answer");
  simple.dispose();
}

const composite = new Model({ pages: [{ name: "details", elements: [
  { type: "paneldynamic", name: "wq_born_alive_child_followups", panelCount: 4,
    templateElements: [{ type: "text", name: "saved_child" }] },
  { type: "text", name: "wq_reproduction_comparison_table" },
] }] });
let pendingChildren = true;
let comparisonDeficit = false;
let compositeSaves = 0;
composite.onComplete.add(() => { compositeSaves++; });
const compositeHandlers = handlers("../modules/questionnaires/QuestionnaireDashboard.js",
  ["revealValidationError", "requestCompleteFromModel"], {
    setPreviewOpen() {}, setMemberSummaryOpen() {}, setSectionDrawerOpen() {}, updateSurveyStatus() {}, setSaveMessage() {},
    setValidationFocusRequest: (update) => { request = update(request); },
    form: { form_code: "WQ" }, isWomanQuestionnaire: () => true,
    hasIncompleteWqBornAliveChildFollowups: () => pendingChildren,
    hasWqReproductionComparisonDeficit: () => comparisonDeficit,
    WQ_REPRODUCTION_COMPARISON_FIELD: "wq_reproduction_comparison_table",
  });
assert.equal(composite.validate(), true, "Composite save/review gates are separate from ordinary field validation");
assert.equal(compositeHandlers.requestCompleteFromModel(composite), false);
assert.equal(request.question, composite.getQuestionByName("wq_born_alive_child_followups"));
pendingChildren = false;
comparisonDeficit = true;
assert.equal(compositeHandlers.requestCompleteFromModel(composite), false);
assert.equal(request.question, composite.getQuestionByName("wq_reproduction_comparison_table"));
assert.equal(compositeSaves, 0, "Preview must not bypass child-save or comparison gates");
pendingChildren = true;
composite.getQuestionByName("wq_born_alive_child_followups").visible = false;
composite.getQuestionByName("wq_reproduction_comparison_table").visible = false;
assert.equal(compositeHandlers.requestCompleteFromModel(composite), true, "Hidden stop-branch history cannot block final submission");
composite.dispose();

const pendingSave = new Model({ pages: [
  { name: "page_02b_reproduction_follow_up", elements: [
    { type: "paneldynamic", name: "wq_born_alive_child_followups", panelCount: 4,
      templateElements: [{ type: "text", name: "entered_child", isRequired: true }] },
  ] },
  { name: "page_02c_reproduction_confirmation", elements: [
    { type: "text", name: "later_confirmation", isRequired: true },
  ] },
] });
const pendingOwner = pendingSave.getQuestionByName("wq_born_alive_child_followups");
pendingOwner.panels.forEach((panel, index) => { panel.getQuestionByName("entered_child").value = `Child ${index + 1}`; });
let changingCalls = 0;
const pendingHandlers = handlers("../modules/questionnaires/QuestionnaireDashboard.js",
  ["revealValidationError", "requestCompleteFromModel", "onCurrentPageChanging"], {
    model: pendingSave, form: { form_code: "WQ" },
    isWomanQuestionnaire: () => true, isHouseholdQuestionnaire: () => false,
    hasIncompleteWqBornAliveChildFollowups: () => true,
    hasWqReproductionComparisonDeficit: () => false,
    WQ_REPRODUCTION_COMPARISON_PAGE_NAME: "page_02d_reproduction_comparison",
    WQ_REPRODUCTION_COMPARISON_FIELD: "wq_reproduction_comparison_table",
    WQ_SECTION_TWO_FINAL_PAGE_NAME: "page_02e_reproduction_after_comparison",
    setSaveMessage() {}, showFormAlert() {}, Alert: {},
    setPreviewOpen() {}, setMemberSummaryOpen() {}, setSectionDrawerOpen() {}, updateSurveyStatus() {},
    setValidationFocusRequest: (update) => { request = update(request); },
  });
pendingSave.onCurrentPageChanging.add((sender, options) => {
  assert.ok(++changingCalls <= 2, "Blocked child-save navigation must not recurse into later logical pages");
  pendingHandlers.onCurrentPageChanging(sender, options);
});
pendingSave.nextPage();
assert.equal(changingCalls, 1);
assert.equal(pendingSave.currentPage.name, "page_02b_reproduction_follow_up");
assert.equal(request.question, pendingOwner, "Reveal the pending child editor, not the later required confirmation");
pendingSave.setValue("later_confirmation", "Confirmed");
assert.equal(pendingHandlers.requestCompleteFromModel(pendingSave), false);
assert.equal(request.question, pendingOwner, "Final confirmation must use the same owner-scoped child target");
pendingSave.dispose();

const householdModel = repeatedModel("page_02_household_schedule");
householdModel.getQuestionByName("children").panels.slice(0, 3).forEach((panel) => {
  panel.getQuestionByName("child_name").value = "Household member";
});
const fourthMember = householdModel.getQuestionByName("children").panels[3].getQuestionByName("child_name");
let householdRequest = null;
let view = "preview";
let savedResponses = 0;
const household = handlers("../modules/households/BaselineHouseholdForm.js",
  ["revealValidationError", "validateSchedule", "confirmMemberSummary", "requestFinalReview", "submitFinal"], {
    model: householdModel,
    setView: (value) => { view = value; }, setSectionDrawerOpen() {}, setRevision() {},
    setValidationFocusRequest: (update) => { householdRequest = update(householdRequest); },
    setMessage() {}, setSaving() {}, setMemberSummaryConfirmed() {},
    applyHhqVisitNo() {}, refreshHouseholdSurveyBehaviors() {},
    taskContext: {}, form: { form_code: "HHQ" }, user: {},
    memberSummaryConfirmedRef: { current: true },
    isHhqAvailabilityStop: () => false, hasDeclinedHouseholdConsent: () => false,
    HOUSEHOLD_SCHEDULE_PAGE_NAME: "page_02_household_schedule",
    hasNativeValidationProblem, validateNativeQuestionTree, getNativeFormText,
    saveDraft: async () => ({}), previewSignature: JSON.stringify(householdModel.data),
    saveQuestionnaireSubmission: async () => { savedResponses++; },
  });
await household.requestFinalReview();
assert.equal(view, "form");
assert.equal(householdRequest.question, fourthMember);
await household.submitFinal();
assert.equal(householdRequest.question, fourthMember);
assert.equal(savedResponses, 0, "BHQ invalid final confirmation cannot write evidence");
await household.confirmMemberSummary();
assert.equal(householdRequest.question, fourthMember, "BHQ roster confirmation opens the failing member");

model.dispose();
householdModel.dispose();
console.log("Host validation reveals exact repeated questions, actual logical subpages, and blocks invalid final submission.");
