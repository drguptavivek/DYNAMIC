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
  applyPefBiomarkerSiteRequirements,
  applyPefOnSpotUptSiteVisibility,
  applyPefPregnancyId,
  buildPefBwqBiomarkerPrefill,
  buildPefBwqHealthPrefill,
  buildPefClinicalPrefill,
  buildPefPregnancyId,
  buildPefSourcePrefill,
  derivePefGestationFromLmp,
  derivePefSiteId,
  findPefSourceResponse,
  isPefNegativeUptAnswers,
  resolvePefHusbandName,
  resolvePefLmp,
} from "../lib/pefPrefillHelpers.js";
import {
  normalizeQuestionnaireSurveyData,
  prepareQuestionnaireSurveyJson,
} from "../modules/questionnaires/questionnaireSurveyJsonTransforms.js";
import {
  getVisiblePageQuestions,
  hasNativeValidationProblem,
  setNativeQuestionValue,
  validateNativeQuestionTree,
} from "../components/forms/nativeSurveyModel.js";
import { getNativeKeyboardType } from "../components/forms/renderers/multipleTextValue.js";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import {
  PEF_ANC_CARD_IMAGE_FIELD,
  PEF_ANC_CARD_VISIBLE_FIELD,
  sanitizePefAncCardImage,
  validatePefAncCardImage,
} from "../modules/attachments/pefAncCardImage.js";
import {
  PEF_ULTRASOUND_REPORTS_FIELD,
  isValidUltrasoundDate,
  sanitizePefUltrasoundReports,
  validatePefUltrasoundReports,
} from "../modules/attachments/pefUltrasoundReports.js";

