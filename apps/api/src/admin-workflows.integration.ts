import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("admin correction and review workflows expose audit-ready API behavior", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { adminUser, upsertDevSeed } = await import("./dev/dev-seed");

  await upsertDevSeed();

  const now = new Date();
  const flagId = `dq-${randomUUID()}`;
  const responseId = `response-${randomUUID()}`;
  const memberId = `1-DEV001-0001-01-${randomUUID()}`;
  const memberNumber = randomInt(700000, 999999);

  await db.insert(schema.householdMembers).values({
    household_member_id: memberId,
    household_id: "1-DEV001-0001-01",
    member_number: memberNumber,
    site_id: 1,
    locality_code: "DEV001",
    name: "Original Member Name",
    relationship_to_head: 1,
    sex: 2,
    date_of_birth: "1990-01-01",
    date_of_birth_precision: "reported",
    member_status: "active",
    usual_resident: true,
    member_source: "baseline",
    created_at: now,
    updated_at: now,
  });

  await db.insert(schema.dataQualityFlags).values({
    flag_id: flagId,
    site_id: 1,
    flag_type: "duplicate_response",
    subject_type: "household",
    subject_id: "1-DEV001-0001-01",
    task_id: "dev-task-hhq-1",
    primary_response_id: responseId,
    duplicate_response_id: `${responseId}-duplicate`,
    severity: "warning",
    status: "open",
    created_at: now,
  });

  await db.insert(schema.formResponses).values({
    form_response_id: responseId,
    response_id: responseId,
    site_id: 1,
    locality_code: "DEV001",
    household_id: "1-DEV001-0001-01",
    task_id: "dev-task-hhq-1",
    form_code: "HHQ",
    form_version: "2026.05.17",
    subject_type: "household",
    subject_id: "1-DEV001-0001-01",
    prefill_snapshot_json: { hhq_site_id: 1, hhq_locality_code: "DEV001" },
    answers_json: { hhq_interview_date: "2026-09-01" },
    created_offline_at: now,
    device_id: "integration-device",
    synced_at: now,
    response_status: "primary",
    created_at: now,
  });

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    const login = await fetchData(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: adminUser.username, password: adminUser.password }),
    });
    const authorization = `Bearer ${login.access_token}`;

    const listedFlags = await fetchData(
      `${baseUrl}/data-quality-flags?status=open&flag_type=duplicate_response&site_id=1`,
      { headers: { Authorization: authorization } },
    );
    assert.ok(listedFlags.some((flag: any) => flag.flag_id === flagId));

    const reviewedFlag = await fetchData(`${baseUrl}/data-quality-flags/${flagId}`, {
      method: "PATCH",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        status: "resolved",
        review_note: "Confirmed as duplicate evidence.",
      }),
    });
    assert.equal(reviewedFlag.status, "resolved");
    assert.equal(reviewedFlag.reviewed_by_user_id, adminUser.user_id);
    assert.equal(reviewedFlag.review_note, "Confirmed as duplicate evidence.");

    const listedResponses = await fetchData(
      `${baseUrl}/form-responses?household_id=1-DEV001-0001-01&form_code=HHQ`,
      { headers: { Authorization: authorization } },
    );
    assert.ok(listedResponses.some((response: any) => response.id === responseId));

    const responseDetail = await fetchData(`${baseUrl}/form-responses/${responseId}`, {
      headers: { Authorization: authorization },
    });
    assert.equal(responseDetail.form_response_id, responseId);
    assert.deepEqual(responseDetail.answers_json, { hhq_interview_date: "2026-09-01" });
    assert.equal(responseDetail.task.id, "dev-task-hhq-1");

    const householdCorrection = await fetchData(
      `${baseUrl}/households/1-DEV001-0001-01/corrections`,
      {
        method: "POST",
        headers: { Authorization: authorization },
        body: JSON.stringify({
          field: "baseline_enrollment_status",
          old_value: "completed",
          new_value: "corrected_completed",
          reason: "Integration test correction",
        }),
      },
    );
    assert.equal(householdCorrection.household_id, "1-DEV001-0001-01");
    assert.equal(householdCorrection.corrected_by, adminUser.user_id);

    const householdCorrections = await fetchData(
      `${baseUrl}/households/1-DEV001-0001-01/corrections`,
      { headers: { Authorization: authorization } },
    );
    assert.ok(
      householdCorrections.some(
        (correction: any) => correction.id === householdCorrection.correction_id,
      ),
    );

    const memberCorrection = await fetchData(`${baseUrl}/members/${memberId}/corrections`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        field: "name",
        old_value: "Original Member Name",
        new_value: "Corrected Member Name",
        reason: "Integration test member correction",
      }),
    });
    assert.equal(memberCorrection.member_id, memberId);

    const [updatedMember] = await db
      .select()
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.household_member_id, memberId));
    assert.equal(updatedMember.name, "Corrected Member Name");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
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
