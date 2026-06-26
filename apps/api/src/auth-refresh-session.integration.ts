import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("refresh tokens rotate and logout revokes the active refresh session", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
  process.env.AUTH_RATE_LIMIT_MAX = "100";
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { adminUser, upsertDevSeed } = await import("./dev/dev-seed");

  await upsertDevSeed();

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
    assert.ok(login.refresh_token);

    const rotated = await fetchData(`${baseUrl}/auth/refresh`, {
      method: "POST",
      body: JSON.stringify({ refresh_token: login.refresh_token }),
    });
    assert.ok(rotated.access_token);
    assert.ok(rotated.refresh_token);
    assert.notEqual(rotated.refresh_token, login.refresh_token);

    const reused = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: login.refresh_token }),
    });
    assert.equal(reused.status, 401);

    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rotated.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: rotated.refresh_token }),
    });
    assert.equal(logout.status, 200);

    const afterLogout = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rotated.refresh_token }),
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db
      .delete(schema.refreshTokenSessions)
      .where(eq(schema.refreshTokenSessions.user_id, adminUser.user_id));
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