const coded = form.pages[0].elements.filter((element) => element.sourceCode);
assert.equal(form.form_code, "PEF");
assert.equal(form.version, "25 AUGUST 2026");
assert.deepEqual(coded.map((element) => element.sourceCode), [
  "1", "2", "2A", "3", "3B", "4", "5", "6", "7", "8", "9", "10", "11", "14", "15", "16", "17", "17_specifyother", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47",
]);
assert.equal(coded.length, 48);
assert.equal(form.pages[0].elements.some((element) => element.sourceCode === "12"), false);
assert.equal(form.pages[0].elements.some((element) => element.sourceCode === "13"), false);
assert.deepEqual(
  normalizeQuestionnaireSurveyData(form, {
    pef_first_ultrasound_facility: "Legacy facility",
    pef_other_ultrasound_since_first: 2,
    pef_past_30_days_pregnancy_consultation: 1,
  }),
  { pef_past_30_days_pregnancy_consultation: 1 },
  "retired Q12/Q13 values must not survive a restored PEF draft or future submission",
);
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
const pefAncCardRendererSource = readFileSync(
  new URL("../components/forms/renderers/PefAncCardImageRenderer.js", import.meta.url),
  "utf8",
);
const attachmentRepositorySource = readFileSync(
  new URL("../modules/attachments/attachmentRepository.js", import.meta.url),
  "utf8",
);
const attachmentSyncSource = readFileSync(
  new URL("../modules/sync/syncService.js", import.meta.url),
  "utf8",
);
const attachmentUploadClientSource = readFileSync(
  new URL("../modules/attachments/attachmentUploadClient.js", import.meta.url),
  "utf8",
);
const attachmentMigrationSource = readFileSync(
  new URL("../../../deploy/sql/2026-09-19-form-attachment-ultrasound-date.sql", import.meta.url),
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
  /updateImage\(reportIndex, imageIndex, stored\);[\s\S]*restoreUploadFocus\(\)/,
  "a completed image upload must restore the ultrasound section position",
);
assert.match(
  pefAncCardRendererSource,
  /launchCameraAsync[\s\S]*launchImageLibraryAsync/,
  "PEF Q47 Yes must offer one camera/gallery ANC card image control",
);
assert.doesNotMatch(
  pefAncCardRendererSource,
  /Add image|report_count/,
  "PEF Q47 must not offer a second ANC card image",
);
assert.match(
  pefUltrasoundRendererSource,
  /onRequestTopLevelFocus\?\.\(question\.name\)/,
  "the report uploader must focus itself instead of the top of the form",
);
const wqResponse = {
  id: "response-wq-1",
  form_code: "WQ",
  answers_json: {
    wq_husband_partner_name: "Ravi Kumar",
    wq_02_reproduction_when_did_your_last_menstrual_period_start: {
      mode: "relative",
      unit: "weeks",
      value: "8",
    },
    wq_03_other_health_issues_do_you_currently_have_chronic_respiratory: 1,
    wq_03_other_health_issues_do_you_currently_have_goitre_or_any_other: 2,
    wq_03_other_health_issues_do_you_currently_have_any_heart_disease: 8,
    wq_03_other_health_issues_do_you_currently_have_cancer: "1",
    wq_03_other_health_issues_do_you_currently_have_any_chronic_kidney_d: 2,
    wq_03_other_health_issues_do_you_currently_have_anemia: 8,
    wq_height_measured_site_cm: "165.5",
    wq_weight_measured_site_kg: "52.4",
    wq_blood_pressure_measured_site: { systolic: "120", diastolic: "80" },
  },
};
assert.equal(
  findPefSourceResponse([wqResponse], { source_event_id: "event-pregnancy-detected-1" }),
  wqResponse,
  "PEF must fall back to the woman's latest source response when the task stores an event ID",
);
assert.equal(resolvePefHusbandName({}, wqResponse.answers_json), "Ravi Kumar");
assert.deepEqual(resolvePefLmp(wqResponse.answers_json), {
  mode: "relative",
  unit: "weeks",
  value: "8",
});
assert.deepEqual(
  derivePefGestationFromLmp(resolvePefLmp(wqResponse.answers_json)),
  { weeks: "8" },
);
assert.deepEqual(buildPefClinicalPrefill(wqResponse.answers_json), {
  prefill: {
    pef_lmp_start: { mode: "relative", unit: "weeks", value: "8" },
    pef_gestation_unit: { weeks: "8" },
  },
  readOnlyFields: ["pef_lmp_start", "pef_gestation_unit"],
});
const expectedBwqHealthPrefill = {
  prefill: {
    pef_current_chronic_respiratory_disease: 1,
    pef_current_goitre_thyroid_disorder: 2,
    pef_current_heart_disease: 8,
    pef_current_cancer: 1,
    pef_current_chronic_kidney_disorder: 2,
    pef_current_anemia: 8,
  },
  readOnlyFields: [
    "pef_current_chronic_respiratory_disease",
    "pef_current_goitre_thyroid_disorder",
    "pef_current_heart_disease",
    "pef_current_cancer",
    "pef_current_chronic_kidney_disorder",
    "pef_current_anemia",
  ],
};
const expectedBwqBiomarkerPrefill = {
  prefill: {
    pef_weight_kg: "52.4",
    pef_height_cm: "165.5",
    pef_blood_pressure: { systolic: "120", diastolic: "80" },
  },
  readOnlyFields: ["pef_weight_kg", "pef_height_cm", "pef_blood_pressure"],
};
assert.deepEqual(buildPefBwqHealthPrefill(wqResponse.answers_json), expectedBwqHealthPrefill);
assert.deepEqual(
  buildPefBwqBiomarkerPrefill(wqResponse.answers_json),
  expectedBwqBiomarkerPrefill,
);
assert.deepEqual(buildPefBwqBiomarkerPrefill({
  wq_weight_measured_site_kg: "49.5",
  wq_height_measured_site_cm: "",
  wq_blood_pressure_measured_site: { systolic: "120", diastolic: "" },
}), {
  prefill: { pef_weight_kg: "49.5" },
  readOnlyFields: ["pef_weight_kg"],
}, "missing or invalid BWQ biomarker values must leave the matching PEF questions manual");
assert.deepEqual(buildPefBwqHealthPrefill({
  wq_03_other_health_issues_do_you_currently_have_chronic_respiratory: 1,
  wq_03_other_health_issues_do_you_currently_have_goitre_or_any_other: "",
  wq_03_other_health_issues_do_you_currently_have_any_heart_disease: undefined,
  wq_03_other_health_issues_do_you_currently_have_cancer: 99,
}), {
  prefill: { pef_current_chronic_respiratory_disease: 1 },
  readOnlyFields: ["pef_current_chronic_respiratory_disease"],
}, "missing or invalid BWQ health answers must leave the matching PEF questions manual");
assert.deepEqual(buildPefSourcePrefill("wq", wqResponse.answers_json), {
  prefill: {
    pef_lmp_start: { mode: "relative", unit: "weeks", value: "8" },
    pef_gestation_unit: { weeks: "8" },
    ...expectedBwqHealthPrefill.prefill,
    ...expectedBwqBiomarkerPrefill.prefill,
  },
  readOnlyFields: [
    "pef_lmp_start",
    "pef_gestation_unit",
    ...expectedBwqHealthPrefill.readOnlyFields,
    ...expectedBwqBiomarkerPrefill.readOnlyFields,
  ],
});
const psfResponse = {
  id: "response-psf-1",
  form_code: "PSF",
  answers_json: {
    psf_husband_name: "Mohan Lal",
    psf_last_menstrual_period: { mode: "relative", unit: "months", value: "3" },
  },
};
assert.equal(
  findPefSourceResponse([wqResponse, psfResponse], { source_form_response_id: "response-psf-1" }),
  psfResponse,
  "PEF must prefer its explicitly linked source response",
);
assert.equal(resolvePefHusbandName({}, psfResponse.answers_json), "Mohan Lal");
assert.deepEqual(buildPefSourcePrefill("psf", {
  ...psfResponse.answers_json,
  wq_03_other_health_issues_do_you_currently_have_chronic_respiratory: 1,
  wq_weight_measured_site_kg: "52.4",
  wq_height_measured_site_cm: "165.5",
  wq_blood_pressure_measured_site: { systolic: "120", diastolic: "80" },
}), {
  prefill: {
    pef_lmp_start: { mode: "relative", unit: "months", value: "3" },
    pef_gestation_unit: { months: "3" },
  },
  readOnlyFields: ["pef_lmp_start", "pef_gestation_unit"],
});
assert.deepEqual(derivePefGestationFromLmp(resolvePefLmp(psfResponse.answers_json)), { months: "3" });
assert.deepEqual(
  derivePefGestationFromLmp(
    { mode: "date", day: "1", month: "9", year: "2026" },
    new Date(2026, 8, 29),
  ),
  { weeks: "4" },
);
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
function createPefBiomarkerRequirementModel() {
  const questions = Object.fromEntries(
    ["pef_weight_kg", "pef_height_cm", "pef_blood_pressure"]
      .map((name) => [name, { name, isRequired: false }]),
  );
  return {
    questions,
    getQuestionByName(name) {
      return questions[name] || null;
    },
  };
}
for (const siteId of [3, 4]) {
  const requiredModel = createPefBiomarkerRequirementModel();
  assert.equal(
    applyPefBiomarkerSiteRequirements(requiredModel, {
      taskContext: { household_id: `${siteId}-01-0001-01` },
    }),
    true,
  );
  assert.equal(
    Object.values(requiredModel.questions).every((question) => question.isRequired),
    true,
    `PEF Q43-Q45 must be required at site ${siteId}`,
  );
}
for (const siteId of [1, 2]) {
  const optionalModel = createPefBiomarkerRequirementModel();
  for (const question of Object.values(optionalModel.questions)) question.isRequired = true;
  assert.equal(
    applyPefBiomarkerSiteRequirements(optionalModel, {
      taskContext: { household_id: `${siteId}-01-0001-01` },
    }),
    false,
  );
  assert.equal(
    Object.values(optionalModel.questions).every((question) => !question.isRequired),
    true,
    `PEF Q43-Q45 must remain optional at site ${siteId}`,
  );
}
assert.equal(form.pages[0].elements.find((element) => element.sourceCode === "7").visibleIf, "{pef_pregnancy_confirmed_upt} = 2");
assert.match(form.pages[0].elements.find((element) => element.sourceCode === "41").visibleIf, /pef_additional_symptoms/);
assert.equal(isPefNegativeUptAnswers({ [PEF_ON_SPOT_UPT_RESULT_FIELD]: "2" }), true);
assert.equal(isPefNegativeUptAnswers({ [PEF_ON_SPOT_UPT_RESULT_FIELD]: 1 }), false);
const preparedPef = prepareQuestionnaireSurveyJson(form);
const pefMeasurementsModel = createSurveyModel(preparedPef);
for (const [fieldName, validValues, invalidValues] of [
  ["pef_weight_kg", ["45.6", "121.4"], ["9.5", "121.45", "1234.5"]],
  ["pef_height_cm", ["165", "165.5"], ["16.5", "165.55"]],
]) {
  const measurement = pefMeasurementsModel.getQuestionByName(fieldName);
  assert.equal(
    measurement.renderAs,
    "numeric_textbox",
    `PEF ${fieldName} must use the BWQ numeric entry format`,
  );
  assert.equal(measurement.inputType, "text", `PEF ${fieldName} must remain text-backed while editing`);
  assert.equal(getNativeKeyboardType(measurement), "decimal-pad", `PEF ${fieldName} must show a decimal keyboard`);
  setNativeQuestionValue(measurement, validValues[0].split(".")[0] + ".");
  assert.equal(
    measurement.value,
    validValues[0].split(".")[0] + ".",
    `PEF ${fieldName} must retain an in-progress decimal separator`,
  );
  for (const validValue of validValues) {
    measurement.value = validValue;
    assert.equal(
      measurement.validate() !== false && !measurement.errors.length,
      true,
      `PEF ${fieldName} must accept ${validValue}`,
    );
  }
  for (const invalidValue of invalidValues) {
    measurement.value = invalidValue;
    assert.equal(
      measurement.validate() !== false && !measurement.errors.length,
      false,
      `PEF ${fieldName} must reject ${invalidValue}`,
    );
  }
  measurement.value = undefined;
}
const pefBloodPressure = pefMeasurementsModel.getQuestionByName("pef_blood_pressure");
assert.equal(
  pefBloodPressure.getType(),
  "multipletext",
  "PEF Q45 must use separate systolic and diastolic inputs like BWQ",
);
assert.deepEqual(
  pefBloodPressure.items.map((item) => item.name),
  ["systolic", "diastolic"],
);
for (const [value, isValid] of [
  [{ systolic: "095", diastolic: "85" }, true],
  [{ systolic: "123", diastolic: "085" }, true],
  [{ systolic: "95", diastolic: "085" }, false],
  [{ systolic: "095", diastolic: "8" }, false],
  [{ systolic: "1234", diastolic: "085" }, false],
  [{ systolic: "095", diastolic: "1234" }, false],
]) {
  pefBloodPressure.value = value;
  assert.equal(
    pefBloodPressure.validate() !== false && !pefBloodPressure.errors.length,
    isValid,
    `PEF blood pressure validation must ${isValid ? "accept" : "reject"} ${JSON.stringify(value)}`,
  );
}
pefBloodPressure.value = undefined;
const q11Index = preparedPef.pages[0].elements.findIndex(
  (element) => element.name === "pef_first_ultrasound_report",
);
const reportUpload = preparedPef.pages[0].elements[q11Index + 1];
assert.equal(reportUpload.name, PEF_ULTRASOUND_REPORTS_FIELD);
assert.equal(reportUpload.renderAs, "pef_ultrasound_reports");
assert.equal(
  reportUpload.isRequired,
  undefined,
  "PEF report objects must use the attachment validator rather than text-required validation",
);
assert.match(reportUpload.visibleIf, /pef_any_time_during_pregnancy_ultrasound} = 1/);
assert.match(reportUpload.visibleIf, /pef_first_ultrasound_report} = 1/);
const q47Index = preparedPef.pages[0].elements.findIndex(
  (element) => element.name === PEF_ANC_CARD_VISIBLE_FIELD,
);
const ancCardUpload = preparedPef.pages[0].elements[q47Index + 1];
assert.equal(ancCardUpload.name, PEF_ANC_CARD_IMAGE_FIELD);
assert.equal(ancCardUpload.renderAs, "pef_anc_card_image");
assert.match(ancCardUpload.visibleIf, new RegExp(`${PEF_ANC_CARD_VISIBLE_FIELD}.*= 1`));
const completeAncCardImage = {
  attachment_id: "pef-anc-test-1",
  local_uri: "file:///private/anc-card.jpg",
  original_name: "anc-card.jpg",
  mime_type: "image/jpeg",
  file_size: 2345,
};
assert.equal(validatePefAncCardImage(completeAncCardImage), null);
assert.match(validatePefAncCardImage(null), /Upload one image/);
assert.deepEqual(sanitizePefAncCardImage(completeAncCardImage), {
  attachment_id: "pef-anc-test-1",
  original_name: "anc-card.jpg",
  mime_type: "image/jpeg",
  file_size: 2345,
});
assert.equal(validatePefUltrasoundReports({ report_count: 2, reports: [] }), "Add all 2 ultrasound reports.");
assert.equal(isValidUltrasoundDate("2026-02-28"), true);
assert.equal(isValidUltrasoundDate("2026-02-30"), false);
const completeReports = {
  report_count: 1,
  reports: [{
    report_id: "report-1",
    ultrasound_date: "2026-09-18",
    images: [{
      attachment_id: "attachment-1",
      local_uri: "file:///private/report-1.jpg",
      original_name: "camera-1.jpg",
      mime_type: "image/jpeg",
      file_size: 1234,
    }, {
      attachment_id: "attachment-2",
      local_uri: "file:///private/report-2.jpg",
      original_name: "camera-2.jpg",
      mime_type: "image/jpeg",
      file_size: 1235,
    }],
  }],
};
assert.equal(validatePefUltrasoundReports(completeReports), null);
const sanitizedReports = sanitizePefUltrasoundReports(completeReports);
assert.equal(sanitizedReports.reports[0].ultrasound_date, "2026-09-18");
assert.equal(sanitizedReports.reports[0].images.length, 2);
assert.equal(sanitizedReports.reports[0].images[1].image_sequence, 2);
assert.equal(sanitizedReports.reports[0].images[1].original_name, "camera-2.jpg");
assert.equal(sanitizedReports.reports[0].images[0].local_uri, undefined);
assert.equal(sanitizedReports.reports[0].report_name, undefined);
assert.equal(
  validatePefUltrasoundReports({
    ...completeReports,
    reports: [{ ...completeReports.reports[0], ultrasound_date: "" }],
  }),
  "Select a valid ultrasound date for report 1.",
);
assert.equal(
  validatePefUltrasoundReports({
    ...completeReports,
    reports: [{
      ...completeReports.reports[0],
      images: [...completeReports.reports[0].images, completeReports.reports[0].images[0]],
    }],
  }),
  "Add one or two images for report 1.",
);
assert.doesNotMatch(
  pefUltrasoundRendererSource,
  /Enter file name|report_name/,
  "PEF ultrasound uploads must not request a manual image name",
);
assert.match(
  pefUltrasoundRendererSource,
  /Date of ultrasound/,
  "each PEF ultrasound upload must ask for its date",
);
assert.match(
  pefUltrasoundRendererSource,
  /DateTimePicker[\s\S]*maximumDate=\{today\}/,
  "each PEF ultrasound date must use a calendar that prevents future dates",
);
assert.match(
  pefUltrasoundRendererSource,
  /PEF_ULTRASOUND_IMAGES_PER_REPORT_MAX[\s\S]*Add image/,
  "each report must offer an optional second image while enforcing the two-image limit",
);
assert.match(
  attachmentRepositorySource,
  /report_sequence: reportIndex \+ 1[\s\S]*image_sequence: imageIndex \+ 1/,
  "each report image must have independent report and image sequences in offline storage",
);
assert.match(
  attachmentUploadClientSource,
  /image_sequence: String\(attachment\.image_sequence \|\| 1\)/,
  "attachment sync must send the image sequence",
);
assert.match(
  attachmentSyncSource,
  /uploadAttachment\(\{[\s\S]*attachment/,
  "response sync must upload pending attachments before posting the response batch",
);
assert.match(
  attachmentMigrationSource,
  /CHECK \(image_sequence BETWEEN 1 AND 2\)[\s\S]*UNIQUE \(form_response_id, question_name, report_sequence, image_sequence\)/,
  "the production migration must enforce two image slots per ultrasound report",
);
const restoredPefModel = createSurveyModel(preparedPef);
restoredPefModel.onValidateQuestion.add((sender, options) => {
  if (
    options.name === PEF_ULTRASOUND_REPORTS_FIELD &&
    Number(sender.getValue("pef_first_ultrasound_report")) === 1
  ) {
    const message = validatePefUltrasoundReports(
      options.value ?? sender.getValue(PEF_ULTRASOUND_REPORTS_FIELD),
    );
    if (message) options.error = message;
  }
});
restoredPefModel.data = {
  pef_any_time_during_pregnancy_ultrasound: 1,
  pef_first_ultrasound_report: 1,
  [PEF_ULTRASOUND_REPORTS_FIELD]: completeReports,
};
const restoredVisibleNames = getVisiblePageQuestions(restoredPefModel.currentPage)
  .map((question) => question.name);
assert.ok(
  restoredVisibleNames.includes("pef_first_ultrasound_report"),
  "restored Q10 Yes must reveal Q11",
);
assert.ok(
  restoredVisibleNames.includes(PEF_ULTRASOUND_REPORTS_FIELD),
  "restored Q10/Q11 Yes must reveal saved report uploads",
);
assert.equal(restoredPefModel.getQuestionByName("pef_first_ultrasound_facility"), null);
assert.equal(restoredPefModel.getQuestionByName("pef_other_ultrasound_since_first"), null);
const gestationQuestion = restoredPefModel.getQuestionByName("pef_gestation_unit");
const lmpQuestion = restoredPefModel.getQuestionByName("pef_lmp_start");
assert.equal(gestationQuestion.getType(), "multipletext");
assert.equal(gestationQuestion.renderAs, "pregnancy-duration");
assert.equal(lmpQuestion.renderAs, "lmp_timing");
restoredPefModel.setValue("pef_pregnancy_information_source", 1);
assert.equal(gestationQuestion.isVisible, true);
assert.equal(lmpQuestion.isVisible, true);
const careOtherQuestion = restoredPefModel.getQuestionByName(
  "pef_pregnancy_care_location_other_specify",
);
restoredPefModel.setValue("pef_past_30_days_pregnancy_consultation", 1);
restoredPefModel.setValue("pef_pregnancy_care_location", ["A"]);
assert.equal(careOtherQuestion.isVisible, false);
restoredPefModel.setValue("pef_pregnancy_care_location", ["A", "X"]);
assert.equal(careOtherQuestion.isVisible, true);
assert.equal(careOtherQuestion.isRequired, true);
const restoredReportsQuestion = restoredPefModel.getQuestionByName(PEF_ULTRASOUND_REPORTS_FIELD);
restoredPefModel.setValue(PEF_ULTRASOUND_REPORTS_FIELD, {
  report_count: 1,
  reports: [{
    report_id: "missing-image-report",
    ultrasound_date: "2026-09-18",
    images: [{
      attachment_id: "missing-image",
      local_uri: "",
      mime_type: "",
    }],
  }],
});
validateNativeQuestionTree(restoredReportsQuestion);
assert.equal(
  hasNativeValidationProblem(restoredReportsQuestion),
  true,
  "an incomplete restored report upload must still block Next",
);
restoredPefModel.setValue(PEF_ULTRASOUND_REPORTS_FIELD, completeReports);
validateNativeQuestionTree(restoredReportsQuestion);
assert.equal(
  hasNativeValidationProblem(restoredReportsQuestion),
  false,
  "a complete restored report upload must not block Next",
);
assert.match(
  dashboardSource,
  /options\.value \?\? sender\.getValue\(PEF_ULTRASOUND_REPORTS_FIELD\)/,
  "PEF attachment validation must fall back to the current model value",
);
const nativeSurveyRendererSource = readFileSync(
  new URL("../components/forms/NativeSurveyRenderer.js", import.meta.url),
  "utf8",
);
assert.match(
  nativeSurveyRendererSource,
  /const visibleQuestions = getVisiblePageQuestions\(page\)/,
  "restored answers must be reflected without a stale visible-question cache",
);
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
