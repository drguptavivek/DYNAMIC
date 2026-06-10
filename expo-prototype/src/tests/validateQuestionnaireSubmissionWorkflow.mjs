import assert from "node:assert/strict";

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  },
};

const { saveQuestionnaireSubmission } = await import(
  "../modules/questionnaires/questionnaireSubmissionRepository.js"
);
const { buildPushRecords } = await import("../modules/sync/syncWorkflow.js");

const hhqPayload = {
  hhq_site_id: 1,
  hhq_locality_code: 2,
  hhq_structure_map_id: "0042",
  hhq_household_number: "03",
  hhq_household_address: "Test address",
  hhq_household_head_name: "Head Name",
  hhq_consent_study_provide_pis_explain_study_adult_member: 1,
  hhq_interview_date: "2026-09-01",
  hhq_result_interview: 1,
  hhq_language_questionnaire: 1,
  hhq_contact_mobile_numbers: [{ mobile_number: "9999999999" }],
  hhq_household_members: [
    {
      member_line_number: 1,
      member_name: "Head Name",
      member_relationship_to_head: 1,
      member_sex: 1,
      member_age_years: 40,
      member_marital_status: 1,
    },
    {
      member_line_number: 2,
      member_name: "Member Two",
      member_relationship_to_head: 2,
      member_sex: 2,
      member_age_years: 35,
      member_marital_status: 1,
      member_woman_questionnaire_eligible: 1,
    },
  ],
};

const submission = await saveQuestionnaireSubmission({
  formCode: "HHQ",
  formVersion: "9 MAY 2026",
  payload: hhqPayload,
  deviceId: "device-1",
  userId: "fieldworker-1",
});

assert.equal(submission.form_code, "HHQ");
assert.equal(submission.form_version, "9 MAY 2026");
assert.equal(submission.household_id, "1-02-0042-03");
assert.equal(submission.site_id, 1);
assert.equal(submission.locality_code, "02");
assert.equal(submission.subject_type, "household");
assert.equal(submission.subject_id, "1-02-0042-03");
assert.equal(submission.sync_status, "pending");

const visibleSubmissions = JSON.parse(
  window.localStorage.getItem("dynamic_questionnaire_submissions_v1") || "[]",
);
assert.equal(visibleSubmissions.length, 1);
assert.equal(visibleSubmissions[0].submission_id, submission.submission_id);
assert.equal(visibleSubmissions[0].sync_status, "pending");

const webSqliteState = JSON.parse(window.localStorage.getItem("dynamic_web_sqlite_v2") || "{}");
assert.equal(webSqliteState.form_responses.length, 1);
assert.equal(webSqliteState.form_responses[0].id, submission.submission_id);
assert.equal(webSqliteState.form_responses[0].household_id, "1-02-0042-03");
assert.equal(webSqliteState.form_responses[0].subject_type, "household");
assert.equal(webSqliteState.form_responses[0].subject_id, "1-02-0042-03");
assert.equal(webSqliteState.form_responses[0].sync_status, "pending");
assert.equal(webSqliteState.eligible_women.length, 1);
assert.equal(webSqliteState.eligible_women[0].woman_id, "1-02-0042-03-02");
assert.equal(webSqliteState.eligible_women[0].household_member_id, "1-02-0042-03-02");
assert.equal(webSqliteState.eligible_women[0].household_id, "1-02-0042-03");
assert.equal(webSqliteState.eligible_women[0].wq_status, "pending");
assert.equal(webSqliteState.eligible_women[0].tracking_status, "not_tracked");

const wqTasks = webSqliteState.follow_up_tasks.filter((task) => task.task_type === "WQ");
assert.equal(wqTasks.length, 1);
assert.equal(wqTasks[0].household_id, "1-02-0042-03");
assert.match(wqTasks[0].id, /^local-task-[0-9a-f-]{36}$/);
assert.notEqual(wqTasks[0].id, wqTasks[0].task_key);
assert.equal(wqTasks[0].task_key, "1-02-0042-03|person|1-02-0042-03-02|WQ|baseline|2026-09-01|v1");
assert.equal(wqTasks[0].subject_type, "person");
assert.equal(wqTasks[0].subject_id, "1-02-0042-03-02");
assert.equal(wqTasks[0].subject_name, "Member Two");
assert.equal(wqTasks[0].target_date, "2026-09-01");
assert.equal(wqTasks[0].window_end, "2026-10-01");
assert.equal(wqTasks[0].status, "open");

const promotedHouseholds = JSON.parse(window.localStorage.getItem("dynamic_households_v4") || "[]");
assert.equal(promotedHouseholds.length, 1);
assert.equal(promotedHouseholds[0].household_id, "1-02-0042-03");
assert.equal(promotedHouseholds[0].sync_status, "pending");
assert.equal(promotedHouseholds[0].source_form_response_id, submission.submission_id);

const promotedMembers = JSON.parse(
  window.localStorage.getItem("dynamic_household_members_v4") || "[]",
);
assert.equal(promotedMembers.length, 2);
assert.equal(promotedMembers[1].individual_id, "1-02-0042-03-02");
assert.equal(promotedMembers[1].source_form_response_id, submission.submission_id);

const syncRecords = buildPushRecords({ formResponses: webSqliteState.form_responses });
assert.deepEqual(syncRecords, [
  {
    type: "form_response",
    data: {
      ...webSqliteState.form_responses[0],
      form_code: "HHQ",
      form_version: "9 MAY 2026",
      household_id: "1-02-0042-03",
      site_id: 1,
      locality_code: "02",
      subject_type: "household",
      subject_id: "1-02-0042-03",
      answers_json: hhqPayload,
    },
  },
]);

console.log("Validated questionnaire final submission workflow.");
