import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("sync push rejects an unregistered device id", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { signAccessToken } = await import("./lib/jwt");
  const { upsertDevSeed } = await import("./dev/dev-seed");

  await upsertDevSeed();

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

    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/sync/push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_id: `unregistered-${randomUUID()}`,
        records: [],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, "UNREGISTERED_DEVICE");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
