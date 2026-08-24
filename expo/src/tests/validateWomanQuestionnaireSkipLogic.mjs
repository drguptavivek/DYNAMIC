/** Verifies Excel-derived WQ skip logic in the Survey Core runtime. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model } from "survey-core";

const { prepareQuestionnaireSurveyJson } = await import(
  "../modules/questionnaires/questionnaireSurveyJsonTransforms.js"
);
const {
  WQ_AGE_FIELD,
  WQ_CURRENT_MARITAL_STATUS_FIELD,
  WQ_HYSTERECTOMY_FIELD,
  WQ_LMP_MORE_THAN_SIX_MONTHS_FIELD,
  WQ_LMP_FIELD,
  WQ_NOT_PREGNANT_OR_UNSURE_FIELD,
  WQ_OTHER_PREGNANCIES_FIELD,
  WQ_PREGNANCY_BIRTH_RESULT_FIELD,
  WQ_PREGNANCY_CHILD_LINE_FIELD,
  WQ_PREGNANCY_CHILD_LIVING_WITH_FIELD,
  WQ_PREGNANCY_DEATH_AGE_FIELD,
  WQ_PREGNANCY_DURATION_FIELD,
  WQ_PREGNANCY_OUTCOME_FIELD,
  WQ_PREGNANCY_SIGN_OF_LIFE_FIELD,
  WQ_STERILIZATION_FIELD,
  applyWqDomesticViolenceCalculations,
  applyWqPregnancyHistoryCalculations,
  applyWqReproductionSummary,
  buildWqHusbandPartnerChoices,
  calculateWqDomesticViolencePhysicalCheckValue,
  calculateWqPregnancyHistoryOutcomeValue,
  calculateWqPregnancyTrackingEligibilityValue,
  getWqOutsideHouseholdHusbandLineNumber,
  requestNextWqPregnancy,
  shouldRecalculateWqDomesticViolence,
  shouldRecalculateWqPregnancyHistory,
  shouldRecalculateWqReproductionSummary,
} = await import("../lib/womanSurveyBehaviors.js");
const {
  appendDynamicPanel,
  getNativeQuestionTitle,
  getPanelCommitLabel,
  getWqMultipleBirthRow,
  groupWqPregnancyHistoryPanels,
  shouldShowWqPregnancyHistoryQuestion,
  WQ_MULTIPLE_BIRTH_COUNT_FIELD,
  WQ_MULTIPLE_BIRTH_INDEX_FIELD,
  WQ_PREGNANCY_GROUP_FIELD,
  WQ_PREGNANCY_PLURALITY_FIELD,
} = await import("../components/forms/nativeSurveyModel.js");

const pregnancyActionQuestion = { addPanelText: "Add pregnancy outcome" };
const pregnancyActionPanel = {
  getQuestionByName(name) {
    return {
      value:
        name === WQ_MULTIPLE_BIRTH_COUNT_FIELD || name === WQ_PREGNANCY_PLURALITY_FIELD
          ? 2
          : 1,
    };
  },
};
assert.equal(
  getPanelCommitLabel(pregnancyActionQuestion, pregnancyActionPanel, "add", true),
  "Add child 1"
);
const finalPregnancyActionPanel = {
  getQuestionByName(name) {
    return {
      value:
        name === WQ_MULTIPLE_BIRTH_COUNT_FIELD ||
        name === WQ_PREGNANCY_PLURALITY_FIELD ||
        name === WQ_MULTIPLE_BIRTH_INDEX_FIELD
          ? 2
          : 1,
    };
  },
};
assert.equal(
  getPanelCommitLabel(pregnancyActionQuestion, finalPregnancyActionPanel, "add", true),
  "Add pregnancy outcome"
);
assert.equal(
  getPanelCommitLabel(pregnancyActionQuestion, pregnancyActionPanel, "edit", true),
  "Update child 1"
);
assert.equal(
  getPanelCommitLabel(pregnancyActionQuestion, pregnancyActionPanel, "add", false),
  "Add pregnancy outcome"
);
const appendedPanels = [];
const appendedQuestion = {
  panels: appendedPanels,
  addPanel(index) {
    assert.equal(index, -1, "Dynamic panels should be appended explicitly");
    const panel = { id: `panel-${appendedPanels.length + 1}` };
    appendedPanels.push(panel);
    return panel;
  },
};
const appended = appendDynamicPanel(appendedQuestion);
assert.equal(appended.panel, appendedPanels[0]);
assert.equal(appended.index, 0);
const { normalizeMultipleTextInputValue } = await import(
  "../components/forms/renderers/multipleTextValue.js"
);

const root = path.dirname(fileURLToPath(import.meta.url));
const wqPath = path.resolve(
  root,
  "../data/forms/baseline_woman_s_questionnaire_v2026.05.09.json"
);
const wq = JSON.parse(fs.readFileSync(wqPath, "utf8"));
const wqSection4 = wq.pages.find((page) => page.name === "page_04_husband_background_woman_work");
const wqSection5 = wq.pages.find((page) => page.name === "page_05_domestic_violence");
assert.ok(wqSection4, "Expected WQ Section 4 to exist");
assert.ok(wqSection5, "Expected WQ Section 5 to exist");
assert.deepEqual(
  wqSection4.elements.filter((element) => element.sourceCode).map((element) => element.sourceCode),
  [
    ...Array.from({ length: 11 }, (_, index) => String(index + 1)),
    "11_specifyother",
    ...Array.from({ length: 17 }, (_, index) => String(index + 12)),
  ],
  "WQ Section 4 source codes should be sequential after correcting the duplicate Q23 typo"
);

// Release bundles crash at runtime (not build time) when questionnaire code
// references an undeclared module-level identifier, so pin every WQ_* symbol
// to a declaration or an import in the modules that coordinate WQ behavior.
for (const relativePath of [
  "../modules/questionnaires/QuestionnaireDashboard.js",
  "../components/forms/renderers/DynamicPanelRenderer.js",
]) {
  const sourcePath = path.resolve(root, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const declared = new Set(
    (source.match(/(?:const|let|var|function)\s+(WQ_[A-Z0-9_]+)/g) || []).map(
      (statement) => statement.split(/\s+/)[1]
    )
  );
  for (const identifier of new Set(source.match(/\bWQ_[A-Z0-9_]+\b/g) || [])) {
    assert.ok(
      declared.has(identifier) || source.includes(`  ${identifier},`),
      `${path.basename(sourcePath)} must declare or import "${identifier}"; undeclared identifiers crash release builds`
    );
  }
}

const dynamicPanelRendererSource = fs.readFileSync(
  path.resolve(root, "../components/forms/renderers/DynamicPanelRenderer.js"),
  "utf8"
);
assert.match(
  dynamicPanelRendererSource,
  /onRequestTopLevelFocus\?\.\(question\.name\)/,
  "Saving an intermediate multiple-birth child must return focus to the pregnancy-history panel"
);
const nativeSurveyRendererSource = fs.readFileSync(
  path.resolve(root, "../components/forms/NativeSurveyRenderer.js"),
  "utf8"
);
assert.match(
  nativeSurveyRendererSource,
  /onRequestTopLevelFocus=\{scrollToQuestionByName\}/,
  "The native survey renderer must wire repeat-panel continuation focus to its scroll controller"
);

function createWqModel() {
  return new Model(prepareQuestionnaireSurveyJson(wq));
}

function question(model, name) {
  const item = model.getQuestionByName(name);
  assert.ok(item, `Expected WQ question ${name} to exist`);
  return item;
}

function isVisible(model, name) {
  return question(model, name).isVisible;
}

function addPregnancyHistoryPanel(model) {
  const panelDynamic = question(model, "wq_pregnancy_history");
  panelDynamic.addPanel();
  assert.equal(panelDynamic.panels.length, 1, "Expected one pregnancy-history row");
  return panelDynamic.panels[0];
}

function panelQuestion(panel, name) {
  const item = panel.getQuestionByName(name);
  assert.ok(item, `Expected pregnancy-history question ${name} to exist`);
  return item;
}

const model = createWqModel();

assert.equal(isVisible(model, "wq_consent_study"), false);
assert.equal(isVisible(model, "wq_visit_no"), false);
const interviewDateQuestion = question(model, "wq_interview_date");
assert.equal(interviewDateQuestion.inputType, "date");
assert.equal(interviewDateQuestion.renderAs, "date_picker");
assert.ok(
  !interviewDateQuestion.validators.some((validator) => validator.getType?.() === "numeric"),
  "WQ interview date must not use numeric validation"
);
model.setValue("wq_interview_date", "2026-08-14");
model.setValue("wq_visit_no", 1);
assert.equal(isVisible(model, "wq_visit_no"), true);
model.setValue("wq_woman_available", 1);
assert.equal(isVisible(model, "wq_consent_study"), true);
model.setValue("wq_consent_study", 1);
assert.equal(model.getPageByName("page_outcome").isVisible, true);

const residenceDurationQuestion = question(
  model,
  "wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously"
);
assert.equal(residenceDurationQuestion.getType(), "radiogroup");
assert.equal(residenceDurationQuestion.renderAs, "years_with_special_codes");
assert.equal(residenceDurationQuestion.jsonObj?.inputType, "number");
assert.equal(residenceDurationQuestion.jsonObj?.maxLength, 2);
assert.equal(residenceDurationQuestion.jsonObj?.preserveString, true);
assert.deepEqual(
  residenceDurationQuestion.choices.map((choice) => choice.value),
  [95, 96]
);

const birthMonthYearQuestion = question(
  model,
  "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born"
);
assert.equal(birthMonthYearQuestion.getType(), "multipletext");
assert.deepEqual(
  birthMonthYearQuestion.items.map((item) => ({
    name: item.name,
    inputType: item.inputType,
    maxLength: item.maxLength,
    preserveString: item.jsonObj?.preserveString,
    unknownValue: item.jsonObj?.unknownChoice?.value,
  })),
  [
    { name: "month", inputType: "number", maxLength: 2, preserveString: true, unknownValue: 98 },
    { name: "year", inputType: "number", maxLength: 4, preserveString: true, unknownValue: 9998 },
  ]
);
assert.equal(
  model.getQuestionByName("wq_01_respondent_s_backgr_birth_month_year_unknown"),
  null
);
const ageLastBirthdayQuestion = question(model, "wq_age_last_birthday");
assert.equal(ageLastBirthdayQuestion.inputType, "text");
assert.equal(ageLastBirthdayQuestion.jsonObj?.maxLength, 2);
assert.equal(ageLastBirthdayQuestion.renderAs, "numeric_textbox");

const q4VisitModel = createWqModel();
q4VisitModel.setValue("wq_interview_date", "2026-08-14");
q4VisitModel.setValue("wq_visit_no", 3);
const q4Choices = question(q4VisitModel, "wq_woman_available").visibleChoices.map((choice) => choice.value);
assert.deepEqual(q4Choices, [1, 2, 4]);

const q4IncapacitatedModel = createWqModel();
q4IncapacitatedModel.setValue("wq_interview_date", "2026-08-14");
q4IncapacitatedModel.setValue("wq_visit_no", 1);
q4IncapacitatedModel.setValue("wq_woman_available", 2);
assert.equal(q4IncapacitatedModel.getPageByName("page_02_reproduction").isVisible, false);
assert.equal(q4IncapacitatedModel.getPageByName("page_outcome").isVisible, true);
assert.deepEqual(
  q4IncapacitatedModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [6],
  "Q4 incapacitated must show only the Incapacitated outcome option"
);

const q4PostponedModel = createWqModel();
q4PostponedModel.setValue("wq_interview_date", "2026-08-14");
q4PostponedModel.setValue("wq_visit_no", 1);
q4PostponedModel.setValue("wq_woman_available", 3);
assert.equal(q4PostponedModel.getPageByName("page_02_reproduction").isVisible, false);
assert.equal(q4PostponedModel.getPageByName("page_outcome").isVisible, true);
assert.deepEqual(
  q4PostponedModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [3],
  "Q4 postponed must show only the Posponed outcome option"
);

const q4NotAtHomeModel = createWqModel();
q4NotAtHomeModel.setValue("wq_interview_date", "2026-08-14");
q4NotAtHomeModel.setValue("wq_visit_no", 1);
q4NotAtHomeModel.setValue("wq_woman_available", 4);
assert.equal(q4NotAtHomeModel.getPageByName("page_02_reproduction").isVisible, false);
assert.equal(q4NotAtHomeModel.getPageByName("page_outcome").isVisible, true);
assert.deepEqual(
  q4NotAtHomeModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [2],
  "Q4 not at home must show only the Not at home outcome option"
);

const q5ConsentRefusedModel = createWqModel();
q5ConsentRefusedModel.setValue("wq_interview_date", "2026-08-14");
q5ConsentRefusedModel.setValue("wq_visit_no", 1);
q5ConsentRefusedModel.setValue("wq_woman_available", 1);
q5ConsentRefusedModel.setValue("wq_consent_study", 2);
assert.equal(q5ConsentRefusedModel.getPageByName("page_outcome").isVisible, true);
assert.deepEqual(
  q5ConsentRefusedModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [8],
  "Q5 consent refused must show only the Refused (consent or, refused during interview) outcome option"
);

const q5ConsentYesModel = createWqModel();
q5ConsentYesModel.setValue("wq_interview_date", "2026-08-14");
q5ConsentYesModel.setValue("wq_visit_no", 1);
q5ConsentYesModel.setValue("wq_woman_available", 1);
q5ConsentYesModel.setValue("wq_consent_study", 1);
assert.deepEqual(
  q5ConsentYesModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [1, 2, 3, 4, 5, 6, 8, 7],
  "Q5 consent yes must keep the full outcome option list"
);

const q17NeverMarriedModel = createWqModel();
q17NeverMarriedModel.setValue("wq_interview_date", "2026-08-14");
q17NeverMarriedModel.setValue("wq_visit_no", 1);
q17NeverMarriedModel.setValue("wq_woman_available", 1);
q17NeverMarriedModel.setValue("wq_consent_study", 1);
q17NeverMarriedModel.setValue("wq_current_marital_status", 7);
assert.equal(q17NeverMarriedModel.getPageByName("page_outcome").isVisible, true);
assert.deepEqual(
  q17NeverMarriedModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [1],
  "Q17 never married must show only the Completed outcome option"
);

const biomarkersCompletedModel = createWqModel();
biomarkersCompletedModel.setValue("wq_interview_date", "2026-08-14");
biomarkersCompletedModel.setValue("wq_visit_no", 1);
biomarkersCompletedModel.setValue("wq_woman_available", 1);
biomarkersCompletedModel.setValue("wq_consent_study", 1);
biomarkersCompletedModel.setValue("wq_current_marital_status", 1);
biomarkersCompletedModel.setValue("wq_full_interview_completed", 1);
assert.deepEqual(
  biomarkersCompletedModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [1],
  "full interview completion must show only the Completed outcome option"
);
biomarkersCompletedModel.setValue("wq_woman_available", 2);
assert.deepEqual(
  biomarkersCompletedModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [6],
  "a hard stop after completion must still force its own outcome option"
);

const section2Model = createWqModel();
section2Model.setValue("wq_interview_date", "2026-08-14");
section2Model.setValue("wq_visit_no", 1);
section2Model.setValue("wq_woman_available", 1);
section2Model.setValue("wq_consent_study", 1);
section2Model.setValue("wq_current_marital_status", 1);
section2Model.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 1);
assert.equal(isVisible(section2Model, "wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom"), true);
assert.equal(isVisible(section2Model, "wq_02_reproduction_have_you_ever_given_birth_to_a_boy_or_girl"), true);

section2Model.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 2);
assert.equal(
  isVisible(section2Model, "wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom"),
  false,
  "Q1 no must hide the living-children chain"
);
assert.equal(
  isVisible(section2Model, "wq_02_reproduction_have_you_ever_given_birth_to_a_boy_or_girl"),
  true,
  "Q1 no must keep Q6 reachable as the skip target"
);
assert.equal(
  isVisible(section2Model, "wq_02_reproduction_how_many_boys_have_died"),
  false,
  "Q6-dependent counts must stay hidden while Q6 is unanswered"
);
section2Model.setValue("wq_02_reproduction_have_you_ever_given_birth_to_a_boy_or_girl", 1);
assert.equal(isVisible(section2Model, "wq_02_reproduction_how_many_boys_have_died"), true);

const q17MarriedModel = createWqModel();
q17MarriedModel.setValue("wq_interview_date", "2026-08-14");
q17MarriedModel.setValue("wq_visit_no", 1);
q17MarriedModel.setValue("wq_woman_available", 1);
q17MarriedModel.setValue("wq_consent_study", 1);
q17MarriedModel.setValue("wq_current_marital_status", 1);
assert.deepEqual(
  q17MarriedModel
    .getQuestionByName("wq_result_interview")
    .visibleChoices.map((choice) => choice.value),
  [1, 2, 3, 4, 5, 6, 8, 7],
  "Q17 married must keep the full outcome option list"
);

const wqOutcomeJson = wq.pages
  .find((page) => page.name === "page_outcome")
  .elements.find((element) => element.name === "wq_result_interview");
assert.deepEqual(
  wqOutcomeJson.choices.map((choice) => [choice.value, choice.text.default]),
  [
    [1, "Completed"],
    [2, "Not at home"],
    [3, "Posponed"],
    [4, "Refused"],
    [5, "Partly completed"],
    [6, "Incapacitated"],
    [8, "Refused (consent or, refused during interview)"],
    [7, "Other (specify)"],
  ],
  "Refused-during-interview must sit directly above Other (specify); value 7 stays Other for existing data"
);

const specifyModel = createWqModel();
specifyModel.setValue("wq_interview_date", "2026-08-14");
specifyModel.setValue("wq_visit_no", 1);
specifyModel.setValue("wq_woman_available", 1);
specifyModel.setValue("wq_consent_study", 1);
assert.equal(isVisible(specifyModel, "wq_result_interview_other_specify"), false);
assert.equal(question(specifyModel, "wq_result_interview_other_specify").isRequired, true);
specifyModel.setValue("wq_result_interview", 7);
assert.equal(isVisible(specifyModel, "wq_result_interview_other_specify"), true);
specifyModel.setValue("wq_result_interview", 3);
assert.equal(isVisible(specifyModel, "wq_result_interview_other_specify"), false);

const q4RevisitModel = createWqModel();
q4RevisitModel.setValue("wq_interview_date", "2026-08-14");
q4RevisitModel.setValue("wq_visit_no", 1);
q4RevisitModel.setValue("wq_woman_available", 4);
assert.equal(q4RevisitModel.getPageByName("page_02_reproduction").isVisible, false);
assert.equal(q4RevisitModel.getPageByName("page_outcome").isVisible, true);

assert.equal(
  isVisible(model, "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed"),
  false
);
model.setValue("wq_01_respondent_s_backgr_have_you_ever_attended_school", 1);
assert.equal(
  isVisible(model, "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed"),
  true
);
model.setValue("wq_01_respondent_s_backgr_have_you_ever_attended_school", 2);
assert.equal(
  isVisible(model, "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed"),
  false
);

model.setValue("wq_current_marital_status", 7);
assert.equal(isVisible(model, "wq_husband_partner_name"), false);
assert.equal(model.getPageByName("page_02_reproduction").isVisible, false);
assert.equal(model.getPageByName("page_outcome").isVisible, true);
assert.equal(isVisible(model, "wq_pregnancy_tracking_eligible"), false);
model.setValue("wq_current_marital_status", 1);
assert.equal(isVisible(model, "wq_husband_partner_name"), true);
assert.equal(model.getPageByName("page_02_reproduction").isVisible, true);
assert.equal(question(model, "wq_husband_partner_name").renderAs, "household_member_dropdown");
assert.deepEqual(
  buildWqHusbandPartnerChoices([
    { member_name: "Male Fifteen", sex: 1, age_years: 15, line_number: 1, individual_id: "hh-01" },
    { member_name: "Male Sixteen", sex: 1, age_years: 16, line_number: 2, individual_id: "hh-02" },
    { member_name: "Female Adult", sex: 2, age_years: 30, line_number: 3, individual_id: "hh-03" },
    { member_name: "Male Unknown Age", sex: 1, age_years: null, line_number: 4, individual_id: "hh-04" },
  ]).map((choice) => choice.value),
  ["Male Sixteen", "Husband not in household"]
);
const outsideHusbandMembers = [
  { member_name: "Woman One", sex: 2, age_years: 24, line_number: 1, individual_id: "2-02-0003-01-01" },
  { member_name: "Woman Two", sex: 2, age_years: 30, line_number: 2, individual_id: "2-02-0003-01-02" },
  { member_name: "Woman Three", sex: 2, age_years: 38, line_number: 3, individual_id: "2-02-0003-01-03" },
];
assert.equal(
  getWqOutsideHouseholdHusbandLineNumber({
    members: outsideHusbandMembers,
    currentWomanId: "2-02-0003-01-01",
  }),
  "00"
);
assert.equal(
  getWqOutsideHouseholdHusbandLineNumber({
    members: outsideHusbandMembers,
    currentWomanId: "2-02-0003-01-02",
  }),
  "99"
);
assert.equal(
  getWqOutsideHouseholdHusbandLineNumber({
    members: outsideHusbandMembers,
    currentWomanId: "2-02-0003-01-03",
  }),
  "98"
);
assert.equal(
  buildWqHusbandPartnerChoices(outsideHusbandMembers, {
    currentWomanId: "2-02-0003-01-02",
  }).at(-1).lineNumber,
  "99"
);

model.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 2);
assert.equal(
  isVisible(model, "wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom"),
  false
);
model.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 1);
assert.equal(
  isVisible(model, "wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom"),
  true
);
model.setValue("wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom", 2);
assert.equal(isVisible(model, "wq_02_reproduction_how_many_sons_live_with_you"), false);
model.setValue("wq_02_reproduction_do_you_have_any_sons_or_daughters_to_whom", 1);
assert.equal(isVisible(model, "wq_02_reproduction_how_many_sons_live_with_you"), true);

model.setValue("wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does", 2);
assert.equal(
  isVisible(model, "wq_02_reproduction_how_many_miscarriages_abortions_and_stillb"),
  false
);
model.setValue("wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does", 1);
assert.equal(
  isVisible(model, "wq_02_reproduction_how_many_miscarriages_abortions_and_stillb"),
  true
);

const reproductionSummaryModel = createWqModel();
applyWqReproductionSummary(reproductionSummaryModel);
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_sum_answers_to_3_5_and_7_enter_total_if_no"),
  "00"
);
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_sum_answers_to_8_and_11_and_enter_total_if"),
  "00"
);
assert.equal(reproductionSummaryModel.getValue("wq_02_reproduction_check_12"), 2);
assert.equal(
  question(
    reproductionSummaryModel,
    "wq_02_reproduction_sum_answers_to_3_5_and_7_enter_total_if_no"
  ).isReadOnly,
  true
);
reproductionSummaryModel.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 1);
reproductionSummaryModel.setValue("wq_02_reproduction_how_many_sons_live_with_you", "02");
reproductionSummaryModel.setValue("wq_02_reproduction_how_many_daugthers_live_with_you", "03");
reproductionSummaryModel.setValue(
  "wq_02_reproduction_how_many_sons_are_alive_but_do_not_live_wi",
  "04"
);
reproductionSummaryModel.setValue(
  "wq_02_reproduction_how_many_daugthers_are_alive_but_do_not_li",
  "05"
);
reproductionSummaryModel.setValue("wq_02_reproduction_how_many_boys_have_died", "01");
reproductionSummaryModel.setValue("wq_02_reproduction_how_many_girls_have_died", "02");
reproductionSummaryModel.setValue(
  "wq_02_reproduction_how_many_miscarriages_abortions_and_stillb",
  "03"
);
applyWqReproductionSummary(reproductionSummaryModel);
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_sum_answers_to_3_5_and_7_enter_total_if_no"),
  "17"
);
assert.match(
  getNativeQuestionTitle(
    question(
      reproductionSummaryModel,
      "wq_02_reproduction_check_8_just_to_make_sure_that_i_have_this"
    )
  ),
  /TOTAL 17 births/,
  "Q9 CHECK 8 title must display the calculated Q8 value"
);
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_sum_answers_to_8_and_11_and_enter_total_if"),
  "20"
);
assert.equal(reproductionSummaryModel.getValue("wq_02_reproduction_check_12"), 1);
reproductionSummaryModel.setValue("wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt", 2);
reproductionSummaryModel.setValue("wq_02_reproduction_have_you_ever_given_birth_to_a_boy_or_girl", 2);
applyWqReproductionSummary(reproductionSummaryModel);
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_sum_answers_to_3_5_and_7_enter_total_if_no"),
  "00"
);
assert.equal(reproductionSummaryModel.getValue("wq_02_reproduction_how_many_sons_live_with_you"), "00");
assert.equal(reproductionSummaryModel.getValue("wq_02_reproduction_how_many_daugthers_live_with_you"), "00");
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_how_many_sons_are_alive_but_do_not_live_wi"),
  "00"
);
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_how_many_daugthers_are_alive_but_do_not_li"),
  "00"
);
assert.equal(reproductionSummaryModel.getValue("wq_02_reproduction_how_many_boys_have_died"), "00");
assert.equal(reproductionSummaryModel.getValue("wq_02_reproduction_how_many_girls_have_died"), "00");
reproductionSummaryModel.setValue("wq_02_reproduction_have_you_ever_given_birth_to_a_boy_or_girl", 1);
reproductionSummaryModel.setValue("wq_02_reproduction_how_many_boys_have_died", "01");
reproductionSummaryModel.setValue("wq_02_reproduction_how_many_girls_have_died", "02");
applyWqReproductionSummary(reproductionSummaryModel);
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_sum_answers_to_3_5_and_7_enter_total_if_no"),
  "03",
  "Q8 must sum Q7 after the Excel Q1=No -> Q6 skip path"
);
assert.equal(
  isVisible(reproductionSummaryModel, "wq_02_reproduction_sum_answers_to_3_5_and_7_enter_total_if_no"),
  true,
  "Q8 must be visible once Q6 is answered"
);
reproductionSummaryModel.setValue("wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does", 2);
applyWqReproductionSummary(reproductionSummaryModel);
assert.equal(
  reproductionSummaryModel.getValue("wq_02_reproduction_how_many_miscarriages_abortions_and_stillb"),
  "00",
  "Q11 must save 00 when Q10 is No"
);
assert.equal(
  shouldRecalculateWqReproductionSummary("wq_02_reproduction_how_many_sons_live_with_you"),
  true
);
assert.equal(
  shouldRecalculateWqReproductionSummary("wq_02_reproduction_women_sometimes_have_a_pregnancy_that_does"),
  true
);

model.setValue("wq_02_reproduction_check_12", 2);
assert.equal(isVisible(model, "wq_02_reproduction_compare_12_with_number_of_pregnancy_outcom"), false);
assert.equal(isVisible(model, "wq_02_reproduction_did_you_ever_experience_a_delivery_by_caes"), false);
assert.equal(isVisible(model, "wq_02_reproduction_did_you_ever_have_a_delivery_that_had_comp"), false);
model.setValue("wq_02_reproduction_check_12", 1);
assert.equal(isVisible(model, "wq_02_reproduction_did_you_ever_have_a_delivery_that_had_comp"), true);
model.setValue("wq_02_reproduction_did_you_ever_have_a_delivery_that_had_comp", 2);
assert.equal(isVisible(model, "wq_02_reproduction_what_were_the_complications_mark_all_that"), false);
model.setValue("wq_02_reproduction_did_you_ever_have_a_delivery_that_had_comp", 1);
assert.equal(isVisible(model, "wq_02_reproduction_what_were_the_complications_mark_all_that"), true);

const pregnancyPanel = addPregnancyHistoryPanel(model);
const pregnancyOutcomeDate = panelQuestion(
  pregnancyPanel,
  "pregnancy_02_reproduction_check_16_and_17_type_of_pregnancy_outcome"
);
const pregnancyDuration = panelQuestion(
  pregnancyPanel,
  "pregnancy_02_reproduction_how_long_did_this_pregnancy_last_in_weeks"
);
const pregnancyPlurality = panelQuestion(
  pregnancyPanel,
  "pregnancy_02_reproduction_if_i_1_think_back_to_your_first_pregnancy"
);
const pregnancyOutcome = panelQuestion(
  pregnancyPanel,
  "pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor"
);
const criedMovedBreathed = panelQuestion(
  pregnancyPanel,
  "pregnancy_02_reproduction_did_the_baby_cry_move_or_breathe"
);
const pregnancyBabyName = panelQuestion(
  pregnancyPanel,
  "pregnancy_02_reproduction_what_name_was_given_to_the_baby"
);
const pregnancyBabySex = panelQuestion(
  pregnancyPanel,
  "pregnancy_02_reproduction_is_name_a_boy_or_a_girl"
);
const pregnancyChildAge = question(
  model,
  "pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b"
);
const pregnancyDeathAge = question(model, WQ_PREGNANCY_DEATH_AGE_FIELD);
assert.equal(pregnancyOutcomeDate.isVisible, false);
assert.equal(pregnancyDuration.isVisible, false);
assert.equal(
  wq.pages
    .flatMap((page) => page.elements || [])
    .find((element) => element.name === "wq_pregnancy_history")?.sourceCode,
  "14"
);
const pregnancyHistoryJson = wq.pages
  .flatMap((page) => page.elements || [])
  .find((element) => element.name === "wq_pregnancy_history");
const pregnancyOutcomeJson = pregnancyHistoryJson.templateElements.find(
  (element) => element.name === "pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor"
);
const pregnancyPluralityJson = pregnancyHistoryJson.templateElements.find(
  (element) => element.name === "pregnancy_02_reproduction_if_i_1_think_back_to_your_first_pregnancy"
);
const reproductionPageJson = wq.pages.find((page) => page.name === "page_02_reproduction");
const pregnancyOutcomeCheckJson = reproductionPageJson.elements.find(
  (element) => element.name === WQ_PREGNANCY_OUTCOME_FIELD
);
const otherPregnanciesJson = reproductionPageJson.elements.find(
  (element) => element.name === WQ_OTHER_PREGNANCIES_FIELD
);
const pregnancyGroupJson = pregnancyHistoryJson.templateElements.find(
  (element) => element.name === WQ_PREGNANCY_GROUP_FIELD
);
assert.deepEqual(
  { readOnly: pregnancyGroupJson?.readOnly, visible: pregnancyGroupJson?.visible },
  { readOnly: true, visible: false },
  "Pregnancy group metadata must remain hidden and read-only"
);
assert.equal(pregnancyPluralityJson.sourceCode, "15_i");
assert.deepEqual(
  pregnancyHistoryJson.templateElements.filter((element) => element.sourceCode).map((element) => element.sourceCode),
  ["15_i", "16_i", "17_i", "18_i", "19_i", "20_i", "21_i"],
  "Each repeated pregnancy must contain only Q15_i through Q21_i"
);
assert.equal(pregnancyPlurality.readOnly, false, "Q15_i must remain answerable");
pregnancyPlurality.__nativePanelRowNumber = 1;
assert.match(
  getNativeQuestionTitle(pregnancyPlurality),
  /Think back to your first pregnancy/,
  "Q15_i should use first-pregnancy wording for the first repeat row"
);
const pregnancyHistoryQuestion = question(model, "wq_pregnancy_history");
model.setValue(WQ_OTHER_PREGNANCIES_FIELD, 1);
assert.equal(requestNextWqPregnancy(model), true);
assert.equal(Number.isFinite(pregnancyHistoryQuestion.dynamicAddRequestToken), true);
assert.equal(model.getValue(WQ_OTHER_PREGNANCIES_FIELD), undefined);
pregnancyHistoryQuestion.addPanel();
const secondPregnancyPlurality = panelQuestion(
  pregnancyHistoryQuestion.panels[1],
  "pregnancy_02_reproduction_if_i_1_think_back_to_your_first_pregnancy"
);
secondPregnancyPlurality.__nativePanelRowNumber = 2;
assert.match(
  getNativeQuestionTitle(secondPregnancyPlurality),
  /Think back to your next pregnancy/,
  "Q15_i should use next-pregnancy wording after the first repeat row"
);
assert.equal(pregnancyOutcomeCheckJson.sourceCode, "23_i");
assert.equal(otherPregnanciesJson.sourceCode, "22_i");
assert.deepEqual(
  otherPregnanciesJson.choices.map((choice) => choice.value),
  [1, 2],
  "Q22_i must retain the Excel Yes and No option codes"
);
assert.ok(
  reproductionPageJson.elements.indexOf(otherPregnanciesJson)
    === reproductionPageJson.elements.indexOf(pregnancyHistoryJson) + 1,
  "Q22_i must immediately follow the completed pregnancy editor"
);
assert.deepEqual(
  reproductionPageJson.elements
    .slice(
      reproductionPageJson.elements.indexOf(otherPregnanciesJson),
      reproductionPageJson.elements.indexOf(otherPregnanciesJson) + 7
    )
    .map((element) => element.sourceCode),
  ["22_i", "23_i", "24_i", "25_i", "26_i", "27_i", "28_i"],
  "Q22_i through Q28_i must remain outside the repeat in questionnaire order"
);
assert.equal(pregnancyOutcomeCheckJson.calculated, true);
assert.equal(pregnancyOutcome.getType(), "radiogroup");
assert.equal(pregnancyOutcomeJson.sourceType, "select_one");
assert.deepEqual(
  pregnancyOutcomeJson.choices.map((choice) => choice.value),
  [1, 2, 3, 4],
  "Every Q16_i baby row must keep all four coded outcome options"
);
pregnancyPlurality.value = 1;
assert.match(
  getNativeQuestionTitle(pregnancyOutcome),
  /Was the baby born alive, born dead, or did you have a miscarriage or abortion\?/,
  "Q16_i must use the single-pregnancy wording when Q15_i is Single"
);
pregnancyOutcome.value = 1;
assert.equal(
  criedMovedBreathed.isVisible,
  false,
  "Q16_i born alive must skip Q17_i for that baby"
);
assert.equal(
  panelQuestion(
    pregnancyPanel,
    "pregnancy_02_reproduction_what_name_was_given_to_the_baby"
  ).isVisible,
  true,
  "Q16_i born alive must continue at Q18_i for that baby"
);
pregnancyPlurality.value = 3;
assert.deepEqual(getWqMultipleBirthRow(pregnancyPanel), { count: 3, index: 1, plurality: 3 });
assert.match(
  getNativeQuestionTitle(pregnancyOutcome),
  /Was the first baby in this pregnancy born alive or born dead\?/,
  "Q16_i must use first-baby wording for the first baby of a multiple pregnancy"
);
assert.equal(
  shouldShowWqPregnancyHistoryQuestion(pregnancyPlurality, getWqMultipleBirthRow(pregnancyPanel)),
  true
);
panelQuestion(pregnancyPanel, WQ_MULTIPLE_BIRTH_COUNT_FIELD).value = 3;
panelQuestion(pregnancyPanel, WQ_MULTIPLE_BIRTH_INDEX_FIELD).value = 2;
const secondBabyOutcome = panelQuestion(
  pregnancyHistoryQuestion.panels[1],
  "pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor"
);
panelQuestion(
  pregnancyHistoryQuestion.panels[1],
  WQ_MULTIPLE_BIRTH_COUNT_FIELD
).value = 3;
panelQuestion(
  pregnancyHistoryQuestion.panels[1],
  WQ_MULTIPLE_BIRTH_INDEX_FIELD
).value = 2;
secondBabyOutcome.value = 2;
assert.match(
  getNativeQuestionTitle(secondBabyOutcome),
  /Was the next baby in this pregnancy born alive or born dead\?/,
  "Q16_i must use next-baby wording for later babies of a multiple pregnancy"
);
assert.equal(
  pregnancyOutcome.value,
  1,
  "Baby 1 must retain its own Q16_i answer when baby 2 is recorded"
);
assert.equal(
  secondBabyOutcome.value,
  2,
  "Baby 2 must store its Q16_i answer separately in the same repeat-column field"
);
assert.equal(
  shouldShowWqPregnancyHistoryQuestion(pregnancyPlurality, getWqMultipleBirthRow(pregnancyPanel)),
  false,
  "Continuation rows must start at Q16_i instead of asking Q15_i again"
);
panelQuestion(pregnancyPanel, WQ_MULTIPLE_BIRTH_INDEX_FIELD).value = 3;
function mockPregnancyRow(values) {
  return {
    getQuestionByName(name) {
      return { value: values[name] };
    },
  };
}
const groupedPregnancyRows = groupWqPregnancyHistoryPanels([
  mockPregnancyRow({
    [WQ_PREGNANCY_GROUP_FIELD]: 1,
    [WQ_MULTIPLE_BIRTH_INDEX_FIELD]: 1,
    [WQ_MULTIPLE_BIRTH_COUNT_FIELD]: 2,
  }),
  mockPregnancyRow({
    [WQ_PREGNANCY_GROUP_FIELD]: 1,
    [WQ_MULTIPLE_BIRTH_INDEX_FIELD]: 2,
    [WQ_MULTIPLE_BIRTH_COUNT_FIELD]: 2,
  }),
  mockPregnancyRow({
    [WQ_PREGNANCY_GROUP_FIELD]: 2,
    [WQ_MULTIPLE_BIRTH_INDEX_FIELD]: 1,
    [WQ_MULTIPLE_BIRTH_COUNT_FIELD]: 3,
  }),
  mockPregnancyRow({
    [WQ_PREGNANCY_GROUP_FIELD]: 2,
    [WQ_MULTIPLE_BIRTH_INDEX_FIELD]: 2,
    [WQ_MULTIPLE_BIRTH_COUNT_FIELD]: 3,
  }),
  mockPregnancyRow({
    [WQ_PREGNANCY_GROUP_FIELD]: 2,
    [WQ_MULTIPLE_BIRTH_INDEX_FIELD]: 3,
    [WQ_MULTIPLE_BIRTH_COUNT_FIELD]: 3,
  }),
]);
assert.deepEqual(
  groupedPregnancyRows.map((group) => ({
    babies: group.rows.map((row) => row.multipleBirth.index),
    groupIndex: group.groupIndex,
  })),
  [
    { babies: [1, 2], groupIndex: 1 },
    { babies: [1, 2, 3], groupIndex: 2 },
  ],
  "Twins and triplets must remain grouped under their own pregnancy"
);
pregnancyHistoryQuestion.removePanel(1);
panelQuestion(pregnancyPanel, WQ_MULTIPLE_BIRTH_COUNT_FIELD).value = undefined;
panelQuestion(pregnancyPanel, WQ_MULTIPLE_BIRTH_INDEX_FIELD).value = undefined;
pregnancyPlurality.value = undefined;
assert.equal(pregnancyOutcomeDate.getType(), "multipletext");
assert.deepEqual(pregnancyOutcomeDate.items.map((item) => item.name), ["day", "month", "year"]);
assert.deepEqual(
  pregnancyOutcomeDate.items.map((item) => item.inputType),
  ["text", "text", "text"],
  "Q20_i date components must use text storage so leading zeroes survive native entry"
);
assert.equal(
  normalizeMultipleTextInputValue(pregnancyOutcomeDate.items[1], "02").value,
  "02",
  "Q20_i month must retain its leading zero through the native input pipeline"
);
assert.equal(pregnancyDuration.getType(), "multipletext");
assert.deepEqual(pregnancyDuration.items.map((item) => item.name), ["weeks", "months"]);
assert.deepEqual(
  pregnancyDuration.items.map((item) => ({
    inputType: item.inputType,
    maxLength: item.maxLength,
  })),
  [
    { inputType: "text", maxLength: 2 },
    { inputType: "text", maxLength: 2 },
  ],
  "Q21_i weeks and months must preserve two-digit entries while using the numeric keyboard"
);
pregnancyDuration.value = { weeks: "01", months: "02" };
assert.equal(
  normalizeMultipleTextInputValue(pregnancyDuration.items[0], "01").value,
  "01",
  "Q21_i weeks must retain its leading zero through the native input pipeline"
);
assert.deepEqual(
  pregnancyDuration.value,
  { weeks: "01", months: "02" },
  "Q21_i must retain leading zeroes in weeks and months"
);
pregnancyDuration.value = undefined;
assert.equal(pregnancyDeathAge.getType(), "multipletext");
assert.deepEqual(pregnancyDeathAge.items.map((item) => item.name), ["days", "months", "years"]);
pregnancyOutcome.value = 2;
assert.equal(criedMovedBreathed.isVisible, true);
assert.equal(pregnancyOutcomeDate.isVisible, false);
criedMovedBreathed.value = 2;
assert.equal(pregnancyOutcomeDate.isVisible, true);
assert.equal(pregnancyDuration.isVisible, true);
pregnancyBabyName.value = "Asha";
assert.match(getNativeQuestionTitle(pregnancyOutcomeDate), /Born dead/);
assert.match(getNativeQuestionTitle(pregnancyOutcomeDate), /pregnancy end/);
pregnancyOutcome.value = 1;
assert.match(getNativeQuestionTitle(pregnancyOutcomeDate), /Born alive/);
assert.match(getNativeQuestionTitle(pregnancyOutcomeDate), /Asha born/);
pregnancyBabySex.value = 1;
assert.match(getNativeQuestionTitle(pregnancyChildAge), /Asha at his last birthday/);
assert.match(getNativeQuestionTitle(pregnancyDeathAge), /Asha when he died/);
pregnancyBabySex.value = 2;
assert.match(getNativeQuestionTitle(pregnancyChildAge), /Asha at her last birthday/);
assert.match(getNativeQuestionTitle(pregnancyDeathAge), /Asha when she died/);
pregnancyOutcome.value = 3;
assert.equal(pregnancyOutcomeDate.isVisible, true);
assert.equal(pregnancyDuration.isVisible, true);
assert.match(getNativeQuestionTitle(pregnancyOutcomeDate), /Miscarriage/);
pregnancyDuration.value = { months: "06" };
applyWqPregnancyHistoryCalculations(model);
assert.equal(question(model, WQ_PREGNANCY_OUTCOME_FIELD).value, 3);
assert.deepEqual(pregnancyDuration.value, { months: "06", weeks: "00" });
pregnancyDuration.value = { months: "07" };
applyWqPregnancyHistoryCalculations(model);
assert.equal(question(model, WQ_PREGNANCY_OUTCOME_FIELD).value, 2);
pregnancyOutcome.value = 4;
applyWqPregnancyHistoryCalculations(model);
assert.equal(question(model, WQ_PREGNANCY_OUTCOME_FIELD).value, 4);
assert.match(getNativeQuestionTitle(pregnancyOutcomeDate), /Abortion/);
question(model, WQ_PREGNANCY_CHILD_LIVING_WITH_FIELD).value = 2;
applyWqPregnancyHistoryCalculations(model);
assert.equal(question(model, WQ_PREGNANCY_CHILD_LINE_FIELD).value, "00");
assert.equal(question(model, WQ_PREGNANCY_CHILD_LINE_FIELD).readOnly, true);
question(model, WQ_PREGNANCY_CHILD_LIVING_WITH_FIELD).value = 1;
applyWqPregnancyHistoryCalculations(model);
assert.equal(question(model, WQ_PREGNANCY_CHILD_LINE_FIELD).readOnly, false);
pregnancyOutcome.value = undefined;
criedMovedBreathed.value = undefined;
pregnancyDuration.value = undefined;
applyWqPregnancyHistoryCalculations(model);
assert.equal(question(model, WQ_PREGNANCY_OUTCOME_FIELD).value, undefined);
pregnancyDeathAge.value = { months: "03" };
applyWqPregnancyHistoryCalculations(model);
assert.deepEqual(pregnancyDeathAge.value, { months: "03", days: "00", years: "00" });
assert.equal(
  calculateWqPregnancyHistoryOutcomeValue({
    [WQ_PREGNANCY_BIRTH_RESULT_FIELD]: 2,
    [WQ_PREGNANCY_SIGN_OF_LIFE_FIELD]: 1,
    [WQ_PREGNANCY_DURATION_FIELD]: { weeks: "08" },
  }),
  1
);
assert.equal(shouldRecalculateWqPregnancyHistory(WQ_PREGNANCY_DURATION_FIELD), true);

model.setValue("wq_pregnant", 2);
model.setValue("wq_02_reproduction_when_did_your_last_menstrual_period_start", 995);
assert.equal(
  isVisible(model, "wq_02_reproduction_check_32_if_not_pregnant_or_unsure"),
  false,
  "Q33c must wait until Q33b says LMP was more than 6 months ago"
);
assert.equal(
  isVisible(model, "wq_02_reproduction_some_women_undergo_an_operation_to_remove"),
  false,
  "Q34 must wait until both Q33b and Q33c route to it"
);
model.setValue("wq_02_reproduction_check_33a_if_last_menstrual_period_6_month", 2);
assert.equal(isVisible(model, "wq_02_reproduction_check_32_if_not_pregnant_or_unsure"), false);
assert.equal(isVisible(model, "wq_02_reproduction_some_women_undergo_an_operation_to_remove"), false);
model.setValue("wq_02_reproduction_check_33a_if_last_menstrual_period_6_month", 1);
assert.equal(isVisible(model, "wq_02_reproduction_check_32_if_not_pregnant_or_unsure"), true);
assert.equal(isVisible(model, "wq_02_reproduction_some_women_undergo_an_operation_to_remove"), false);
model.setValue("wq_02_reproduction_check_32_if_not_pregnant_or_unsure", 2);
assert.equal(isVisible(model, "wq_02_reproduction_some_women_undergo_an_operation_to_remove"), false);
model.setValue("wq_02_reproduction_check_32_if_not_pregnant_or_unsure", 1);
assert.equal(isVisible(model, "wq_02_reproduction_some_women_undergo_an_operation_to_remove"), true);

model.setValue("wq_pregnancy_tracking_eligible", 2);
assert.equal(model.getPageByName("page_03_other_health_issues").isVisible, false);
assert.equal(model.getPageByName("page_04_husband_background_woman_work").isVisible, false);
model.setValue("wq_pregnancy_tracking_eligible", 1);
assert.equal(model.getPageByName("page_03_other_health_issues").isVisible, true);
assert.equal(model.getPageByName("page_04_husband_background_woman_work").isVisible, true);

const q38Question = question(model, "wq_pregnancy_tracking_eligible");
assert.equal(q38Question.readOnly, true);
model.setValue("wq_current_marital_status", 2);
assert.equal(isVisible(model, "wq_02_reproduction_are_you_or_your_partner_currently_doing_so"), true);
assert.equal(isVisible(model, "wq_02_reproduction_are_you_or_your_partner_sterilized_probe_w"), true);
assert.equal(isVisible(model, "wq_pregnancy_tracking_eligible"), true);
model.setValue("wq_current_marital_status", 3);
assert.equal(isVisible(model, "wq_pregnancy_tracking_eligible"), false);

assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 30,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 1,
    [WQ_LMP_FIELD]: 995,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  1,
);
assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 30,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 1,
    [WQ_LMP_FIELD]: 995,
    [WQ_LMP_MORE_THAN_SIX_MONTHS_FIELD]: 1,
    [WQ_NOT_PREGNANT_OR_UNSURE_FIELD]: 1,
    [WQ_HYSTERECTOMY_FIELD]: 1,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  2,
);
assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 30,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 1,
    [WQ_LMP_FIELD]: 995,
    [WQ_LMP_MORE_THAN_SIX_MONTHS_FIELD]: 1,
    [WQ_NOT_PREGNANT_OR_UNSURE_FIELD]: 1,
    [WQ_HYSTERECTOMY_FIELD]: 2,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  1,
);
assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 45,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 1,
    [WQ_LMP_FIELD]: 995,
    [WQ_HYSTERECTOMY_FIELD]: 2,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  2,
);
assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 30,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 3,
    [WQ_LMP_FIELD]: 995,
    [WQ_HYSTERECTOMY_FIELD]: 2,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  2,
);
assert.equal(
  calculateWqPregnancyTrackingEligibilityValue({
    [WQ_AGE_FIELD]: 30,
    [WQ_CURRENT_MARITAL_STATUS_FIELD]: 2,
    [WQ_LMP_FIELD]: 994,
    [WQ_HYSTERECTOMY_FIELD]: 2,
    [WQ_STERILIZATION_FIELD]: 4,
  }),
  2,
);

model.setValue("wq_03_other_health_issues_do_you_currently_have_diabetes", 2);
assert.equal(
  isVisible(model, "wq_03_other_health_issues_have_you_sought_treatment_for_this_problem"),
  false
);
model.setValue("wq_03_other_health_issues_do_you_currently_have_diabetes", 1);
assert.equal(
  isVisible(model, "wq_03_other_health_issues_have_you_sought_treatment_for_this_problem"),
  true
);

const alcoholSkipModel = createWqModel();
alcoholSkipModel.setValue("wq_pregnancy_tracking_eligible", 1);
alcoholSkipModel.setValue("wq_woman_available", 1);
alcoholSkipModel.setValue("wq_consent_study", 1);
alcoholSkipModel.setValue("wq_current_marital_status", 1);
const alcoholEverField = "wq_03_other_health_issues_now_i_would_like_to_ask_you_some_questions_2";
const alcoholDaysField = "wq_03_other_health_issues_during_the_last_one_month_on_how_many_days";
const alcoholDrinksField = "wq_03_other_health_issues_we_count_one_drink_of_alcohol_as_one_can_o";
alcoholSkipModel.setValue(alcoholEverField, 2);
assert.equal(isVisible(alcoholSkipModel, alcoholDaysField), false);
assert.equal(isVisible(alcoholSkipModel, alcoholDrinksField), false);
alcoholSkipModel.setValue(alcoholEverField, 1);
alcoholSkipModel.setValue(alcoholDaysField, 0);
assert.equal(isVisible(alcoholSkipModel, alcoholDrinksField), false);
alcoholSkipModel.setValue(alcoholDaysField, 95);
assert.equal(isVisible(alcoholSkipModel, alcoholDrinksField), true);

model.setValue(
  "wq_04_husband_s_backgroun_check_answer_to_marital_status_on_01_respo",
  2
);
assert.equal(
  isVisible(model, "wq_04_husband_s_backgroun_how_old_was_your_husband_on_his_last_birth"),
  false
);
assert.equal(
  isVisible(model, "wq_04_husband_s_backgroun_now_i_would_like_to_ask_you_some_questions"),
  true
);
model.setValue(
  "wq_04_husband_s_backgroun_check_answer_to_marital_status_on_01_respo",
  1
);
assert.equal(
  isVisible(model, "wq_04_husband_s_backgroun_how_old_was_your_husband_on_his_last_birth"),
  true
);

const workHusbandModel = createWqModel();
workHusbandModel.setValue("wq_pregnancy_tracking_eligible", 1);
workHusbandModel.setValue("wq_woman_available", 1);
workHusbandModel.setValue("wq_consent_study", 1);
workHusbandModel.setValue("wq_current_marital_status", 1);
const husbandMaritalCheck =
  "wq_04_husband_s_backgroun_check_answer_to_marital_status_on_01_respo";
const husbandAge = "wq_04_husband_s_backgroun_how_old_was_your_husband_on_his_last_birth";
const husbandSchool = "wq_04_husband_s_backgroun_did_your_last_husband_ever_attend_school";
const husbandOccupation =
  "wq_04_husband_s_backgroun_if_1_1_currently_married_what_is_your_last";
const husbandCigaretteUse =
  "wq_04_husband_s_backgroun_now_i_would_like_to_ask_you_some_questions";
const husbandCigaretteCount =
  "wq_04_husband_s_backgroun_on_average_how_many_cigarettes_does_your_h";
const husbandAlcoholEver =
  "wq_04_husband_s_backgroun_now_i_would_like_to_ask_you_some_questions_2";
const husbandBidiCount =
  "wq_04_husband_s_backgroun_on_average_how_many_bidis_does_your_husban";
const husbandAlcoholDays =
  "wq_04_husband_s_backgroun_during_the_last_one_month_on_how_many_days";
const husbandAlcoholDrinks =
  "wq_04_husband_s_backgroun_we_count_one_drink_of_alcohol_as_one_can_o";
const womanWorkLastSevenDays =
  "wq_04_husband_s_backgroun_aside_from_your_own_housework_have_you_don";
const womanPaidWorkLastSevenDays =
  "wq_04_husband_s_backgroun_as_you_know_some_women_take_up_jobs_for_wh";
const womanAbsentWork =
  "wq_04_husband_s_backgroun_although_you_did_not_work_in_the_last_seve";
const womanWorkLastYear =
  "wq_04_husband_s_backgroun_have_you_done_any_work_in_the_last_12_mont";
const womanOccupation = "wq_04_husband_s_backgroun_what_is_your_occupation_that_is_what_kind";
const womanPaidKind = "wq_04_husband_s_backgroun_are_you_paid_in_cash_or_kind_for_this_work";
const womanEarningsDecision =
  "wq_04_husband_s_backgroun_who_decides_how_the_money_you_earn_will_be";

workHusbandModel.setValue(husbandMaritalCheck, 2);
assert.equal(isVisible(workHusbandModel, husbandAge), false);
assert.equal(isVisible(workHusbandModel, husbandSchool), false);
assert.equal(isVisible(workHusbandModel, husbandOccupation), false);
assert.equal(isVisible(workHusbandModel, husbandCigaretteUse), true);
workHusbandModel.setValue(husbandCigaretteUse, 2);
assert.equal(isVisible(workHusbandModel, husbandCigaretteCount), false);
assert.equal(isVisible(workHusbandModel, husbandAlcoholEver), true);
workHusbandModel.setValue(husbandAlcoholEver, 1);
assert.equal(isVisible(workHusbandModel, husbandAlcoholDays), true);

workHusbandModel.setValue(husbandMaritalCheck, 3);
assert.equal(isVisible(workHusbandModel, husbandAge), false);
assert.equal(isVisible(workHusbandModel, husbandSchool), true);
assert.equal(isVisible(workHusbandModel, husbandOccupation), true);
assert.equal(isVisible(workHusbandModel, husbandCigaretteUse), false);

workHusbandModel.setValue(husbandMaritalCheck, 1);
assert.match(getNativeQuestionTitle(question(workHusbandModel, husbandOccupation)), /^5\. What is your/);
assert.match(getNativeQuestionTitle(question(workHusbandModel, husbandOccupation)), /does he mainly do\?$/);
for (const [fieldName, label] of [
  [husbandAge, "husband age"],
  [husbandCigaretteCount, "cigarette count"],
  [husbandBidiCount, "bidi count"],
]) {
  const item = question(workHusbandModel, fieldName);
  assert.equal(item.inputType, "text", `WQ Section 4 ${label} should preserve leading zeroes`);
  assert.equal(item.maxLength, 2, `WQ Section 4 ${label} should accept only two typed digits`);
  assert.equal(item.renderAs, "numeric_textbox", `WQ Section 4 ${label} should use native numeric textbox`);
  assert.ok(
    item.validators.some(
      (validator) => validator.getType?.() === "regexvalidator" && validator.regex === "^\\d{2}$"
    ),
    `WQ Section 4 ${label} should require exactly two digits`
  );
}
for (const [fieldName, label, expectedSpecialCodes, expectedEntryHint] of [
  [husbandAlcoholDays, "alcohol days", ["00", "95"], "days_with_special_codes"],
  [husbandAlcoholDrinks, "alcohol drinks", ["00"], "years_with_special_codes"],
]) {
  const item = question(workHusbandModel, fieldName);
  assert.equal(item.getType(), "radiogroup", `WQ Section 4 ${label} should keep coded special choices`);
  assert.equal(item.renderAs, expectedEntryHint, `WQ Section 4 ${label} should show a 2-digit entry with special codes`);
  assert.equal(item.jsonObj?.maxLength, 2, `WQ Section 4 ${label} should accept only two typed digits`);
  assert.deepEqual(
    item.choices.map((choice) => String(choice.value)),
    expectedSpecialCodes,
    `WQ Section 4 ${label} should keep the Excel special codes`
  );
}
workHusbandModel.setValue(husbandAlcoholEver, 2);
assert.equal(isVisible(workHusbandModel, husbandAlcoholDays), false);
assert.equal(isVisible(workHusbandModel, husbandAlcoholDrinks), false);
workHusbandModel.setValue(husbandAlcoholEver, 1);
workHusbandModel.setValue(husbandAlcoholDays, "00");
assert.equal(isVisible(workHusbandModel, husbandAlcoholDrinks), false);
workHusbandModel.setValue(husbandAlcoholDays, "95");
assert.equal(
  question(workHusbandModel, husbandAlcoholDays).renderAs,
  "days_with_special_codes",
  "WQ Section 4 Q13 alcohol-days entry must show the Days unit"
);

const husbandHealthDecision = "wq_04_husband_s_backgroun_who_usually_makes_decisions_about_health_c";
assert.equal(
  isVisible(workHusbandModel, husbandHealthDecision),
  true,
  "WQ Section 4 Q22 must stay visible regardless of marital status"
);
assert.deepEqual(
  question(workHusbandModel, husbandHealthDecision).visibleChoices.map((choice) => choice.value),
  [1, 2, 3, 4, 6],
  "WQ Section 4 Q22 shows every option while currently married"
);
for (const otherMarital of [2, 3]) {
  workHusbandModel.setValue(husbandMaritalCheck, otherMarital);
  assert.equal(isVisible(workHusbandModel, husbandHealthDecision), true);
  assert.deepEqual(
    question(workHusbandModel, husbandHealthDecision).visibleChoices.map((choice) => choice.value),
    [2, 3, 4, 6],
    `WQ Section 4 Q22 hides only the Respondent option when marital status is ${otherMarital}`
  );
}
workHusbandModel.setValue(husbandMaritalCheck, 1);

workHusbandModel.setValue(womanWorkLastSevenDays, 1);
assert.equal(isVisible(workHusbandModel, womanPaidWorkLastSevenDays), false);
assert.equal(isVisible(workHusbandModel, womanOccupation), true);
assert.equal(isVisible(workHusbandModel, womanPaidKind), true);
workHusbandModel.setValue(womanPaidKind, 3);
assert.equal(isVisible(workHusbandModel, womanEarningsDecision), false);
workHusbandModel.setValue(womanPaidKind, 1);
assert.equal(isVisible(workHusbandModel, womanEarningsDecision), true);

workHusbandModel.setValue(womanWorkLastSevenDays, 2);
workHusbandModel.setValue(womanPaidWorkLastSevenDays, 2);
workHusbandModel.setValue(womanAbsentWork, 2);
workHusbandModel.setValue(womanWorkLastYear, 2);
assert.equal(isVisible(workHusbandModel, womanOccupation), false);
assert.equal(isVisible(workHusbandModel, womanPaidKind), false);
assert.equal(isVisible(workHusbandModel, womanEarningsDecision), false);

workHusbandModel.setValue(husbandMaritalCheck, 3);
assert.equal(isVisible(workHusbandModel, husbandOccupation), true);
assert.match(getNativeQuestionTitle(question(workHusbandModel, husbandOccupation)), /^5\. What was your/);
assert.match(getNativeQuestionTitle(question(workHusbandModel, husbandOccupation)), /did he mainly do\?$/);

model.setValue("wq_05_domestic_violence_check_for_presence_of_others_do_not_contin", 1);
model.setValue("wq_05_domestic_violence_check_answer_to_marital_status_on_01_respo", 1);
model.setValue("wq_05_domestic_violence_say_or_do_something_to_humiliate_you_in_fr", 2);
assert.equal(
  isVisible(model, "wq_05_domestic_violence_how_often_did_this_happen_in_the_last_12_m"),
  false
);
model.setValue("wq_05_domestic_violence_say_or_do_something_to_humiliate_you_in_fr", 1);
assert.equal(
  isVisible(model, "wq_05_domestic_violence_how_often_did_this_happen_in_the_last_12_m"),
  true
);

const domesticPrivacy = "wq_05_domestic_violence_check_for_presence_of_others_do_not_contin";
const domesticMaritalCheck = "wq_05_domestic_violence_check_answer_to_marital_status_on_01_respo";
const domesticJealous = "wq_05_domestic_violence_he_is_jealous_or_angry_if_you_talk_to_othe";
const domesticPhysicalCheck =
  "wq_05_domestic_violence_check_12a_13a_14a_15a_16a_17a_18a_19a_20a";
const domesticPhysicalPush = "wq_05_domestic_violence_push_you_shake_you_or_throw_something_at_y";
const domesticPhysicalTwist = "wq_05_domestic_violence_twist_your_arm_or_pull_your_hair";
const domesticPhysicalSlap = "wq_05_domestic_violence_slap_you";
const domesticPhysicalPunch =
  "wq_05_domestic_violence_punch_you_with_his_fist_or_with_something";
const domesticPhysicalKick = "wq_05_domestic_violence_kick_you_drag_you_or_beat_you_up";
const domesticPhysicalChoke =
  "wq_05_domestic_violence_try_to_choke_you_or_burn_you_on_purpose";
const domesticPhysicalWeapon =
  "wq_05_domestic_violence_threaten_or_attack_you_with_a_knife_gun_or";
const domesticPhysicalForceAct =
  "wq_05_domestic_violence_physically_force_you_to_perform_any_other";
const domesticPhysicalForceThreats =
  "wq_05_domestic_violence_force_you_with_threats_or_in_any_other_way";
const domesticViolenceYears =
  "wq_05_domestic_violence_how_long_after_you_first_got_married_to_yo";
const domesticRespondentViolence =
  "wq_05_domestic_violence_have_you_ever_hit_slapped_kicked_or_done_a";

const domesticModel = createWqModel();
domesticModel.setValue("wq_woman_available", 1);
domesticModel.setValue("wq_consent_study", 1);
domesticModel.setValue(WQ_CURRENT_MARITAL_STATUS_FIELD, 7);
domesticModel.setValue(domesticPrivacy, 1);
applyWqDomesticViolenceCalculations(domesticModel);
assert.equal(domesticModel.getValue(domesticMaritalCheck), 2);
assert.equal(isVisible(domesticModel, domesticJealous), false);

domesticModel.setValue(WQ_CURRENT_MARITAL_STATUS_FIELD, 1);
applyWqDomesticViolenceCalculations(domesticModel);
assert.equal(domesticModel.getValue(domesticMaritalCheck), 1);
assert.equal(isVisible(domesticModel, domesticJealous), true);
assert.equal(question(domesticModel, domesticMaritalCheck).readOnly, true);

for (const fieldName of [
  domesticPhysicalPush,
  domesticPhysicalTwist,
  domesticPhysicalSlap,
  domesticPhysicalPunch,
  domesticPhysicalKick,
  domesticPhysicalChoke,
  domesticPhysicalWeapon,
  domesticPhysicalForceAct,
  domesticPhysicalForceThreats,
]) {
  domesticModel.setValue(fieldName, 2);
}
applyWqDomesticViolenceCalculations(domesticModel);
assert.equal(domesticModel.getValue(domesticPhysicalCheck), 2);
assert.equal(question(domesticModel, domesticPhysicalCheck).readOnly, true);
assert.equal(isVisible(domesticModel, domesticViolenceYears), false);
assert.equal(isVisible(domesticModel, domesticRespondentViolence), true);

domesticModel.setValue(domesticPhysicalSlap, 1);
applyWqDomesticViolenceCalculations(domesticModel);
assert.equal(domesticModel.getValue(domesticPhysicalCheck), 1);
assert.equal(isVisible(domesticModel, domesticViolenceYears), true);
question(domesticModel, domesticViolenceYears);
const domesticYearsElement = wqSection5.elements.find((element) => element.name === domesticViolenceYears);
assert.equal(domesticYearsElement.renderingHint.render_as, "years_with_special_codes");
assert.equal(domesticYearsElement.maxLength, 2);
assert.equal(domesticYearsElement.preserveString, true);
assert.deepEqual(domesticYearsElement.choices.map((choice) => String(choice.value)), ["95"]);
assert.equal(
  calculateWqDomesticViolencePhysicalCheckValue({
    [domesticPhysicalPush]: 2,
    [domesticPhysicalSlap]: 1,
  }),
  1
);
assert.equal(shouldRecalculateWqDomesticViolence(domesticPhysicalSlap), true);

const panelModel = createWqModel();
panelModel.setValue("wq_woman_available", 1);
panelModel.setValue("wq_consent_study", 1);
panelModel.setValue("wq_current_marital_status", 1);
const history = question(panelModel, "wq_pregnancy_history");
history.addPanel();
const panel = history.panels[0];
const bornAlive = panel.getQuestionByName(
  "pregnancy_02_reproduction_what_name_was_given_to_the_baby"
);
const diedAge = panelModel.getQuestionByName(
  "pregnancy_02_reproduction_if_born_alive_and_now_dead_if_19_i_1_boy_h"
);
assert.ok(bornAlive, "Expected pregnancy-history born-alive follow-up question");
assert.ok(diedAge, "Expected pregnancy-history death-age follow-up question");
panel
  .getQuestionByName("pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor")
  .value = 1;
assert.equal(bornAlive.isVisible, true);
bornAlive.value = "Asha";
assert.ok(
  getNativeQuestionTitle(
    panel.getQuestionByName("pregnancy_02_reproduction_is_name_a_boy_or_a_girl")
  ).includes("Asha"),
  "Pregnancy-history titles should replace (NAME) with Q18_i baby name"
);
applyWqPregnancyHistoryCalculations(panelModel);
panelModel.getQuestionByName("pregnancy_02_reproduction_is_name_still_alive").value = 2;
assert.equal(diedAge.isVisible, true);

await import("../polyfills/surveyCoreNative.js");

const blockedNextModel = createWqModel();
blockedNextModel.setValue("wq_interview_date", "2026-08-14");
blockedNextModel.setValue("wq_visit_no", 1);
blockedNextModel.setValue("wq_woman_available", 1);
blockedNextModel.setValue("wq_consent_study", 1);
blockedNextModel.setValue("wq_current_marital_status", 1);
blockedNextModel.setValue("wq_age_last_birthday", "3");
assert.equal(
  blockedNextModel.nextPage(),
  false,
  "Invalid section answers must block Next without throwing on DOM-less runtimes"
);
assert.equal(blockedNextModel.currentPage.name, "page_01_respondent_background");
assert.ok(
  question(blockedNextModel, "wq_age_last_birthday").errors.some((error) =>
    /2 digits/.test(error.text || "")
  ),
  "Blocked Next must leave the failing validator error on the question"
);
blockedNextModel.setValue("wq_age_last_birthday", "30");
assert.equal(blockedNextModel.nextPage(), true);
assert.equal(blockedNextModel.currentPage.name, "page_02_reproduction");

const {
  getNativeQuestionErrors,
  hasNativeValidationProblem,
} = await import("../components/forms/nativeSurveyModel.js");

const itemErrorModel = createWqModel();
itemErrorModel.setValue("wq_interview_date", "2026-08-14");
itemErrorModel.setValue("wq_visit_no", 1);
itemErrorModel.setValue("wq_woman_available", 1);
itemErrorModel.setValue("wq_consent_study", 1);
itemErrorModel.setValue("wq_current_marital_status", 1);
itemErrorModel.setValue("wq_age_last_birthday", "28");
itemErrorModel.setValue("wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born", {
  month: "2",
  year: "1996",
});
assert.equal(itemErrorModel.nextPage(), false);
assert.equal(itemErrorModel.currentPage.name, "page_01_respondent_background");
const dobQuestion = question(itemErrorModel, "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born");
const monthItem = dobQuestion.items.find((item) => item.name === "month");
assert.equal(
  dobQuestion.errors.length,
  0,
  "multipletext validators report on the item editor, not the parent question"
);
assert.equal(hasNativeValidationProblem(dobQuestion), true);
assert.ok(
  getNativeQuestionErrors(monthItem.editor ?? monthItem).some((text) => /2 digits/.test(text)),
  "Blocked Next must surface the month 2-digit validator error on the item"
);
itemErrorModel.setValue("wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born", {
  month: "02",
  year: "1996",
});
assert.equal(itemErrorModel.nextPage(), true);

// Don't-know sentinels (98 month / 9998 year) must validate cleanly so the
// unknown radio never leaves the item blocked with a pattern error.
const dobUnknownModel = createWqModel();
dobUnknownModel.setValue("wq_interview_date", "2026-08-14");
dobUnknownModel.setValue("wq_visit_no", 1);
dobUnknownModel.setValue("wq_woman_available", 1);
dobUnknownModel.setValue("wq_consent_study", 1);
dobUnknownModel.setValue("wq_current_marital_status", 1);
dobUnknownModel.setValue("wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born", {
  month: "98",
  year: "9998",
});
assert.equal(dobUnknownModel.nextPage(), true);
assert.equal(
  hasNativeValidationProblem(
    question(dobUnknownModel, "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born")
  ),
  false,
  "don't know sentinels must pass item validation"
);
assert.equal(itemErrorModel.currentPage.name, "page_02_reproduction");

// Section 6 biomarker entry formats (user spec):
// Q1 height 3 digits cm, Q2 weight 3 digits + . + 2 digits kg,
// Q3 blood pressure 3/3 digits, Q4 hemoglobin 2 digits.
const biomarkerModel = createWqModel();
const biomarkerFormat = [
  ["wq_height_measured_site_cm", "165", "16"],
  ["wq_weight_measured_site_kg", "121.45", "121.4"],
  ["wq_hemoglobin_measured_site", "01", "1"],
];
for (const [fieldName, validValue, invalidValue] of biomarkerFormat) {
  const item = question(biomarkerModel, fieldName);
  assert.equal(item.renderAs, "numeric_textbox", `WQ Section 6 ${fieldName} must use the string-preserving numeric entry`);
  item.value = validValue;
  assert.equal(item.validate() !== false && !item.errors.length, true, `WQ Section 6 ${fieldName} must accept ${validValue}`);
  item.value = invalidValue;
  assert.equal(item.validate() !== false && !item.errors.length, false, `WQ Section 6 ${fieldName} must reject ${invalidValue}`);
  item.value = undefined;
}
const bloodPressure = question(biomarkerModel, "wq_blood_pressure_measured_site");
assert.equal(bloodPressure.getType(), "multipletext", "WQ Section 6 Q3 must be a systolic/diastolic compound entry");
assert.deepEqual(
  bloodPressure.items.map((item) => item.name),
  ["systolic", "diastolic"]
);
bloodPressure.value = { systolic: "095", diastolic: "085" };
assert.equal(bloodPressure.validate() !== false && !bloodPressure.errors.length, true, "WQ Section 6 Q3 must accept 3/3 digits");
bloodPressure.value = { systolic: "95", diastolic: "085" };
assert.equal(bloodPressure.validate() !== false && !bloodPressure.errors.length, false, "WQ Section 6 Q3 must reject short entries");
bloodPressure.value = undefined;

console.log("Validated WQ Excel-derived skip logic.");
