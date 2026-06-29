import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("SBF sync evidence is held for review until stillbirth promotion is implemented", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { createSessionBackedAccessToken } = await import("./test-helpers/session-token");
  const { upsertDevSeed } = await import("./dev/dev-seed");

  await upsertDevSeed();
  await db
    .insert(schema.devices)
    .values({
      device_id: "test-sbf-device",
      device_name: "SBF test device",
      user_id: "dev-field-worker",
      registered_at: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.devices.device_id,
      set: {
        user_id: "dev-field-worker",
        registered_at: new Date(),
      },
    });

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  const responseId = `sbf-${randomUUID()}`;
  const householdId = "1-DEV001-0001-01";

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const token = await createSessionBackedAccessToken({
      sub: "dev-field-worker",
      username: "dev-field-worker",
      role: "field_worker",
      site_id: 1,
    });

    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/sync/push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_id: "test-sbf-device",
        records: [
          {
            type: "form_response",
            data: {
              id: responseId,
              household_id: householdId,
              site_id: 1,
              locality_code: "DEV001",
              subject_id: "stillbirth-subject",
              subject_type: "child",
              form_code: "SBF",
              form_version: "2026.05.17",
              answers_json: {
                sbf_review_marker: "stillbirth evidence pending typed promotion",
              },
              submitted_at: "2026-09-02T00:00:00.000Z",
            },
          },
        ],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.accepted, 1);

    const [storedResponse] = await db
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.response_id, responseId));
    assert.equal(storedResponse.response_status, "held_for_review");

    const flags = await db
      .select()
      .from(schema.dataQualityFlags)
      .where(eq(schema.dataQualityFlags.duplicate_response_id, responseId));
    assert.equal(flags.length, 1);
    assert.equal(flags[0].flag_type, "unsupported_form_promotion");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
