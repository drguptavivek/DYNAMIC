import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("auth login is rate limited after repeated failures", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
  process.env.AUTH_RATE_LIMIT_MAX = "3";
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";

  const { createApp } = await import("./app");

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const username = `missing-${randomUUID()}`;
    const url = `http://127.0.0.1:${address.port}/api/v1/auth/login`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "wrong-password" }),
      });
      assert.equal(response.status, 401);
    }

    const limited = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "wrong-password" }),
    });
    const body = await limited.json();

    assert.equal(limited.status, 429);
    assert.equal(body.error.code, "RATE_LIMITED");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
