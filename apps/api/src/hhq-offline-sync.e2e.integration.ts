import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

const WEB_SQLITE_STORAGE_KEY = "dynamic_web_sqlite_v2";
const HOUSEHOLD_STORAGE_KEY = "dynamic_households_v4";
const MEMBER_STORAGE_KEY = "dynamic_household_members_v4";

test("HHQ offline submission creates local WQ workflow, syncs backend, and pulls canonical state", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const localStore = createLocalStorage();
  globalThis.window = { localStorage: localStore } as any;

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { smokeUser, upsertDevSeed } = await import("./dev/dev-seed");
  const { rebuildHhqHouseholdProjection } = await import("./services/eventProcessor");
  // @ts-ignore Expo prototype modules are JavaScript and intentionally imported by this e2e.
  const { saveQuestionnaireSubmission } = await import("../../../expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js");
  // @ts-ignore Expo prototype modules are JavaScript and intentionally imported by this e2e.
  const { buildPushRecords } = await import("../../../expo-prototype/src/modules/sync/syncWorkflow.js");

  await upsertDevSeed();

  const structureMapId = String(randomInt(1000, 9999));
  const householdId = `1-DEV001-${structureMapId}-01`;
  const eligibleMemberId = `${householdId}-02`;
  const wqTaskKey = `${householdId}|person|${eligibleMemberId}|WQ|baseline|2026-09-01|v1`;
  const sinceBeforePush = new Date(Date.now() - 1000).toISOString();
  const hhqPayload = {
    hhq_site_id: 1,
    hhq_locality_code: "DEV001",
    hhq_structure_map_id: structureMapId,
    hhq_household_number: "01",
    hhq_household_address: "E2E HHQ sync address",
    hhq_household_head_name: "E2E Head",
    hhq_consent_study_provide_pis_explain_study_adult_member: 1,
    hhq_interview_date: "2026-09-01",
    hhq_result_interview: 1,
    hhq_language_questionnaire: 1,
    hhq_household_members: [
      {
        member_line_number: 1,
        member_name: "E2E Head",
        member_relationship_to_head: 1,
        member_sex: 1,
        member_age_years: 41,
        member_marital_status: 1,
      },
      {
        member_line_number: 2,
        member_name: "E2E Eligible Woman",
        member_relationship_to_head: 2,
        member_sex: 2,
        member_age_years: 27,
        member_marital_status: 1,
        member_woman_questionnaire_eligible: 1,
      },
      {
        member_line_number: 3,
        member_name: "E2E Not Eligible",
        member_relationship_to_head: 4,
        member_sex: 2,
        member_age_years: 12,
        member_marital_status: 2,
        member_woman_questionnaire_eligible: 0,
      },
    ],
  };

  const submission = await saveQuestionnaireSubmission({
    formCode: "HHQ",
    formVersion: "2026.05.17",
    payload: hhqPayload,
    deviceId: "e2e-device",
  });

  assert.equal(submission.household_id, householdId);
  const localSqliteState = JSON.parse(localStore.getItem(WEB_SQLITE_STORAGE_KEY) || "{}");
  assert.equal(localSqliteState.form_responses.length, 1);
  assert.equal(localSqliteState.form_responses[0].sync_status, "pending");
  assert.deepEqual(
    localSqliteState.eligible_women.map((woman: { woman_id: string }) => woman.woman_id),
    [eligibleMemberId],
  );
  const localWqTasks = localSqliteState.follow_up_tasks.filter(
    (task: { task_type: string }) => task.task_type === "WQ",
  );
  assert.equal(localWqTasks.length, 1);
  assert.match(localWqTasks[0].id, /^local-task-[0-9a-f-]{36}$/);
  assert.equal(localWqTasks[0].task_key, wqTaskKey);
  assert.notEqual(localWqTasks[0].id, localWqTasks[0].task_key);

  const localHouseholds = JSON.parse(localStore.getItem(HOUSEHOLD_STORAGE_KEY) || "[]");
  const localMembers = JSON.parse(localStore.getItem(MEMBER_STORAGE_KEY) || "[]");
  assert.equal(localHouseholds[0].household_id, householdId);
  assert.equal(localMembers.length, 3);

  const pushRecords = buildPushRecords({ formResponses: localSqliteState.form_responses });
  assert.equal(pushRecords.length, 1);
  assert.equal(pushRecords[0].type, "form_response");
  assert.equal(pushRecords[0].data.household_id, householdId);
  assert.equal(pushRecords[0].data.subject_type, "household");
  assert.equal(pushRecords[0].data.subject_id, householdId);

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const login = await fetchData(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: smokeUser.username, password: smokeUser.password }),
    });
    const authorization = `Bearer ${login.access_token}`;

    const pushed = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({ device_id: "e2e-device", records: pushRecords }),
    });
    assert.equal(pushed.accepted, 1);
    assert.deepEqual(pushed.accepted_records, [submission.submission_id]);
    assert.deepEqual(pushed.errors, []);

    const duplicatePush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({ device_id: "e2e-device", records: pushRecords }),
    });
    assert.equal(duplicatePush.accepted, 0);
    assert.deepEqual(duplicatePush.duplicates, [submission.submission_id]);

    const secondResponseId = randomUUID();
    const duplicateCompletionRecords = [
      {
        ...pushRecords[0],
        data: {
          ...pushRecords[0].data,
          id: secondResponseId,
          answers_json: {
            ...pushRecords[0].data.answers_json,
            hhq_household_head_name: "Duplicate Head Should Not Project",
          },
          submitted_at: "2026-09-01T12:00:00.000Z",
        },
      },
    ];
    const duplicateCompletionPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({ device_id: "e2e-device-2", records: duplicateCompletionRecords }),
    });
    assert.equal(duplicateCompletionPush.accepted, 1);
    assert.deepEqual(duplicateCompletionPush.accepted_records, [secondResponseId]);
    assert.deepEqual(duplicateCompletionPush.errors, []);

    const backendHousehold = await db
      .select()
      .from(schema.households)
      .where(eq(schema.households.household_id, householdId));
    assert.equal(backendHousehold.length, 1);
    assert.equal(backendHousehold[0].household_head_name, "E2E Head");

    const duplicateFormResponse = await db
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.form_response_id, secondResponseId));
    assert.equal(duplicateFormResponse.length, 1);
    assert.equal(duplicateFormResponse[0].response_status, "duplicate");

    const hhqEvents = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.household_id, householdId));
    assert.equal(
      hhqEvents.filter(
        (event) =>
          event.event_type === "household_baseline_confirmed" &&
          event.apply_status === "applied",
      ).length,
      1,
    );
    assert.equal(
      hhqEvents.filter(
        (event) =>
          event.form_response_id === secondResponseId && event.apply_status === "held_duplicate",
      ).length,
      1,
    );
    const duplicateFlags = await db
      .select()
      .from(schema.dataQualityFlags)
      .where(eq(schema.dataQualityFlags.duplicate_response_id, secondResponseId));
    assert.equal(duplicateFlags.length, 1);
    assert.equal(duplicateFlags[0].flag_type, "duplicate_task_completion");
    assert.equal(duplicateFlags[0].primary_response_id, submission.submission_id);

    await db
      .update(schema.households)
      .set({
        household_number: "99",
        structure_map_id: "9999",
        baseline_enrollment_status: "pending",
      })
      .where(eq(schema.households.household_id, householdId));
    await rebuildHhqHouseholdProjection(householdId);
    const replayedHousehold = await db
      .select()
      .from(schema.households)
      .where(eq(schema.households.household_id, householdId));
    assert.equal(replayedHousehold.length, 1);
    assert.equal(replayedHousehold[0].household_number, "01");
    assert.equal(replayedHousehold[0].structure_map_id, structureMapId);
    assert.equal(replayedHousehold[0].baseline_enrollment_status, "enrolled");
    assert.equal(replayedHousehold[0].household_head_name, "E2E Head");

    const backendMembers = await db
      .select()
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.household_id, householdId));
    assert.equal(backendMembers.length, 3);
    assert.equal(
      backendMembers.filter((member) => member.woman_questionnaire_eligible).length,
      1,
    );

    const backendEligibleWomen = await db
      .select()
      .from(schema.eligibleWomen)
      .where(eq(schema.eligibleWomen.household_member_id, eligibleMemberId));
    assert.equal(backendEligibleWomen.length, 1);
    assert.equal(backendEligibleWomen[0].woman_id, eligibleMemberId);
    assert.equal(backendEligibleWomen[0].wq_status, "pending");
    assert.equal(backendEligibleWomen[0].tracking_status, "not_tracked");

    const backendWqTasks = await db
      .select()
      .from(schema.followUpTasks)
      .where(eq(schema.followUpTasks.task_key, wqTaskKey));
    assert.equal(backendWqTasks.length, 1);
    assert.match(backendWqTasks[0].task_id, /^[0-9a-f-]{36}$/);
    assert.equal(backendWqTasks[0].subject_id, eligibleMemberId);
    assert.equal(backendWqTasks[0].form_code, "WQ");
    assert.equal(backendWqTasks[0].target_date, "2026-09-01");
    assert.equal(backendWqTasks[0].deadline_date, "2026-10-01");

    const wqResponseId = randomUUID();
    const wqPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        device_id: "e2e-device",
        records: [
          {
            type: "form_response",
            data: {
              id: wqResponseId,
              task_id: backendWqTasks[0].task_id,
              form_code: "WQ",
              form_version: "2026.05.17",
              household_id: householdId,
              site_id: 1,
              locality_code: "DEV001",
              subject_type: "woman",
              subject_id: eligibleMemberId,
              answers_json: {
                household_id: householdId,
                wq_pregnant: 1,
              },
              submitted_at: "2026-09-15T09:00:00.000Z",
            },
          },
        ],
      }),
    });
    assert.equal(wqPush.accepted, 1);
    assert.deepEqual(wqPush.errors, []);

    const activePregnancies = await db
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.household_member_id, eligibleMemberId));
    assert.equal(activePregnancies.length, 1);
    assert.equal(activePregnancies[0].pregnancy_status, "active");

    const backendPefTasks = (await db
      .select()
      .from(schema.followUpTasks)
      .where(eq(schema.followUpTasks.household_id, householdId))).filter(
      (task) => task.task_type === "PEF" && task.subject_id === eligibleMemberId,
    );
    assert.equal(backendPefTasks.length, 1);

    const pefSubmission = await saveQuestionnaireSubmission({
      formCode: "PEF",
      formVersion: "2026.05.17",
      payload: {
        household_id: householdId,
        pef_enrollment_date: "2026-09-15",
        pef_any_time_during_pregnancy_ultrasound: 1,
      },
      taskId: backendPefTasks[0].task_id,
      taskContext: {
        id: backendPefTasks[0].task_id,
        task_key: backendPefTasks[0].task_key,
        household_id: householdId,
        subject_type: backendPefTasks[0].subject_type,
        subject_id: eligibleMemberId,
        woman_id: eligibleMemberId,
        pregnancy_id: activePregnancies[0].pregnancy_id,
        task_type: "PEF",
        form_code: "PEF",
      },
      deviceId: "e2e-device",
    });

    const localStateAfterPef = JSON.parse(localStore.getItem(WEB_SQLITE_STORAGE_KEY) || "{}");
    const localPefResponse = localStateAfterPef.form_responses.find(
      (response: { id: string }) => response.id === pefSubmission.submission_id,
    );
    assert.ok(localPefResponse);
    const localPefEvent = localStateAfterPef.domain_events_outbox.find(
      (event: { event_type: string }) => event.event_type === "pregnancy_enrolled",
    );
    assert.ok(localPefEvent);

    const pefPushRecords = buildPushRecords({
      formResponses: [localPefResponse],
      domainEvents: [localPefEvent],
    });
    const pefPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({ device_id: "e2e-device", records: pefPushRecords }),
    });
    assert.equal(pefPush.accepted, 1);
    assert.deepEqual(pefPush.accepted_records, [pefSubmission.submission_id]);
    assert.deepEqual(pefPush.duplicates, [localPefEvent.id]);
    assert.deepEqual(pefPush.errors, []);

    const enrolledPregnancies = await db
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.pregnancy_id, activePregnancies[0].pregnancy_id));
    assert.equal(enrolledPregnancies.length, 1);
    assert.equal(enrolledPregnancies[0].pregnancy_status, "enrolled");
    assert.equal(enrolledPregnancies[0].enrollment_date, "2026-09-15");
    assert.ok(enrolledPregnancies[0].source_event_id);

    const pregnancyEvents = (await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.household_id, householdId))).filter(
      (event) => event.event_type === "pregnancy_enrolled",
    );
    assert.equal(pregnancyEvents.filter((event) => event.apply_status === "applied").length, 1);
    assert.equal(pregnancyEvents[0].form_response_id, pefSubmission.submission_id);

    const pregnancyFollowUpTasks = (await db
      .select()
      .from(schema.followUpTasks)
      .where(eq(schema.followUpTasks.household_id, householdId))).filter((task) =>
      ["PFF", "UF"].includes(task.task_type),
    );
    assert.ok(pregnancyFollowUpTasks.some((task) => task.task_type === "PFF"));
    assert.ok(pregnancyFollowUpTasks.some((task) => task.task_type === "UF"));
    assert.ok(
      pregnancyFollowUpTasks.every((task) => task.source_event_id === enrolledPregnancies[0].source_event_id),
    );

    const duplicatePefResponseId = randomUUID();
    const duplicatePefPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        device_id: "e2e-device-2",
        records: [
          {
            type: "form_response",
            data: {
              ...pefPushRecords[0].data,
              id: duplicatePefResponseId,
              submitted_at: "2026-09-15T10:00:00.000Z",
            },
          },
        ],
      }),
    });
    assert.equal(duplicatePefPush.accepted, 1);
    assert.deepEqual(duplicatePefPush.accepted_records, [duplicatePefResponseId]);
    assert.deepEqual(duplicatePefPush.errors, []);

    const duplicatePefResponse = await db
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.form_response_id, duplicatePefResponseId));
    assert.equal(duplicatePefResponse.length, 1);
    assert.equal(duplicatePefResponse[0].response_status, "duplicate");
    const duplicatePregnancyEvents = (await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.household_id, householdId))).filter(
      (event) =>
        event.event_type === "pregnancy_enrolled" &&
        event.form_response_id === duplicatePefResponseId &&
        event.apply_status === "held_duplicate",
    );
    assert.equal(duplicatePregnancyEvents.length, 1);
    const duplicatePefFlags = await db
      .select()
      .from(schema.dataQualityFlags)
      .where(eq(schema.dataQualityFlags.duplicate_response_id, duplicatePefResponseId));
    assert.equal(duplicatePefFlags.length, 1);
    assert.equal(duplicatePefFlags[0].flag_type, "duplicate_task_completion");
    assert.equal(duplicatePefFlags[0].primary_response_id, pefSubmission.submission_id);

    const firstPffTask = pregnancyFollowUpTasks.find((task) => task.task_type === "PFF");
    assert.ok(firstPffTask);
    const pffResponseId = randomUUID();
    const pffPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        device_id: "e2e-device",
        records: [
          {
            type: "form_response",
            data: {
              id: pffResponseId,
              task_id: firstPffTask.task_id,
              form_code: "PFF",
              form_version: "2026.05.17",
              household_id: householdId,
              site_id: 1,
              locality_code: "DEV001",
              subject_type: "pregnancy",
              subject_id: activePregnancies[0].pregnancy_id,
              answers_json: {
                household_id: householdId,
                pff_visit_date: "2026-10-15",
                pff_pregnancy_status: 1,
              },
              submitted_at: "2026-10-15T09:00:00.000Z",
            },
          },
        ],
      }),
    });
    assert.equal(pffPush.accepted, 1);
    assert.deepEqual(pffPush.errors, []);

    const pffEvents = (await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.household_id, householdId))).filter(
      (event) => event.event_type === "pregnancy_followup_completed",
    );
    assert.equal(pffEvents.length, 1);
    assert.equal(pffEvents[0].form_response_id, pffResponseId);
    assert.equal(pffEvents[0].apply_status, "applied");
    const pregnancyAfterPff = await db
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.pregnancy_id, activePregnancies[0].pregnancy_id));
    assert.equal(pregnancyAfterPff[0].pregnancy_status, "enrolled");
    assert.equal(pregnancyAfterPff[0].enrollment_date, "2026-09-15");

    const duplicatePffResponseId = randomUUID();
    const duplicatePffPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        device_id: "e2e-device-2",
        records: [
          {
            type: "form_response",
            data: {
              ...pffPushRecordsData(firstPffTask, householdId, activePregnancies[0].pregnancy_id),
              id: duplicatePffResponseId,
              submitted_at: "2026-10-15T10:00:00.000Z",
            },
          },
        ],
      }),
    });
    assert.equal(duplicatePffPush.accepted, 1);
    assert.deepEqual(duplicatePffPush.errors, []);
    const duplicatePffResponse = await db
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.form_response_id, duplicatePffResponseId));
    assert.equal(duplicatePffResponse[0].response_status, "duplicate");
    const heldPffEvents = (await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.household_id, householdId))).filter(
      (event) =>
        event.event_type === "pregnancy_followup_completed" &&
        event.form_response_id === duplicatePffResponseId &&
        event.apply_status === "held_duplicate",
    );
    assert.equal(heldPffEvents.length, 1);

    const pofResponseId = randomUUID();
    const pofPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        device_id: "e2e-device",
        records: [
          {
            type: "form_response",
            data: {
              id: pofResponseId,
              form_code: "POF",
              form_version: "2026.05.17",
              household_id: householdId,
              site_id: 1,
              locality_code: "DEV001",
              subject_type: "pregnancy",
              subject_id: activePregnancies[0].pregnancy_id,
              answers_json: {
                household_id: householdId,
                pof_delivery_date: "2026-11-20",
                pof_pregnancy_outcome_type: 3,
                pof_number_live_born_infants_fill_one_birth_assessment: 1,
                pof_number_miscarriages_stillbirths_fill_one_birth_assessment_form: 0,
              },
              submitted_at: "2026-11-20T09:00:00.000Z",
            },
          },
        ],
      }),
    });
    assert.equal(pofPush.accepted, 1);
    assert.deepEqual(pofPush.errors, []);

    const outcomeEvents = (await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.household_id, householdId))).filter(
      (event) => event.event_type === "pregnancy_outcome_recorded",
    );
    assert.equal(outcomeEvents.length, 1);
    assert.equal(outcomeEvents[0].form_response_id, pofResponseId);
    assert.equal(outcomeEvents[0].apply_status, "applied");

    const outcomeRows = await db
      .select()
      .from(schema.pregnancyOutcomes)
      .where(eq(schema.pregnancyOutcomes.pregnancy_id, activePregnancies[0].pregnancy_id));
    assert.equal(outcomeRows.length, 1);
    assert.equal(outcomeRows[0].source_form_response_id, pofResponseId);

    const childRows = await db
      .select()
      .from(schema.children)
      .where(eq(schema.children.pregnancy_id, activePregnancies[0].pregnancy_id));
    assert.equal(childRows.length, 1);
    assert.equal(childRows[0].source_event_id, outcomeEvents[0].event_id);

    const bafTasks = (await db
      .select()
      .from(schema.followUpTasks)
      .where(eq(schema.followUpTasks.household_id, householdId))).filter(
      (task) => task.task_type === "BAF",
    );
    assert.equal(bafTasks.length, 1);
    assert.equal(bafTasks[0].source_event_id, outcomeEvents[0].event_id);

    const pulled = await fetchData(
      `${baseUrl}/sync/pull?locality_codes=DEV001&include_members=false&page_size=100&since=${encodeURIComponent(sinceBeforePush)}`,
      { headers: { Authorization: authorization } },
    );
    assert.ok(
      pulled.households.some((household: { household_id: string }) => household.household_id === householdId),
    );
    assert.ok(
      pulled.eligible_women.some(
        (woman: { woman_id: string; wq_status: string; tracking_status: string }) =>
          woman.woman_id === eligibleMemberId &&
          woman.wq_status === "completed" &&
          woman.tracking_status === "enrolled",
      ),
    );
    assert.ok(
      pulled.pregnancies.some(
        (pregnancy: { pregnancy_id: string; pregnancy_status: string; enrollment_date: string }) =>
          pregnancy.pregnancy_id === activePregnancies[0].pregnancy_id &&
          pregnancy.pregnancy_status === "closed" &&
          pregnancy.enrollment_date === "2026-09-15",
      ),
    );
    assert.ok(
      pulled.tasks.some(
        (task: { task_key: string; id: string; task_type: string }) =>
          task.task_key === wqTaskKey && task.id !== localWqTasks[0].id && task.task_type === "WQ",
      ),
    );

    const pulledMembers = await fetchData(`${baseUrl}/sync/pull/members`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({ household_ids: [householdId] }),
    });
    assert.equal(pulledMembers.household_members.length, 3);
    assert.ok(
      pulledMembers.household_members.some(
        (member: { household_member_id: string; woman_questionnaire_eligible: boolean }) =>
          member.household_member_id === eligibleMemberId && member.woman_questionnaire_eligible,
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function createLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: unknown) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

function pffPushRecordsData(firstPffTask: any, householdId: string, pregnancyId: string) {
  return {
    task_id: firstPffTask.task_id,
    form_code: "PFF",
    form_version: "2026.05.17",
    household_id: householdId,
    site_id: 1,
    locality_code: "DEV001",
    subject_type: "pregnancy",
    subject_id: pregnancyId,
    answers_json: {
      household_id: householdId,
      pff_visit_date: "2026-10-15",
      pff_pregnancy_status: 1,
    },
  };
}

async function fetchData(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${JSON.stringify(json)}`);
  }

  return json.data;
}
