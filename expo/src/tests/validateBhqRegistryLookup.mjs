/** Verifies the BHQ registry-link data contract without rendering a screen. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { Model } from "survey-core";
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
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
}), { villageCode: "001", houseNo: "0007" });
assert.deepEqual(getRegistryLookupPrefill({ getValue: () => undefined }), { villageCode: "", houseNo: "" });

const form = JSON.parse(fs.readFileSync(new URL("../data/forms/baseline_household_questionnaire_v2026.05.09.json", import.meta.url), "utf8"));
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
