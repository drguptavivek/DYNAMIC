/** Verifies the BHQ registry-link data contract without rendering a screen. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "@babel/core";
import { Model } from "survey-core";
import { getPreparedSurveyJson, prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { attachHouseholdSurveyBehaviors } from "../lib/householdSurveyBehaviors.js";
import { buildPushRecords } from "../modules/sync/syncWorkflow.js";

const lookup = await import("../components/forms/renderers/bhqRegistryLookup.js");
const {
  BHQ_REGISTRY_AGE_FIELD,
  BHQ_REGISTRY_DOMICILE_FIELD,
  BHQ_REGISTRY_ID_FIELD,
  BHQ_REGISTRY_NAME_FIELD,
  BHQ_REGISTRY_SEX_FIELD,
  BHQ_REGISTRY_STATUS_FIELD,
  BHQ_REGISTRY_UID_FIELD,
  applyRegistryIndividualToPanel,
  buildRegistryFacingId,
  clearRegistryIndividualFromPanel,
  decodeRegistrySex,
  getPanelRegistryDetails,
  getRegistryLookupPrefill,
  hasRegistryLookupCriteria,
  masterStatusToChoice,
} = lookup;

assert.equal(buildRegistryFacingId("001", "0105", "01", "02"), "001-0105-01-02");
assert.equal(buildRegistryFacingId("001", "", "01", "02"), "");
assert.equal(decodeRegistrySex("1"), "Male");
assert.equal(decodeRegistrySex("2"), "Female");
assert.equal(masterStatusToChoice("Resident"), 1);
assert.equal(masterStatusToChoice("Dead"), 2);
assert.equal(masterStatusToChoice("E"), 3);

const values = new Map([
  ["member_name", "Interview name"],
  ["member_age_years", 34],
]);
const panel = {
  getQuestionByName: (name) => ({
    set value(value) { values.set(name, value); },
    get value() { return values.get(name); },
  }),
};
const person = {
  uid: "HDSS-001-0105-01-02",
  village_code: "001",
  hh_list_no: "0105",
  family_no: "01",
  ind_no: "02",
  name: "Registry Name",
  age_years: 42,
  sex: "1",
  domicile: "Resident",
  status: "alive",
};
assert.equal(applyRegistryIndividualToPanel(panel, person), true);
assert.equal(values.get(BHQ_REGISTRY_ID_FIELD), "001-0105-01-02");
assert.equal(values.get(BHQ_REGISTRY_UID_FIELD), person.uid);
assert.equal(values.get(BHQ_REGISTRY_STATUS_FIELD), 1);
assert.equal(values.get(BHQ_REGISTRY_NAME_FIELD), "Registry Name");
assert.equal(values.get(BHQ_REGISTRY_AGE_FIELD), 42);
assert.equal(values.get(BHQ_REGISTRY_SEX_FIELD), "1");
assert.equal(values.get(BHQ_REGISTRY_DOMICILE_FIELD), "Resident");
assert.deepEqual(getPanelRegistryDetails(panel), {
  uid: person.uid,
  originalId: "001-0105-01-02",
  name: "Registry Name",
  age: 42,
  sex: "Male",
  status: "Resident",
});

// A replacement overwrites the one stored UID; it does not append another link.
applyRegistryIndividualToPanel(panel, { ...person, uid: "HDSS-REPLACEMENT", ind_no: "03", sex: "2", domicile: "Dead" });
assert.equal(values.get(BHQ_REGISTRY_UID_FIELD), "HDSS-REPLACEMENT");
assert.equal(values.get(BHQ_REGISTRY_ID_FIELD), "001-0105-01-03");
assert.equal(values.get(BHQ_REGISTRY_STATUS_FIELD), 2);
assert.equal(getPanelRegistryDetails(panel).sex, "Female");

clearRegistryIndividualFromPanel(panel);
for (const field of [
  BHQ_REGISTRY_ID_FIELD,
  BHQ_REGISTRY_UID_FIELD,
  BHQ_REGISTRY_STATUS_FIELD,
  BHQ_REGISTRY_NAME_FIELD,
  BHQ_REGISTRY_AGE_FIELD,
  BHQ_REGISTRY_SEX_FIELD,
  BHQ_REGISTRY_DOMICILE_FIELD,
]) assert.equal(values.get(field), undefined, field);
assert.equal(values.get("member_name"), "Interview name");
assert.equal(values.get("member_age_years"), 34);
assert.equal(getPanelRegistryDetails(panel), null);

assert.deepEqual(getRegistryLookupPrefill({
  getValue: (name) => ({ hhq_locality_code: "001", hhq_structure_map_id: "0007" }[name]),
}), { villageCode: "001", houseNo: "0007", name: "" });
assert.deepEqual(getRegistryLookupPrefill({ getValue: () => undefined }), { villageCode: "", houseNo: "", name: "" });
assert.equal(hasRegistryLookupCriteria({ villageCode: "11", houseNo: "0011", name: "" }), true);
assert.equal(hasRegistryLookupCriteria({ villageCode: "11", search: " Rajat, Ankit " }), true);
assert.equal(hasRegistryLookupCriteria({ villageCode: "11", search: " Rajat " }), true);
assert.equal(hasRegistryLookupCriteria({ villageCode: "11", search: " , , " }), false);
assert.equal(hasRegistryLookupCriteria({ villageCode: " ", houseNo: "0011", search: "Rajat" }), false);
assert.equal(hasRegistryLookupCriteria({ villageCode: "11", houseNo: " " }), false);

const form = JSON.parse(fs.readFileSync(new URL("../data/forms/baseline_household_questionnaire_v2026.05.09.json", import.meta.url), "utf8"));
// A multi-locality account must never supply the drawer's prefill; read the current form each time.
const prefillSurvey = new Model(prepareQuestionnaireSurveyJson(form));
prefillSurvey.user = { locality_code: "02", area_assignments: [{ locality_code: "02" }, { locality_code: "11" }] };
prefillSurvey.data = { hhq_locality_code: "11", hhq_structure_map_id: "0011", hhq_household_number: "99",
  household_id: "2-71-7777-99" };
assert.deepEqual(getRegistryLookupPrefill(prefillSurvey), { villageCode: "11", houseNo: "0011", name: "" });
prefillSurvey.setValue("hhq_locality_code", "71");
prefillSurvey.setValue("hhq_structure_map_id", "0009");
assert.deepEqual(getRegistryLookupPrefill(prefillSurvey), { villageCode: "71", houseNo: "0009", name: "" }, "reopening reads changed form values");
prefillSurvey.setValue("hhq_locality_code", undefined);
prefillSurvey.setValue("hhq_structure_map_id", undefined);
assert.deepEqual(getRegistryLookupPrefill(prefillSurvey), { villageCode: "", houseNo: "", name: "" }, "missing form values do not fall back to account or household ID");
function findPanel(element) {
  if (element?.name === "hhq_household_members") return element;
  for (const child of element?.elements || []) {
    const found = findPanel(child);
    if (found) return found;
  }
  return null;
}
const roster = form.pages.flatMap((page) => page.elements || []).map(findPanel).find(Boolean);
assert.ok(roster, "roster panel found");
const names = new Set(roster.templateElements.map((element) => element.name));
for (const field of [
  BHQ_REGISTRY_ID_FIELD,
  BHQ_REGISTRY_UID_FIELD,
  BHQ_REGISTRY_STATUS_FIELD,
  BHQ_REGISTRY_NAME_FIELD,
  BHQ_REGISTRY_AGE_FIELD,
  BHQ_REGISTRY_SEX_FIELD,
  BHQ_REGISTRY_DOMICILE_FIELD,
]) assert.ok(names.has(field), `${field} present`);
for (const field of [
  BHQ_REGISTRY_ID_FIELD,
  BHQ_REGISTRY_UID_FIELD,
  BHQ_REGISTRY_STATUS_FIELD,
  BHQ_REGISTRY_NAME_FIELD,
  BHQ_REGISTRY_AGE_FIELD,
  BHQ_REGISTRY_SEX_FIELD,
  BHQ_REGISTRY_DOMICILE_FIELD,
]) {
  const element = roster.templateElements.find((item) => item.name === field);
  assert.equal(element.renderingHint.render_as, "background", `${field} hidden`);
}
assert.deepEqual(
  roster.templateElements.find((item) => item.name === BHQ_REGISTRY_STATUS_FIELD).choices.map((choice) => choice.value),
  [1, 2, 3, 4],
);

// Final submission calls Survey Core validation, which also validates hidden
// roster fields that section navigation deliberately skips.
for (const siteId of [1, 2]) {
  const model = createSurveyModel(getPreparedSurveyJson(form));
  attachHouseholdSurveyBehaviors(model, form);
  model.data = {
    hhq_site_id: siteId,
    hhq_consent_study_provide_pis_explain_study_adult_member: 1,
    hhq_household_head_name: "Interview name",
    hhq_household_members: [{
      member_name: "Interview name",
      member_relationship_to_head: 1,
      member_sex: 2,
      member_last_residence_place: 1,
      member_residence_duration: { years: 20, months: 0 },
      member_age_years: 34,
      member_marital_status: 1,
      member_ever_attended_school: 1,
      member_highest_grade_completed: 12,
    }],
  };
  const member = model.getQuestionByName("hhq_household_members").panels[0];
  for (const linked of [false, true, false]) {
    if (linked) applyRegistryIndividualToPanel(member, person);
    else clearRegistryIndividualFromPanel(member);
    model.validate();
    for (const field of names) {
      if (!field.startsWith("member_registry_")) continue;
      const question = member.getQuestionByName(field);
      assert.equal(question.isRequired, false, `${field} optional at site ${siteId}`);
      assert.equal(question.errors.length, 0, `${field} must not block final validation`);
    }
    assert.equal(member.validate(), true, `valid ${linked ? "linked" : "unlinked"} member at site ${siteId}`);
  }
  const memberName = member.getQuestionByName("member_name");
  memberName.value = undefined;
  assert.equal(memberName.isRequired, true, "normal interview questions remain compulsory");
  assert.equal(member.validate(), false, "missing interview answers still block validation");
  assert.ok(memberName.errors.length > 0);
}

// Confirm the link fields survive a real Survey Core panel round-trip.
const survey = new Model(prepareQuestionnaireSurveyJson(form));
const surveyRoster = survey.getQuestionByName("hhq_household_members");
surveyRoster.value = [{ member_name: "Interview name", member_age_years: 34 }];
const surveyPanel = surveyRoster.panels[0];
applyRegistryIndividualToPanel(surveyPanel, person);
const resumed = new Model(prepareQuestionnaireSurveyJson(form));
resumed.data = JSON.parse(JSON.stringify(survey.data));
assert.deepEqual(getPanelRegistryDetails(resumed.getQuestionByName("hhq_household_members").panels[0]), {
  uid: person.uid,
  originalId: "001-0105-01-02",
  name: "Registry Name",
  age: 42,
  sex: "Male",
  status: "Resident",
});

const [pushRecord] = buildPushRecords({ formResponses: [{
  id: "synthetic-linked-bhq",
  form_code: "HHQ",
  household_id: "2-001-0105-01",
  answers_json: JSON.stringify(resumed.data),
}] });
const uploadedPerson = pushRecord.data.answers_json.hhq_household_members[0];
assert.equal(uploadedPerson.member_registry_uid, person.uid, "the exact exported hdss_unique_id must survive mobile sync");
assert.equal(uploadedPerson.member_registry_individual_id, "001-0105-01-02");
assert.equal(uploadedPerson.member_registry_name, person.name);
assert.equal(uploadedPerson.member_registry_age_years, person.age_years);
assert.equal(uploadedPerson.member_registry_sex, person.sex);
assert.equal(uploadedPerson.member_registry_domicile, person.domicile);

console.log("Validated BHQ registry link snapshots, replacement, unlink, prefill, form wiring, and sync payload.");

// Render the actual native panel composition with real Survey Core questions.
// Native controls are represented as nodes; hooks expose the editor's current state.
const nativeModel = await import("../components/forms/nativeSurveyModel.js");
const mobileConfirmation = await import("../components/forms/renderers/mobileNumberConfirmation.js");
const visitorConfirmation = await import("../components/forms/renderers/bhqVisitorConfirmation.js");
const grade = await import("../components/forms/renderers/hhqHighestGrade.js");
let hookIndex = 0;
let hookState = [0, "edit", false, null];
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  Fragment: "Fragment",
  useState: (initial) => {
    const index = hookIndex++;
    if (!(index in hookState)) hookState[index] = initial;
    return [hookState[index], (value) => { hookState[index] = value; }];
  },
  useEffect: () => {},
  useRef: (current) => ({ current }),
};
const rendererImports = {
  react: fakeReact,
  "react-native": { Alert: {}, Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", View: "View", StyleSheet: { create: (styles) => styles } },
  "@expo/vector-icons/MaterialCommunityIcons": () => null,
  "../nativeSurveyModel.js": nativeModel,
  "./QuestionFrame.js": { controlStyles: {} },
  "./hhqHighestGrade.js": grade,
  "./mobileNumberConfirmation.js": mobileConfirmation,
  "./bhqVisitorConfirmation.js": visitorConfirmation,
  "./bhqRegistryLookup.js": lookup,
  "./BhqRegistryLookupDrawer.js": { BhqRegistryLookupDrawer: function Drawer() {} },
};
const rendererSource = fs.readFileSync(new URL("../components/forms/renderers/DynamicPanelRenderer.js", import.meta.url), "utf8");
const rendererContext = {
  exports: {},
  require: (id) => { assert.ok(id in rendererImports, id); return rendererImports[id]; },
};
vm.runInNewContext(transformSync(rendererSource, {
  babelrc: false, configFile: false,
  plugins: ["@babel/plugin-transform-react-jsx", "@babel/plugin-transform-modules-commonjs"],
}).code, rendererContext);
const renderModel = new Model(prepareQuestionnaireSurveyJson(form));
renderModel.data = { hhq_site_id: 2, hhq_locality_code: "11", hhq_structure_map_id: "0011", hhq_household_members: [{ member_name: "Mohit" }] };
renderModel.user = { locality_code: "02" };
const renderRoster = renderModel.getQuestionByName("hhq_household_members");
const renderPanel = renderRoster.panels[0];
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== "object") return [];
  return [node, ...flatten(node.props?.children)];
}
function renderPanelTree() {
  hookIndex = 0;
  return rendererContext.exports.DynamicPanelRenderer({
    question: renderRoster, locale: "default",
    renderQuestion: (child) => ({ type: "Question", props: { name: child.name } }),
  });
}
let nodes = flatten(renderPanelTree());
let linkControl = nodes.find((node) => node.type?.name === "RegistryLinkControl");
assert.ok(linkControl, "BHQ editor shows Lookup after entering a name");
const nameFragment = nodes.find((node) => node.type === "Fragment" && node.props.children[0]?.props.name === "member_name");
assert.equal(nameFragment.props.children[1], linkControl, "Lookup is immediately after the name input");
const row = nodes.find((node) => node.type?.name === "EntryRow");
assert.equal("onRegistryLookup" in row.props, false, "member summary rows no longer expose Lookup");
linkControl.props.onOpen();
nodes = flatten(renderPanelTree());
assert.equal(nodes.find((node) => node.type?.name === "Drawer").props.panel, renderPanel);
assert.deepEqual(getRegistryLookupPrefill(renderModel, renderPanel), { villageCode: "11", houseNo: "0011", name: "Mohit" });
hookState[3] = null;
renderPanel.getQuestionByName("member_name").value = "  Ankit  ";
linkControl = flatten(renderPanelTree()).find((node) => node.type?.name === "RegistryLinkControl");
linkControl.props.onOpen();
assert.equal(getRegistryLookupPrefill(renderModel, hookState[3]).name, "  Ankit  ", "reopening reads the edited member name");
hookState[3] = null;
renderPanel.getQuestionByName("member_name").value = " ";
assert.equal(flatten(renderPanelTree()).some((node) => node.type?.name === "RegistryLinkControl"), false, "blank names do not expose Lookup");
renderPanel.getQuestionByName("member_name").value = "Mohit";
renderModel.setValue("hhq_site_id", 1);
assert.equal(flatten(renderPanelTree()).some((node) => node.type?.name === "RegistryLinkControl"), false, "other sites keep their existing interview controls");
console.log("Validated Lookup placement after name, current-panel name prefill, reopen, and site isolation.");

// Opening initializes from this panel once; typing in the drawer survives rerenders.
const drawerSource = fs.readFileSync(new URL("../components/forms/renderers/BhqRegistryLookupDrawer.js", import.meta.url), "utf8");
const drawerImports = {
  react: fakeReact,
  "react-native": {
    BackHandler: {}, FlatList: "FlatList", KeyboardAvoidingView: "KeyboardAvoidingView", Modal: "Modal",
    Platform: { OS: "android" }, Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View",
    StyleSheet: { create: (styles) => styles }, useWindowDimensions: () => ({ width: 400 }),
  },
  "@expo/vector-icons/MaterialCommunityIcons": () => null,
  "../../../modules/sync/syncService.js": { getAssignedBlbRegistryVillages: () => ["11", "12"] },
  "../../../modules/households/blbRegistryRepository.js": { searchBlbRegistryPeople: () => [] },
  "./bhqRegistryLookup.js": lookup,
};
const drawerContext = { exports: {}, require: (id) => { assert.ok(id in drawerImports, id); return drawerImports[id]; } };
vm.runInNewContext(transformSync(drawerSource, {
  babelrc: false, configFile: false,
  plugins: ["@babel/plugin-transform-react-jsx", "@babel/plugin-transform-modules-commonjs"],
}).code, drawerContext);
function renderDrawerInputs() {
  hookIndex = 0;
  const tree = drawerContext.exports.BhqRegistryLookupDrawer({ survey: renderModel, panel: renderPanel });
  return flatten(tree).filter((node) => node.type === "TextInput");
}
hookState = [];
let inputs = renderDrawerInputs();
assert.deepEqual(inputs.map((node) => node.props.value), ["11", "0011", "Mohit"]);
inputs[2].props.onChangeText("Rajat, Ankit");
inputs[0].props.onChangeText("12");
inputs[1].props.onChangeText("");
renderPanel.getQuestionByName("member_name").value = "Changed while open";
inputs = renderDrawerInputs();
assert.deepEqual(inputs.map((node) => node.props.value), ["12", "", "Rajat, Ankit"], "manual filters remain editable for the open drawer");
hookState = [];
inputs = renderDrawerInputs();
assert.deepEqual(inputs.map((node) => node.props.value), ["11", "0011", "Changed while open"], "a fresh opening refreshes all three form-prefilled fields");
console.log("Validated drawer initial values, manual name/comma filters, and fresh-open prefill.");
