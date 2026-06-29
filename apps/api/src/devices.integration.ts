import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("device self-registration rejects reassignment to a different user", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { signAccessToken } = await import("./lib/jwt");

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

    const secondUserToken = signAccessToken({
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

    assert.equal(response.status, 409);
    assert.equal(body.error.code, "DEVICE_ALREADY_REGISTERED");

    const [storedDevice] = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.device_id, deviceId));
    assert.equal(storedDevice.user_id, firstUserId);
    assert.equal(storedDevice.device_name, "Original device");
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
  const { signAccessToken } = await import("./lib/jwt");

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
    const token = signAccessToken({
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
