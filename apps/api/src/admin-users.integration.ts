import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("central admin can create, update, assign, and deactivate a user", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
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
    const authorization = `Bearer ${login.access_token}`;
    const username = `field-worker-${Date.now()}`;

    const createdUser = await fetchData(`${baseUrl}/users`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        username,
        display_name: "Field Worker API Test",
        email: `${username}@example.test`,
        role: "field_worker",
        site_id: 1,
        password: "field-password",
      }),
    });
    assert.equal(createdUser.username, username);
    assert.equal(createdUser.active, true);
    assert.equal(createdUser.password_hash, undefined);

    const patchedUser = await fetchData(`${baseUrl}/users/${createdUser.user_id}`, {
      method: "PATCH",
      headers: { Authorization: authorization },
      body: JSON.stringify({ display_name: "Updated Field Worker", active: true }),
    });
    assert.equal(patchedUser.display_name, "Updated Field Worker");

    const assignment = await fetchData(`${baseUrl}/users/${createdUser.user_id}/area-assignments`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        site_id: 1,
        locality_code: "DEV001",
        role: "field_worker",
        active_from: "2026-06-04T00:00:00.000Z",
      }),
    });
    assert.equal(assignment.user_id, createdUser.user_id);
    assert.equal(assignment.locality_code, "DEV001");

    const assignments = await fetchData(`${baseUrl}/users/${createdUser.user_id}/area-assignments`, {
      headers: { Authorization: authorization },
    });
    assert.equal(assignments.length, 1);

    const deletedAssignment = await fetchData(
      `${baseUrl}/users/${createdUser.user_id}/area-assignments/${assignment.assignment_id}`,
      { method: "DELETE", headers: { Authorization: authorization } },
    );
    assert.equal(deletedAssignment.message, "Assignment removed");

    const deletedUser = await fetchData(`${baseUrl}/users/${createdUser.user_id}`, {
      method: "DELETE",
      headers: { Authorization: authorization },
    });
    assert.equal(deletedUser.message, "User deactivated");
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
