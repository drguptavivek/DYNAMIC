/** Verifies native renderer coverage, validation, localization, repeats, and preview modeling. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

const {
  assertNativeSurveySupport,
  buildNativeSurveyPreview,
  getNativeQuestionChoices,
  getNativeQuestionErrors,
  getNativeQuestionTitle,
  getNativeQuestionValue,
  getNativeRendererKind,
  getWqPregnancyDurationSummary,
  getVisiblePageQuestions,
  isNativeInternalPanelField,
  setNativeQuestionValue,
} = await import("../components/forms/nativeSurveyModel.js");
const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);
const { getRegexValidationErrors } = await import(
  "../components/forms/validators/RegexValidator.js"
);
const {
  formatSurveyDate,
  formatSurveyDateDisplay,
  parseSurveyDate,
} = await import("../components/forms/dateValue.js");
const { attachHouseholdSurveyBehaviors, refreshHouseholdSurveyBehaviors } = await import(
  "../lib/householdSurveyBehaviors.js"
);
const { formCatalog, formsByCode } = await import("../data/formCatalog.js");

const root = path.dirname(fileURLToPath(import.meta.url));
const hhqPath = path.resolve(
  root,
  "../data/forms/baseline_household_questionnaire_v2026.05.09.json"
);
const hhq = JSON.parse(fs.readFileSync(hhqPath, "utf8"));
const wqPath = path.resolve(
  root,
  "../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json"
);
const wq = JSON.parse(fs.readFileSync(wqPath, "utf8"));
assert.equal(isNativeInternalPanelField("pregnancy_02_reproduction_pregnancy_group_index"), true);
assert.equal(isNativeInternalPanelField("pregnancy_02_reproduction_multiple_birth_index"), true);
assert.equal(isNativeInternalPanelField("pregnancy_02_reproduction_multiple_birth_count"), true);
assert.equal(isNativeInternalPanelField("pregnancy_02_reproduction_if_i_1_think_back_to_your_first_pregnancy"), false);
assert.equal(getWqPregnancyDurationSummary({ weeks: "38" }), "38 weeks");
assert.equal(getWqPregnancyDurationSummary({ months: "09" }), "09 months");
assert.equal(
  getWqPregnancyDurationSummary({ weeks: "00", months: "09" }),
  "09 months",
  "Legacy drafts with two duration keys should display the meaningful value"
);
const model = new Model(prepareQuestionnaireSurveyJson(hhq));
attachHouseholdSurveyBehaviors(model, hhq);

assert.deepEqual(assertNativeSurveySupport(model), []);
assert.doesNotThrow(() => model.getAllQuestions().map(getNativeRendererKind));
assert.equal(model.pages.length, 4);
assert.ok(getVisiblePageQuestions(model.pages[0]).length > 0);

const structure = model.getQuestionByName("hhq_structure_map_id");
setNativeQuestionValue(structure, "A42B7");
assert.deepEqual(getRegexValidationErrors(structure), []);
setNativeQuestionValue(structure, "1234567");
assert.deepEqual(getRegexValidationErrors(structure), ["Enter 1 to 6 letters or digits."]);
setNativeQuestionValue(structure, "0042");
assert.equal(structure.value, "0042");
assert.equal(model.data.hhq_structure_map_id, "0042");
model.setValue("hhq_household_head_name", "Restored Draft Head");
assert.equal(getNativeQuestionValue(model.getQuestionByName("hhq_household_head_name")), "Restored Draft Head");

assert.equal(formatSurveyDateDisplay("2026-07-28"), "28-Jul-2026");
assert.equal(formatSurveyDate(parseSurveyDate("2026-07-28")), "2026-07-28");
assert.equal(parseSurveyDate("2026-02-30"), null);

const site = model.getQuestionByName("hhq_site_id");
const consent = model.getQuestionByName(
  "hhq_consent_study_provide_pis_explain_study_adult_member"
);
const localizedQuestion = model.getQuestionByName("hhq_residence_area_type");
const defaultLocalizedTitle = getNativeQuestionTitle(localizedQuestion);
model.locale = "hi";
assert.notEqual(getNativeQuestionTitle(localizedQuestion), defaultLocalizedTitle);
model.locale = "default";
setNativeQuestionValue(site, 1);
assert.equal(site.value, 1);
assert.equal(model.data.hhq_site_id, 1);
setNativeQuestionValue(consent, 1);
assert.equal(model.data.hhq_consent_study_provide_pis_explain_study_adult_member, 1);
assert.equal(model.visiblePages.length, 3);

const roster = model.getQuestionByName("hhq_household_members");
assert.equal(roster.dynamicAutoOpenFirstEntry, true);
assert.equal(roster.dynamicHideAddButton, false);
assert.equal(roster.addPanelText, "Add household member");
roster.value = [
  {
    member_name: "Asha",
    member_relationship_to_head: 1,
    member_sex: 2,
    member_residence_duration: { months: 0, years: 20 },
    member_age_years: 25,
    member_marital_status: 1,
  },
];
refreshHouseholdSurveyBehaviors(model, hhq);

const memberPanel = roster.panels[0];
const maritalStatus = memberPanel.getQuestionByName("member_marital_status");
assert.equal(maritalStatus.isVisible, true);
assert.match(getNativeQuestionTitle(maritalStatus), /Asha/);
assert.equal(model.data.hhq_total_household_members, 1);
assert.equal(model.data.hhq_total_eligible_women, 1);

const invalidAge = memberPanel.getQuestionByName("member_age_years");
setNativeQuestionValue(invalidAge, "19");
const refreshedInvalidAge = roster.panels[0].getQuestionByName("member_age_years");
assert.ok(getNativeQuestionErrors(refreshedInvalidAge).length > 0);
setNativeQuestionValue(refreshedInvalidAge, "25");

const preview = buildNativeSurveyPreview(model);
assert.equal(preview[0].name, "page_01_identification");
assert.ok(
  preview.some((page) =>
    page.questions.some(
      (question) =>
        question.name === "hhq_household_members" && question.panelRows.length === 1
    )
  )
);

roster.addPanel();
assert.equal(roster.panelCount, 2);
roster.removePanel(1);
assert.equal(roster.panelCount, 1);

const liveEditorModel = new Model(prepareQuestionnaireSurveyJson(hhq));
attachHouseholdSurveyBehaviors(liveEditorModel, hhq);
liveEditorModel.setValue("hhq_site_id", 1);
liveEditorModel.setValue("hhq_locality_code", "01");
liveEditorModel.setValue("hhq_structure_map_id", "0001");
liveEditorModel.setValue("hhq_household_number", "01");
liveEditorModel.setValue("hhq_interview_date", "2026-09-01");
liveEditorModel.setValue("hhq_competent_respondent_available", 1);
liveEditorModel.setValue("hhq_consent_study_provide_pis_explain_study_adult_member", 1);
const liveRoster = liveEditorModel.getQuestionByName("hhq_household_members");
liveRoster.addPanel();
const livePanel = liveRoster.panels[0];
setNativeQuestionValue(livePanel.getQuestionByName("member_name"), "Jeetu");
const liveResidenceDuration = livePanel.getQuestionByName("member_residence_duration");
setNativeQuestionValue(liveResidenceDuration, { months: 2, years: 5 });
assert.deepEqual(getNativeQuestionValue(liveResidenceDuration, liveEditorModel.data), {
  months: 2,
  years: 5,
});
setNativeQuestionValue(livePanel.getQuestionByName("member_age_years"), "25");
setNativeQuestionValue(livePanel.getQuestionByName("member_sex"), 1);
setNativeQuestionValue(livePanel.getQuestionByName("member_marital_status"), 7);
assert.equal(
  livePanel.getQuestionByName("member_woman_questionnaire_eligible").value,
  2
);
assert.equal(
  liveEditorModel.getValue("hhq_household_members")[0].member_woman_questionnaire_eligible,
  2
);
assert.equal(
  livePanel.getQuestionByName("member_individual_id").value,
  "1-01-0001-01-01"
);

const drinkingWaterSource = model.getQuestionByName(
  "hhq_main_source_drinking_water_members_household_piped_water"
);
assert.equal(getNativeRendererKind(drinkingWaterSource), "grouped-coded-single-select");
setNativeQuestionValue(drinkingWaterSource, 31);
assert.equal(drinkingWaterSource.value, 31);
const waterTreatment = model.getQuestionByName(
  "hhq_household_usually_make_water_safe_drink_anything_else"
);
const waterTreatmentChoices = getNativeQuestionChoices(waterTreatment, "default");
const settleChoiceIndex = waterTreatmentChoices.findIndex((choice) => choice.value === "H");
assert.equal(waterTreatmentChoices[settleChoiceIndex + 1]?.value, "I");
assert.equal(waterTreatmentChoices[settleChoiceIndex + 1]?.text, "Dont Do Anything");
const toiletFacilityType = model.getQuestionByName(
  "hhq_kind_toilet_facility_members_household_usually_use_flush"
);
assert.equal(getNativeRendererKind(toiletFacilityType), "grouped-coded-single-select");
setNativeQuestionValue(toiletFacilityType, 22);
assert.equal(toiletFacilityType.value, 22);
const floorMaterialType = model.getQuestionByName("hhq_main_material_floor_natural_floor");
assert.equal(getNativeRendererKind(floorMaterialType), "grouped-coded-single-select");
setNativeQuestionValue(floorMaterialType, 31);
assert.equal(floorMaterialType.value, 31);
const roofMaterialType = model.getQuestionByName("hhq_main_material_roof_natural_roofing");
assert.equal(getNativeRendererKind(roofMaterialType), "grouped-coded-single-select");
setNativeQuestionValue(roofMaterialType, 35);
assert.equal(roofMaterialType.value, 35);
const wallMaterialType = model.getQuestionByName("hhq_main_material_external_walls_natural_walls");
assert.equal(getNativeRendererKind(wallMaterialType), "grouped-coded-single-select");
setNativeQuestionValue(wallMaterialType, 26);
assert.equal(wallMaterialType.value, 26);

function createOutcomeModel() {
  const outcomeModel = new Model(prepareQuestionnaireSurveyJson(hhq));
  attachHouseholdSurveyBehaviors(outcomeModel, hhq);
  outcomeModel.setValue("hhq_interview_date", "2026-09-01");
  outcomeModel.setValue("hhq_competent_respondent_available", 1);
  outcomeModel.setValue("hhq_consent_study_provide_pis_explain_study_adult_member", 1);
  return outcomeModel;
}

function getOutcomeVisibleValues(outcomeModel) {
  return outcomeModel
    .getQuestionByName("hhq_result_interview")
    .visibleChoices.map((choice) => choice.value);
}

let outcomeModel = createOutcomeModel();
outcomeModel.setValue("hhq_we_like_learn_about_places_that_households_use", 2);
assert.equal(outcomeModel.getValue("hhq_result_interview"), 1);
assert.deepEqual(getOutcomeVisibleValues(outcomeModel), [1]);

outcomeModel = createOutcomeModel();
outcomeModel.setValue("hhq_we_like_learn_about_places_that_households_use", 3);
assert.equal(outcomeModel.getValue("hhq_result_interview"), 1);
assert.deepEqual(getOutcomeVisibleValues(outcomeModel), [1]);

outcomeModel = createOutcomeModel();
outcomeModel.setValue("hhq_we_like_learn_about_places_that_households_use", 4);
assert.equal(outcomeModel.getValue("hhq_result_interview"), 10);
assert.deepEqual(getOutcomeVisibleValues(outcomeModel), [10]);

outcomeModel = createOutcomeModel();
outcomeModel.setValue("hhq_we_like_learn_about_places_that_households_use", 1);
outcomeModel.setValue("hhq_observation_only", ["A"]);
assert.equal(outcomeModel.getValue("hhq_result_interview"), 1);
assert.deepEqual(getOutcomeVisibleValues(outcomeModel), [1]);

for (const formMeta of formCatalog) {
  const catalogForm = formsByCode[formMeta.form_code];
  const catalogModel = new Model(prepareQuestionnaireSurveyJson(catalogForm));
  const unsupported = assertNativeSurveySupport(catalogModel);
  assert.deepEqual(
    unsupported,
    [],
    `${formMeta.form_code} has unsupported native fields: ${unsupported
      .map((item) => `${item.name}:${item.type}`)
      .join(", ")}`
  );
  assert.doesNotThrow(
    () => catalogModel.getAllQuestions().map(getNativeRendererKind),
    `${formMeta.form_code} should map every question to a native renderer`
  );
  for (const question of catalogModel.getAllQuestions()) {
    const type = question.getType?.() || question.type;
    const readOnly = question.readOnly === true || question.isReadOnly === true;
    if (type !== "radiogroup" || readOnly || !question.visibleChoices?.length) continue;
    const firstChoice = question.visibleChoices[0];
    assert.equal(
      setNativeQuestionValue(question, firstChoice.value),
      true,
      `${formMeta.form_code} ${question.name} radio should accept native writes`
    );
    assert.equal(
      String(getNativeQuestionValue(question)),
      String(firstChoice.value),
      `${formMeta.form_code} ${question.name} radio should read back selected value`
    );
  }
}

const wqModel = new Model(prepareQuestionnaireSurveyJson(wq));
const pregnancyGapReview = wqModel.getQuestionByName(
  "pregnancy_02_reproduction_if_row_i_1_were_there_any_other_pregnancie"
);
assert.ok(
  wqModel.getQuestionByName("wq_02_reproduction_have_you_had_any_pregnancies_that_ended_si"),
  "WQ Q22_i final No must have a Q22a follow-up target"
);
const pregnancySinceLast = wqModel.getQuestionByName(
  "wq_02_reproduction_have_you_had_any_pregnancies_that_ended_si"
);
assert.equal(
  getNativeRendererKind(pregnancySinceLast),
  "wq-pregnancy-since-last",
  "WQ Q22a must use the append-pregnancy renderer"
);
const pregnancyHistoryConfirmation = wqModel.getQuestionByName(
  "wq_02_reproduction_read_the_list_of_pregnancy_outcomes_in_ord"
);
assert.equal(
  getNativeRendererKind(pregnancyHistoryConfirmation),
  "wq-pregnancy-history-confirmation",
  "WQ Q22b must use the ordered pregnancy-history confirmation renderer"
);
pregnancyHistoryConfirmation.renderAs = "";
assert.equal(
  getNativeRendererKind(pregnancyHistoryConfirmation),
  "wq-pregnancy-history-confirmation",
  "WQ Q22b must retain its confirmation renderer when synced metadata omits renderAs"
);
const pregnancyOutcomeReview = wqModel.getQuestionByName(
  "pregnancy_02_reproduction_check_16_17_and_21_if_16_i_1_or_17_i_1_the"
);
assert.equal(
  getNativeRendererKind(pregnancyOutcomeReview),
  "wq-pregnancy-outcome-review",
  "WQ Q23_i must use the ordered child-outcome table renderer"
);
pregnancyOutcomeReview.renderAs = "";
assert.equal(
  getNativeRendererKind(pregnancyOutcomeReview),
  "wq-pregnancy-outcome-review",
  "WQ Q23_i must retain its outcome table when synced metadata omits renderAs"
);
const bornAliveChildFollowups = wqModel.getQuestionByName("wq_born_alive_child_followups");
assert.equal(
  getNativeRendererKind(bornAliveChildFollowups),
  "wq-born-alive-child-followups",
  "WQ Q24_i-Q28_i must use the fixed born-alive-child loop renderer"
);
pregnancyGapReview.renderAs = "";
assert.equal(
  getNativeRendererKind(pregnancyGapReview),
  "wq-pregnancy-gap-review",
  "WQ Q22_i must retain its pregnancy review renderer when synced metadata omits renderAs"
);
const womanAvailable = wqModel.getQuestionByName("wq_woman_available");
assert.equal(womanAvailable.readOnly || womanAvailable.isReadOnly, false);
assert.equal(getNativeRendererKind(womanAvailable), "select-one");
assert.equal(setNativeQuestionValue(womanAvailable, 1), true);
assert.equal(womanAvailable.value, 1);
assert.equal(wqModel.data.wq_woman_available, 1);
assert.equal(setNativeQuestionValue(womanAvailable, 2), true);
assert.equal(womanAvailable.value, 2);
assert.equal(wqModel.data.wq_woman_available, 2);
const readOnlyHouseholdHead = wqModel.getQuestionByName("wq_household_head_name");
readOnlyHouseholdHead.readOnly = true;
assert.equal(setNativeQuestionValue(readOnlyHouseholdHead, "Should not write"), false);
assert.notEqual(readOnlyHouseholdHead.value, "Should not write");

console.log("Validated native Survey Core model adapter for HHQ.");
