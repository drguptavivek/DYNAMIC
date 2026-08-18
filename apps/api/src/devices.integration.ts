import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("device self-registration allows the active user to reuse a device", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { createSessionBackedAccessToken } = await import("./test-helpers/session-token");

  const deviceId = `device-${randomUUID()}`;
  const firstUserId = `user-${randomUUID()}`;
  const secondUserId = `user-${randomUUID()}`;
  const now = new Date();

  await db.insert(schema.users).values([
    {
      user_id: firstUserId,
      username: firstUserId,
      display_name: "First Device Owner",
      role: "field_worker",
      site_id: 1,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: secondUserId,
      username: secondUserId,
      display_name: "Second Device Owner",
      role: "field_worker",
      site_id: 1,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
  ]);

  await db.insert(schema.devices).values({
    device_id: deviceId,
    device_name: "Original device",
    user_id: firstUserId,
    registered_at: now,
  });

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const secondUserToken = await createSessionBackedAccessToken({
      sub: secondUserId,
      username: secondUserId,
      role: "field_worker",
      site_id: 1,
    });

    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/devices/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secondUserToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_id: deviceId,
        device_name: "Stolen device",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.device_id, deviceId);

    const [storedDevice] = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.device_id, deviceId));
    assert.equal(storedDevice.user_id, secondUserId);
    assert.equal(storedDevice.device_name, "Stolen device");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("a user can register two devices but a third requires administrator action", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { createSessionBackedAccessToken } = await import("./test-helpers/session-token");

  const userId = `two-device-user-${randomUUID()}`;
  const firstDeviceId = `first-device-${randomUUID()}`;
  const secondDeviceId = `second-device-${randomUUID()}`;
  const thirdDeviceId = `third-device-${randomUUID()}`;
  const now = new Date();
  await db.insert(schema.users).values({
    user_id: userId,
    username: userId,
    display_name: "Two Device User",
    role: "field_worker",
    site_id: 1,
    password_hash: "unused",
    active: true,
    created_at: now,
    updated_at: now,
  });

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const token = await createSessionBackedAccessToken({
      sub: userId,
      username: userId,
      role: "field_worker",
      site_id: 1,
    });

    const register = (deviceId: string) =>
      fetch(`${baseUrl}/devices/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, device_name: "Test phone" }),
      });

    assert.equal((await register(firstDeviceId)).status, 200);
    assert.equal((await register(secondDeviceId)).status, 200);
    assert.equal((await register(firstDeviceId)).status, 200);

    const thirdResponse = await register(thirdDeviceId);
    const thirdBody = await thirdResponse.json();
    assert.equal(thirdResponse.status, 403);
    assert.equal(thirdBody.error.code, "DEVICE_LIMIT_REACHED");
    assert.equal(
      thirdBody.error.message,
      "Already registered on two devices. Contact administrator.",
    );

    await db
      .update(schema.devices)
      .set({ authorized: false, deauthorized_at: new Date() })
      .where(eq(schema.devices.device_id, firstDeviceId));
    assert.equal((await register(thirdDeviceId)).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("site admin can assign devices only within their site", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { createSessionBackedAccessToken } = await import("./test-helpers/session-token");

  const siteAdminId = `site-admin-${randomUUID()}`;
  const ownSiteUserId = `site-user-${randomUUID()}`;
  const otherSiteUserId = `other-site-user-${randomUUID()}`;
  const now = new Date();

  await db.insert(schema.users).values([
    {
      user_id: siteAdminId,
      username: siteAdminId,
      display_name: "Site Admin",
      role: "site_research_scientist",
      site_id: 1,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: ownSiteUserId,
      username: ownSiteUserId,
      display_name: "Own Site User",
      role: "field_worker",
      site_id: 1,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: otherSiteUserId,
      username: otherSiteUserId,
      display_name: "Other Site User",
      role: "field_worker",
      site_id: 2,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
  ]);

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const token = await createSessionBackedAccessToken({
      sub: siteAdminId,
      username: siteAdminId,
      role: "site_research_scientist",
      site_id: 1,
    });

    const ownSiteResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/devices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        devices: [
          {
            device_id: `site-device-${randomUUID()}`,
            device_name: "Site device",
            user_id: ownSiteUserId,
          },
        ],
      }),
    });
    const ownSiteBody = await ownSiteResponse.json();
    assert.equal(ownSiteResponse.status, 201);
    assert.equal(ownSiteBody.data.created, 1);

    const otherSiteResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/devices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        devices: [
          {
            device_id: `other-site-device-${randomUUID()}`,
            device_name: "Other site device",
            user_id: otherSiteUserId,
          },
        ],
      }),
    });
    const otherSiteBody = await otherSiteResponse.json();
    assert.equal(otherSiteResponse.status, 403);
    assert.equal(otherSiteBody.error.code, "INSUFFICIENT_PERMISSIONS");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("central admin can deauthorize, reauthorize, and delete a registered device", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { createSessionBackedAccessToken } = await import("./test-helpers/session-token");

  const adminId = `device-admin-${randomUUID()}`;
  const fieldWorkerId = `device-worker-${randomUUID()}`;
  const deviceId = `managed-device-${randomUUID()}`;
  const now = new Date();
  await db.insert(schema.users).values([
    {
      user_id: adminId,
      username: adminId,
      display_name: "Device Admin",
      role: "central_admin",
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: fieldWorkerId,
      username: fieldWorkerId,
      display_name: "Device Worker",
      role: "field_worker",
      site_id: 1,
      password_hash: "unused",
      active: true,
      created_at: now,
      updated_at: now,
    },
  ]);
  await db.insert(schema.devices).values({
    device_id: deviceId,
    device_name: "Managed phone",
    user_id: fieldWorkerId,
    registered_at: now,
  });

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const adminToken = await createSessionBackedAccessToken({
      sub: adminId,
      username: adminId,
      role: "central_admin",
      site_id: null,
    });
    const workerToken = await createSessionBackedAccessToken({
      sub: fieldWorkerId,
      username: fieldWorkerId,
      role: "field_worker",
      site_id: 1,
    });

    const activeDeleteResponse = await fetch(
      `${baseUrl}/devices/${encodeURIComponent(deviceId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    const activeDeleteBody = await activeDeleteResponse.json();
    assert.equal(activeDeleteResponse.status, 409);
    assert.equal(activeDeleteBody.error.code, "DEVICE_MUST_BE_DEAUTHORIZED");

    const disableResponse = await fetch(
      `${baseUrl}/devices/${encodeURIComponent(deviceId)}/authorization`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ authorized: false }),
      },
    );
    assert.equal(disableResponse.status, 200);

    const blockedRegistration = await fetch(`${baseUrl}/devices/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, device_name: "Managed phone" }),
    });
    const blockedBody = await blockedRegistration.json();
    assert.equal(blockedRegistration.status, 403);
    assert.equal(blockedBody.error.code, "DEVICE_DEAUTHORIZED");

    const enableResponse = await fetch(
      `${baseUrl}/devices/${encodeURIComponent(deviceId)}/authorization`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ authorized: true }),
      },
    );
    assert.equal(enableResponse.status, 200);

    const restoredRegistration = await fetch(`${baseUrl}/devices/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, device_name: "Managed phone" }),
    });
    assert.equal(restoredRegistration.status, 200);

    const disableBeforeDeleteResponse = await fetch(
      `${baseUrl}/devices/${encodeURIComponent(deviceId)}/authorization`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ authorized: false }),
      },
    );
    assert.equal(disableBeforeDeleteResponse.status, 200);

    const deleteResponse = await fetch(
      `${baseUrl}/devices/${encodeURIComponent(deviceId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    const deleteBody = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteBody.data.device_id, deviceId);
    assert.equal(deleteBody.data.deleted, true);

    const deletedDevices = await db
      .select({ device_id: schema.devices.device_id })
      .from(schema.devices)
      .where(eq(schema.devices.device_id, deviceId));
    assert.equal(deletedDevices.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
