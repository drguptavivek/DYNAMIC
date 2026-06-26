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
assert.equal(webSqliteState.domain_events_outbox.length, 1);
assert.equal(webSqliteState.domain_events_outbox[0].event_type, "household_baseline_confirmed");
assert.equal(webSqliteState.domain_events_outbox[0].sync_status, "pending");
const baselineEvent = JSON.parse(webSqliteState.domain_events_outbox[0].payload);
assert.equal(baselineEvent.event_type, "household_baseline_confirmed");
assert.equal(baselineEvent.apply_status, "applied");
assert.equal(baselineEvent.household_id, "1-02-0042-03");
assert.equal(baselineEvent.form_response_id, submission.submission_id);
assert.equal(baselineEvent.payload.household_number, "03");
assert.equal(baselineEvent.payload.structure_map_id, "0042");
assert.equal(baselineEvent.payload.baseline_date, "2026-09-01");
assert.equal(baselineEvent.payload.enrollment_status, "enrolled");
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
assert.equal(wqTasks[0].lifecycle_status, "open");

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

const pefTaskContext = {
  id: "local-task-pef-1",
  task_key: "1-02-0042-03|woman|1-02-0042-03-02|PEF|PEF-pregnancy-detected|2026-09-15|v1",
  household_id: "1-02-0042-03",
  subject_type: "woman",
  subject_id: "1-02-0042-03-02",
  woman_id: "1-02-0042-03-02",
  pregnancy_id: "local-pregnancy:1-02-0042-03-02:1",
  task_type: "PEF",
  form_code: "PEF",
};
const pefPayload = {
  household_id: "1-02-0042-03",
  pef_enrollment_date: "2026-09-15",
  pef_any_time_during_pregnancy_ultrasound: 1,
};
const pefSubmission = await saveQuestionnaireSubmission({
  formCode: "PEF",
  formVersion: "11 MAY 2026",
  payload: pefPayload,
  taskId: pefTaskContext.id,
  taskContext: pefTaskContext,
  deviceId: "device-1",
  userId: "fieldworker-1",
});

assert.equal(pefSubmission.form_code, "PEF");
assert.equal(pefSubmission.household_id, "1-02-0042-03");
assert.equal(pefSubmission.subject_type, "woman");
assert.equal(pefSubmission.subject_id, "1-02-0042-03-02");

const webSqliteAfterPef = JSON.parse(window.localStorage.getItem("dynamic_web_sqlite_v2") || "{}");
assert.equal(webSqliteAfterPef.form_responses.length, 2);
assert.equal(webSqliteAfterPef.pregnancies.length, 1);
assert.equal(webSqliteAfterPef.pregnancies[0].pregnancy_id, "local-pregnancy:1-02-0042-03-02:1");
assert.equal(webSqliteAfterPef.pregnancies[0].pregnancy_status, "enrolled");
assert.equal(webSqliteAfterPef.pregnancies[0].source_form_response_id, pefSubmission.submission_id);

const pregnancyEvents = webSqliteAfterPef.domain_events_outbox.filter(
  (event) => event.event_type === "pregnancy_enrolled",
);
assert.equal(pregnancyEvents.length, 1);
const pregnancyEvent = JSON.parse(pregnancyEvents[0].payload);
assert.equal(pregnancyEvent.event_type, "pregnancy_enrolled");
assert.equal(pregnancyEvent.apply_status, "applied");
assert.equal(pregnancyEvent.household_id, "1-02-0042-03");
assert.equal(pregnancyEvent.form_response_id, pefSubmission.submission_id);
assert.equal(pregnancyEvent.payload.pregnancy_id, "local-pregnancy:1-02-0042-03-02:1");
assert.equal(pregnancyEvent.payload.woman_id, "1-02-0042-03-02");
assert.equal(pregnancyEvent.payload.enrollment_date, "2026-09-15");
assert.equal(pregnancyEvent.payload.usg_available, true);

const pffTasks = webSqliteAfterPef.follow_up_tasks.filter((task) => task.task_type === "PFF");
const ufTasks = webSqliteAfterPef.follow_up_tasks.filter((task) => task.task_type === "UF");
assert.ok(pffTasks.length > 0);
assert.equal(ufTasks.length, 1);
assert.equal(pffTasks[0].household_id, "1-02-0042-03");
assert.equal(pffTasks[0].subject_type, "pregnancy");
assert.equal(pffTasks[0].subject_id, "local-pregnancy:1-02-0042-03-02:1");
assert.equal(pffTasks[0].source_event_id, pregnancyEvent.event_id);
assert.equal(ufTasks[0].source_event_id, pregnancyEvent.event_id);

const syncRecords = buildPushRecords({
  formResponses: webSqliteAfterPef.form_responses,
  domainEvents: webSqliteAfterPef.domain_events_outbox,
});
const normalizedPregnancyEvent = syncRecords.find(
  (record) => record.type === "domain_event" && record.data.event_type === "pregnancy_enrolled",
);
assert.ok(normalizedPregnancyEvent);
assert.equal(normalizedPregnancyEvent.data.id, pregnancyEvent.event_id);
assert.equal(normalizedPregnancyEvent.data.form_response_id, pefSubmission.submission_id);
assert.equal(normalizedPregnancyEvent.data.household_id, "1-02-0042-03");
assert.equal(normalizedPregnancyEvent.data.event_datetime, pregnancyEvent.recorded_at);

const hhqSyncRecords = buildPushRecords({ formResponses: [webSqliteState.form_responses[0]] });
const normalizedHhqResponse = syncRecords.find(
  (record) => record.type === "form_response" && record.data.id === submission.submission_id,
);
const normalizedPefResponse = syncRecords.find(
  (record) => record.type === "form_response" && record.data.id === pefSubmission.submission_id,
);
assert.deepEqual(normalizedHhqResponse, {
  type: "form_response",
  data: hhqSyncRecords[0].data,
});
assert.equal(normalizedPefResponse.data.form_code, "PEF");
assert.equal(normalizedPefResponse.data.household_id, "1-02-0042-03");
assert.equal(normalizedPefResponse.data.subject_type, "woman");
assert.equal(normalizedPefResponse.data.subject_id, "1-02-0042-03-02");
const normalizedHhqEvent = syncRecords.find(
  (record) =>
    record.type === "domain_event" && record.data.event_type === "household_baseline_confirmed",
);
assert.ok(normalizedHhqEvent);
assert.equal(normalizedHhqEvent.data.locality_code, "02");
assert.equal(syncRecords.filter((record) => record.type === "domain_event").length, 2);

console.log("Validated questionnaire final submission workflow.");
