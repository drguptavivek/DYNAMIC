import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import form from "../data/forms/pregnancy_enrollment_form_v2026.08.25.json" with { type: "json" };
import {
  PEF_NEGATIVE_UPT_VALUE,
  PEF_ON_SPOT_UPT_RESULT_FIELD,
  PEF_OUTCOME_PAGE_NAME,
  PEF_PREGNANCY_ID_FIELD,
  PEF_PREGNANCY_RANK_FIELD,
  PEF_WOMAN_ID_FIELD,
  applyPefOnSpotUptSiteVisibility,
  applyPefPregnancyId,
  buildPefPregnancyId,
  derivePefSiteId,
  findPefSourceResponse,
  isPefNegativeUptAnswers,
  resolvePefHusbandName,
} from "../lib/pefPrefillHelpers.js";
import { prepareQuestionnaireSurveyJson } from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import {
  PEF_ULTRASOUND_REPORTS_FIELD,
  sanitizePefUltrasoundReports,
  validatePefUltrasoundReports,
} from "../modules/attachments/pefUltrasoundReports.js";

const coded = form.pages[0].elements.filter((element) => element.sourceCode);
assert.equal(form.form_code, "PEF");
assert.equal(form.version, "25 AUGUST 2026");
assert.deepEqual(coded.map((element) => element.sourceCode), [
  "1", "2", "2A", "3", "3B", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47",
]);
const q1 = form.pages[0].elements.find((element) => element.sourceCode === "1");
assert.deepEqual(q1.choices.map((item) => item.value), [1, 2, 3, 4]);
assert.equal(q1.readOnly, undefined);
assert.equal(q1.choices.some((item) => item.disabled), false);
const q9 = form.pages[0].elements.find((element) => element.sourceCode === "9");
assert.equal(q9.name, PEF_PREGNANCY_ID_FIELD);
assert.equal(q9.readOnly, true);
assert.equal(buildPefPregnancyId("1-01-0006-11-02", 1), "1-01-0006-11-021");
assert.equal(buildPefPregnancyId("1-01-0006-11-02", 3), "1-01-0006-11-023");
assert.equal(buildPefPregnancyId("", 1), "");
assert.equal(buildPefPregnancyId("1-01-0006-11-02", undefined), "");
const pregnancyIdValues = {
  [PEF_WOMAN_ID_FIELD]: "1-01-0006-11-02",
  [PEF_PREGNANCY_RANK_FIELD]: 2,
};
const pregnancyIdQuestion = { readOnly: false };
const pregnancyIdModel = {
  getQuestionByName(name) {
    return name === PEF_PREGNANCY_ID_FIELD ? pregnancyIdQuestion : null;
  },
  getValue(name) {
    return pregnancyIdValues[name];
  },
  setValue(name, value) {
    pregnancyIdValues[name] = value;
  },
};
assert.equal(applyPefPregnancyId(pregnancyIdModel), "1-01-0006-11-022");
assert.equal(pregnancyIdValues[PEF_PREGNANCY_ID_FIELD], "1-01-0006-11-022");
assert.equal(pregnancyIdQuestion.readOnly, true);
const prefillMapperSource = readFileSync(new URL("../lib/prefillMapper.js", import.meta.url), "utf8");
const dashboardSource = readFileSync(
  new URL("../modules/questionnaires/QuestionnaireDashboard.js", import.meta.url),
  "utf8",
);
const pefUltrasoundRendererSource = readFileSync(
  new URL("../components/forms/renderers/PefUltrasoundReportsRenderer.js", import.meta.url),
  "utf8",
);
const nativeQuestionRendererSource = readFileSync(
  new URL("../components/forms/renderers/NativeQuestionRenderer.js", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  prefillMapperSource,
  /const readOnlyFields = \[\s*"pef_pregnancy_information_source"/,
  "PEF Q1 must not be locked by task prefill",
);
assert.doesNotMatch(
  dashboardSource,
  /function applyPefSourceBehavior/,
  "PEF direct-entry behavior must not disable Q1 choices",
);
assert.doesNotMatch(
  dashboardSource,
  /PEF_ULTRASOUND_FOLLOW_UP_MESSAGE/,
  "PEF Q10 No must not request an ultrasound report upload",
);
assert.match(
  dashboardSource,
  /options\.name === PEF_ULTRASOUND_FIELD[\s\S]*Number\(options\.value\) !== 1[\s\S]*clearValue\(PEF_ULTRASOUND_AVAILABLE_FIELD\)/,
  "PEF Q10 No must clear hidden report answers and uploads",
);
assert.match(
  nativeQuestionRendererSource,
  /PefUltrasoundReportsRenderer[\s\S]*onRequestTopLevelFocus=\{onRequestTopLevelFocus\}/,
  "PEF report uploads must receive the questionnaire focus callback",
);
assert.match(
  pefUltrasoundRendererSource,
  /updateReport\(index, stored\);[\s\S]*restoreUploadFocus\(\)/,
  "a completed image upload must restore the ultrasound section position",
);
assert.match(
  pefUltrasoundRendererSource,
  /onRequestTopLevelFocus\?\.\(question\.name\)/,
  "the report uploader must focus itself instead of the top of the form",
);
const wqResponse = {
  id: "response-wq-1",
  form_code: "WQ",
  answers_json: { wq_husband_partner_name: "Ravi Kumar" },
};
assert.equal(
  findPefSourceResponse([wqResponse], { source_event_id: "event-pregnancy-detected-1" }),
  wqResponse,
  "PEF must fall back to the woman's latest source response when the task stores an event ID",
);
assert.equal(resolvePefHusbandName({}, wqResponse.answers_json), "Ravi Kumar");
const psfResponse = {
  id: "response-psf-1",
  form_code: "PSF",
  answers_json: { psf_husband_name: "Mohan Lal" },
};
assert.equal(
  findPefSourceResponse([wqResponse, psfResponse], { source_form_response_id: "response-psf-1" }),
  psfResponse,
  "PEF must prefer its explicitly linked source response",
);
assert.equal(resolvePefHusbandName({}, psfResponse.answers_json), "Mohan Lal");
assert.equal(derivePefSiteId({ household_id: "1-01-0001-01" }), 1);
assert.equal(derivePefSiteId({ household_id: "3-01-0001-01" }), 3);
function createPefVisibilityModel(initialValue = 1) {
  const question = { visible: true };
  const values = { [PEF_ON_SPOT_UPT_RESULT_FIELD]: initialValue };
  return {
    question,
    values,
    getQuestionByName(name) {
      return name === PEF_ON_SPOT_UPT_RESULT_FIELD ? question : null;
    },
    setValue(name, value) {
      values[name] = value;
    },
  };
}
const bareillyModel = createPefVisibilityModel();
assert.equal(
  applyPefOnSpotUptSiteVisibility(bareillyModel, {
    taskContext: { household_id: "1-01-0001-01" },
  }),
  true,
);
assert.equal(bareillyModel.question.visible, true);
const otherSiteModel = createPefVisibilityModel();
assert.equal(
  applyPefOnSpotUptSiteVisibility(otherSiteModel, {
    taskContext: { household_id: "3-01-0001-01" },
  }),
  false,
);
assert.equal(otherSiteModel.question.visible, false);
assert.equal(otherSiteModel.values[PEF_ON_SPOT_UPT_RESULT_FIELD], undefined);
assert.equal(form.pages[0].elements.find((element) => element.sourceCode === "7").visibleIf, "{pef_pregnancy_confirmed_upt} = 2");
assert.match(form.pages[0].elements.find((element) => element.sourceCode === "41").visibleIf, /pef_additional_symptoms/);
assert.equal(isPefNegativeUptAnswers({ [PEF_ON_SPOT_UPT_RESULT_FIELD]: "2" }), true);
assert.equal(isPefNegativeUptAnswers({ [PEF_ON_SPOT_UPT_RESULT_FIELD]: 1 }), false);
const preparedPef = prepareQuestionnaireSurveyJson(form);
const q11Index = preparedPef.pages[0].elements.findIndex(
  (element) => element.name === "pef_first_ultrasound_report",
);
const reportUpload = preparedPef.pages[0].elements[q11Index + 1];
assert.equal(reportUpload.name, PEF_ULTRASOUND_REPORTS_FIELD);
assert.equal(reportUpload.renderAs, "pef_ultrasound_reports");
assert.equal(reportUpload.isRequired, true);
assert.match(reportUpload.visibleIf, /pef_any_time_during_pregnancy_ultrasound} = 1/);
assert.match(reportUpload.visibleIf, /pef_first_ultrasound_report} = 1/);
assert.equal(validatePefUltrasoundReports({ report_count: 2, reports: [] }), "Add all 2 ultrasound report images.");
const completeReports = {
  report_count: 1,
  reports: [{
    attachment_id: "attachment-1",
    report_name: "First ultrasound",
    local_uri: "file:///private/report.jpg",
    original_name: "camera.jpg",
    mime_type: "image/jpeg",
    file_size: 1234,
  }],
};
assert.equal(validatePefUltrasoundReports(completeReports), null);
assert.equal(sanitizePefUltrasoundReports(completeReports).reports[0].local_uri, undefined);
const preparedQ8 = preparedPef.pages
  .flatMap((page) => page.elements || [])
  .find((element) => element.name === "pef_pregnancy_rank_since_baseline");
assert.match(preparedQ8.visibleIf, new RegExp(`${PEF_ON_SPOT_UPT_RESULT_FIELD}.*!= ${PEF_NEGATIVE_UPT_VALUE}`));
const negativeOutcomePage = preparedPef.pages.find((page) => page.name === PEF_OUTCOME_PAGE_NAME);
assert.ok(negativeOutcomePage, "PEF must include a dedicated Negative UPT outcome page");
assert.equal(
  negativeOutcomePage.visibleIf,
  `{${PEF_ON_SPOT_UPT_RESULT_FIELD}} = ${PEF_NEGATIVE_UPT_VALUE}`,
);
console.log("validateUpdatedPefForm.mjs: all assertions passed");
