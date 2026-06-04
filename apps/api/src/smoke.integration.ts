import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("API smoke flow passes against dynamic_test without a fixed port", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { smokeUser, upsertDevSeed } = await import("./dev/dev-seed");

  await upsertDevSeed();

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
    assert.equal(forms.forms.length, 11);
    assert.match(forms.forms[0].checksum, /^[a-f0-9]{64}$/);

    const batch = await fetchData(`${baseUrl}/protocol/forms/batch?codes=HHQ,PEF,VA`, {
      headers: { Authorization: authorization },
    });
    assert.deepEqual(
      batch.forms.map((form: { form_code: string }) => form.form_code),
      ["HHQ", "PEF"],
    );

    const pull = await fetchData(`${baseUrl}/sync/pull?locality_codes=DEV001`, {
      headers: { Authorization: authorization },
    });
    assert.equal(pull.tasks.length, 1);
    assert.ok(pull.form_versions[0].checksum);

    const push = await fetchData(`${baseUrl}/sync/push`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({ device_id: "test-smoke-device", records: [] }),
    });
    assert.equal(push.accepted, 0);
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
