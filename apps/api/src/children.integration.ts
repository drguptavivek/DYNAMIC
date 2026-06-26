import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("children list filters locality through household locality", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { signAccessToken } = await import("./lib/jwt");
  const { upsertDevSeed } = await import("./dev/dev-seed");

  await upsertDevSeed();

  const suffix = randomUUID().slice(0, 8);
  const householdId = "1-DEV001-0001-01";
  const womanId = `${householdId}-test-woman-${suffix}`;
  const pregnancyId = `preg-${suffix}`;
  const childId = `child-${suffix}`;
  const memberNumber = 9000 + Math.floor(Math.random() * 999);
  const now = new Date();

  await db.insert(schema.householdMembers).values({
    household_member_id: womanId,
    household_id: householdId,
    member_number: memberNumber,
    site_id: 1,
    locality_code: "DEV001",
    name: "Children Filter Mother",
    sex: 2,
    woman_questionnaire_eligible: true,
    created_at: now,
    updated_at: now,
  });

  await db.insert(schema.eligibleWomen).values({
    woman_id: womanId,
    household_member_id: womanId,
    household_id: householdId,
    site_id: 1,
    locality_code: "DEV001",
    eligibility_start_date: "2026-01-01",
    created_at: now,
    updated_at: now,
  });

  await db.insert(schema.pregnancies).values({
    pregnancy_id: pregnancyId,
    woman_id: womanId,
    household_member_id: womanId,
    household_id: householdId,
    site_id: 1,
    locality_code: "DEV001",
    pregnancy_sequence: 1,
    pregnancy_status: "closed",
    detected_date: "2026-01-01",
    enrollment_date: "2026-01-01",
    created_at: now,
    updated_at: now,
  });

  await db.insert(schema.children).values({
    child_id: childId,
    birth_id: `birth-${suffix}`,
    pregnancy_id: pregnancyId,
    woman_id: womanId,
    household_id: householdId,
    site_id: 1,
    birth_rank: 1,
    birth_date: "2026-09-01",
    birth_status: "live_birth",
    live_birth_status: true,
    current_vital_status: "alive",
    created_at: now,
    updated_at: now,
  });

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const token = signAccessToken({
      sub: "dev-field-worker",
      username: "dev-field-worker",
      role: "field_worker",
      site_id: 1,
    });

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/children?locality_code=DEV001`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(
      body.data.some((child: { child_id: string }) => child.child_id === childId),
      `Expected ${childId} to be returned for locality DEV001`,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
