import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("field worker household list is intersected with active area assignments", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { signAccessToken } = await import("./lib/jwt");

  const userId = `scope-user-${randomUUID()}`;
  const outOfScopeHouseholdId = `1-DEV002-${randomUUID().slice(0, 4)}-01`;
  const now = new Date();

  await db.insert(schema.studySites).values({
    site_id: 1,
    site_code: "DEV",
    site_name: "Development Site",
  }).onConflictDoUpdate({
    target: schema.studySites.site_id,
    set: { site_code: "DEV", site_name: "Development Site" },
  });

  await db.insert(schema.studyLocalities).values([
    {
      site_id: 1,
      locality_code: "DEV001",
      locality_name: "Assigned Locality",
      locality_type: "urban",
    },
    {
      site_id: 1,
      locality_code: "DEV002",
      locality_name: "Out-of-scope Locality",
      locality_type: "urban",
    },
  ]).onConflictDoNothing();

  await db.insert(schema.users).values({
    user_id: userId,
    username: userId,
    display_name: "Scoped Field Worker",
    role: "field_worker",
    site_id: 1,
    password_hash: "unused",
    active: true,
    created_at: now,
    updated_at: now,
  });

  await db.insert(schema.userAreaAssignments).values({
    assignment_id: `assignment-${randomUUID()}`,
    user_id: userId,
    site_id: 1,
    locality_code: "DEV001",
    role: "field_worker",
    active_from: "2026-01-01",
    active_to: null,
    created_at: now,
  });

  await db.insert(schema.households).values({
    household_id: outOfScopeHouseholdId,
    site_id: 1,
    locality_code: "DEV002",
    structure_map_id: outOfScopeHouseholdId.split("-")[2],
    household_number: "01",
    household_head_name: "Out Of Scope",
    baseline_enrollment_status: "completed",
    baseline_completed_date: "2026-09-01",
    cohort_status: "enrolled",
    created_at: now,
    updated_at: now,
  });

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const token = signAccessToken({
      sub: userId,
      username: userId,
      role: "field_worker",
      site_id: 1,
    });

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/households?locality_code=DEV002`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 0);
    assert.equal(body.meta.total, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
