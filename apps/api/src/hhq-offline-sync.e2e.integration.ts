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

    const backendHousehold = await db
      .select()
      .from(schema.households)
      .where(eq(schema.households.household_id, householdId));
    assert.equal(backendHousehold.length, 1);
    assert.equal(backendHousehold[0].household_head_name, "E2E Head");

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

    const pulled = await fetchData(
      `${baseUrl}/sync/pull?locality_codes=DEV001&include_members=false&page_size=100&since=${encodeURIComponent(sinceBeforePush)}`,
      { headers: { Authorization: authorization } },
    );
    assert.ok(
      pulled.households.some((household: { household_id: string }) => household.household_id === householdId),
    );
    assert.ok(
      pulled.eligible_women.some(
        (woman: { woman_id: string; wq_status: string }) =>
          woman.woman_id === eligibleMemberId && woman.wq_status === "pending",
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
