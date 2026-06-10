import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "./app";
import { signAccessToken } from "./lib/jwt";

test("createApp exposes health endpoint without binding a fixed port", async () => {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "dynamic-api" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("sync time endpoint reports server-device clock delta", async () => {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const token = signAccessToken({
      sub: "user-1",
      username: "fieldworker",
      role: "field_worker",
      site_id: 1,
    });

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/sync/time?device_time_utc=2026-06-10T10:00:00.000Z`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(typeof body.data.clock.server_time_utc, "string");
    assert.equal(body.data.clock.device_time_utc, "2026-06-10T10:00:00.000Z");
    assert.equal(typeof body.data.clock.server_device_delta_ms, "number");
    assert.equal(body.data.clock.warning_threshold_ms, 300000);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
