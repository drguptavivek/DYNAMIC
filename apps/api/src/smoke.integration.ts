import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("API smoke flow passes against dynamic_test without a fixed port", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
  const originalConsoleError = console.error;

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { smokeUser, upsertDevSeed, usCollaboratorUser } = await import("./dev/dev-seed");

  const seedSince = new Date(Date.now() - 1000).toISOString();
  await upsertDevSeed();
  await db
    .insert(schema.devices)
    .values({
      device_id: "test-smoke-device",
      device_name: "Smoke test device",
      user_id: smokeUser.user_id,
      registered_at: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.devices.device_id,
      set: {
        user_id: smokeUser.user_id,
        registered_at: new Date(),
      },
    });

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

    const me = await fetchData(`${baseUrl}/users/me`, { headers: { Authorization: authorization } });
    assert.equal(me.username, smokeUser.username);
    assert.equal(me.area_assignments.length, 1);

    const forms = await fetchData(`${baseUrl}/protocol/forms`, {
      headers: { Authorization: authorization },
    });
    assert.equal(forms.forms.length, 12);
    assert.match(forms.forms[0].checksum, /^[a-f0-9]{64}$/);

    const batch = await fetchData(`${baseUrl}/protocol/forms/batch?codes=HHQ,PEF,VA`, {
      headers: { Authorization: authorization },
    });
    assert.deepEqual(
      batch.forms.map((form: { form_code: string }) => form.form_code),
      ["HHQ", "PEF"],
    );

    const pull = await fetchData(
      `${baseUrl}/sync/pull?device_id=test-smoke-device&locality_codes=01&since=${encodeURIComponent(seedSince)}`,
      { headers: { Authorization: authorization } },
    );
    assert.ok(pull.tasks.some((task: { id: string; form_code: string }) => task.id === "dev-task-hhq-1" && task.form_code === "HHQ"));
    assert.ok(pull.form_versions[0].checksum);

    const oldCursor = "1970-01-01T00:00:00.000Z";
    const firstPage = await fetchData(
      `${baseUrl}/sync/pull?device_id=test-smoke-device&locality_codes=01&include_members=false&page_size=1&since=${encodeURIComponent(oldCursor)}`,
      { headers: { Authorization: authorization } },
    );
    assert.notEqual(firstPage.sync_cursor, oldCursor);
    assert.ok(new Date(firstPage.sync_cursor).getTime() > new Date(oldCursor).getTime());
    assert.ok(firstPage.next_page_token);

    const secondPage = await fetchData(
      `${baseUrl}/sync/pull?device_id=test-smoke-device&include_members=false&page_token=${encodeURIComponent(firstPage.next_page_token)}`,
      { headers: { Authorization: authorization } },
    );
    assert.equal(secondPage.sync_cursor, firstPage.sync_cursor);

    const push = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({ device_id: "test-smoke-device", records: [] }),
    });
    assert.equal(push.accepted, 0);

    const hhqResponseId = `hhq-${randomUUID()}`;
    const hhqHouseholdId = `1-01-${randomUUID().slice(0, 4)}-01`;
    const hhqPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        device_id: "test-smoke-device",
        records: [
          {
            type: "form_response",
            data: {
              id: hhqResponseId,
              household_id: hhqHouseholdId,
              site_id: 1,
              locality_code: "01",
              subject_id: hhqHouseholdId,
              subject_type: "household",
              form_code: "HHQ",
              form_version: "2026.05.17",
              answers_json: {
                hhq_site_id: 1,
                hhq_locality_code: "01",
                hhq_structure_map_id: hhqHouseholdId.split("-")[2],
                hhq_household_number: "01",
                hhq_household_address: "Smoke HHQ address",
                hhq_household_head_name: "Smoke Head",
                hhq_consent_study_provide_pis_explain_study_adult_member: 1,
                hhq_interview_date: "2026-09-01",
                hhq_result_interview: 1,
                hhq_language_questionnaire: 1,
                hhq_household_members: [
                  {
                    member_line_number: 1,
                    member_name: "Smoke Head",
                    member_relationship_to_head: 1,
                    member_sex: 1,
                    member_age_years: 40,
                    member_marital_status: 1,
                  },
                  {
                    member_line_number: 2,
                    member_name: "Smoke Eligible Woman",
                    member_relationship_to_head: 2,
                    member_sex: 2,
                    member_age_years: 28,
                    member_marital_status: 1,
                    member_woman_questionnaire_eligible: 1,
                  },
                ],
              },
              submitted_at: "2026-09-01T10:00:00.000Z",
            },
          },
        ],
      }),
    });
    assert.equal(hhqPush.accepted, 1);

    const missingUserPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      body: JSON.stringify({
        device_id: "test-smoke-device",
        records: [
          {
            type: "form_response",
            data: {
              id: `missing-user-${randomUUID()}`,
              household_id: `1-01-${randomUUID().slice(0, 4)}-03`,
              site_id: 1,
              locality_code: "01",
              subject_type: "household",
              form_code: "HHQ",
              form_version: "2026.05.17",
              answers_json: {},
              submitted_at: "2026-09-01T10:30:00.000Z",
            },
          },
        ],
      }),
    });
    assert.equal(missingUserPush.accepted, 0);
    assert.match(missingUserPush.errors[0].error, /user_id/);

    const loggedOutResponseId = `hhq-logged-out-${randomUUID()}`;
    const loggedOutHouseholdId = `1-01-${randomUUID().slice(0, 4)}-02`;
    const loggedOutPush = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      body: JSON.stringify({
        device_id: "test-smoke-device",
        records: [
          {
            type: "form_response",
            data: {
              id: loggedOutResponseId,
              user_id: smokeUser.user_id,
              household_id: loggedOutHouseholdId,
              site_id: 1,
              locality_code: "01",
              subject_id: loggedOutHouseholdId,
              subject_type: "household",
              form_code: "HHQ",
              form_version: "2026.05.17",
              answers_json: {
                hhq_site_id: 1,
                hhq_locality_code: "01",
                hhq_structure_map_id: loggedOutHouseholdId.split("-")[2],
                hhq_household_number: "02",
                hhq_household_head_name: "Logged Out Head",
                hhq_consent_study_provide_pis_explain_study_adult_member: 1,
                hhq_interview_date: "2026-09-01",
                hhq_result_interview: 1,
                hhq_language_questionnaire: 1,
                hhq_household_members: [
                  {
                    member_line_number: 1,
                    member_name: "Logged Out Head",
                    member_relationship_to_head: 1,
                    member_sex: 1,
                    member_age_years: 45,
                    member_marital_status: 1,
                  },
                ],
              },
              submitted_at: "2026-09-01T11:00:00.000Z",
            },
          },
        ],
      }),
    });
    assert.equal(loggedOutPush.accepted, 1);

    const promotedMembers = await db
      .select()
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.household_id, hhqHouseholdId));
    assert.equal(promotedMembers.length, 2);
    const promotedWomanMemberId = `${hhqHouseholdId}-02`;
    const promotedEligibleWomen = await db
      .select()
      .from(schema.eligibleWomen)
      .where(eq(schema.eligibleWomen.household_member_id, promotedWomanMemberId));
    assert.equal(promotedEligibleWomen.length, 1);
    assert.equal(promotedEligibleWomen[0].woman_id, promotedWomanMemberId);
    assert.equal(promotedEligibleWomen[0].wq_status, "pending");
    assert.equal(promotedEligibleWomen[0].tracking_status, "not_tracked");

    const promotedWqTasks = await db
      .select()
      .from(schema.followUpTasks)
      .where(eq(schema.followUpTasks.subject_id, promotedWomanMemberId));
    assert.equal(promotedWqTasks.filter((task) => task.task_type === "WQ").length, 1);

    const collaboratorLogin = await fetchData(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({
        username: usCollaboratorUser.username,
        password: usCollaboratorUser.password,
      }),
    });
    const collaboratorAuthorization = `Bearer ${collaboratorLogin.access_token}`;

    const collaboratorHouseholds = await fetchData(
      `${baseUrl}/households?search=${encodeURIComponent(hhqHouseholdId)}`,
      { headers: { Authorization: collaboratorAuthorization } },
    );
    assert.equal(collaboratorHouseholds.length, 1);
    assert.equal(collaboratorHouseholds[0].household_head_name, null);
    assert.equal(collaboratorHouseholds[0].address, null);
    assert.deepEqual(collaboratorHouseholds[0].eligible_women_names, []);

    const collaboratorMembers = await fetchData(`${baseUrl}/households/${hhqHouseholdId}/members`, {
      headers: { Authorization: collaboratorAuthorization },
    });
    assert.equal(collaboratorMembers.length, 2);
    assert.equal(collaboratorMembers[0].name, null);
    assert.equal(collaboratorMembers[1].name, null);

    const collaboratorRawResponse = await fetch(`${baseUrl}/form-responses/${hhqResponseId}`, {
      headers: { Authorization: collaboratorAuthorization },
    });
    assert.equal(collaboratorRawResponse.status, 403);
    assert.equal((await collaboratorRawResponse.json()).error.code, "INSUFFICIENT_DATA_ACCESS");

    const collaboratorSyncPull = await fetch(
      `${baseUrl}/sync/pull?locality_codes=01&since=${encodeURIComponent(seedSince)}`,
      { headers: { Authorization: collaboratorAuthorization } },
    );
    assert.equal(collaboratorSyncPull.status, 403);
    assert.equal((await collaboratorSyncPull.json()).error.code, "INSUFFICIENT_DATA_ACCESS");

    const failedPromotionResponseId = `failed-pef-${randomUUID()}`;
    const expectedPromotionErrors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        (args[0].includes(`Error processing form response ${failedPromotionResponseId}`) ||
          args[0].includes("Error in promotePef for 1-01-0001-01/missing-active-pregnancy"))
      ) {
        expectedPromotionErrors.push(args);
        return;
      }
      originalConsoleError(...args);
    };
    let failedPromotionPush;
    try {
      failedPromotionPush = await fetchData(`${baseUrl}/sync/push`, {
        method: "POST",
        headers: { Authorization: authorization },
        body: JSON.stringify({
          device_id: "test-smoke-device",
          records: [
            {
              type: "form_response",
              data: {
                id: failedPromotionResponseId,
                household_id: "1-01-0001-01",
                subject_id: "missing-active-pregnancy",
                subject_type: "woman",
                form_code: "PEF",
                form_version: "2026.05.17",
                answers_json: { pef_any_time_during_pregnancy_ultrasound: 0 },
                submitted_at: "2026-09-02T00:00:00.000Z",
              },
            },
          ],
        }),
      });
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(expectedPromotionErrors.length, 2);
    assert.equal(failedPromotionPush.accepted, 0);
    assert.deepEqual(failedPromotionPush.accepted_records, []);
    assert.equal(failedPromotionPush.errors.length, 1);
    assert.equal(failedPromotionPush.errors[0].id, failedPromotionResponseId);
    assert.match(failedPromotionPush.errors[0].error, /No active pregnancy found/);

    const failedResponseRows = await db
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.response_id, failedPromotionResponseId));
    assert.equal(failedResponseRows.length, 0);
  } finally {
    console.error = originalConsoleError;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db
      .delete(schema.refreshTokenSessions)
      .where(eq(schema.refreshTokenSessions.user_id, smokeUser.user_id));
  }
});

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
