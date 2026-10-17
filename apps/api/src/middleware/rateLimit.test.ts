import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import { createLoginQrPayload } from "../lib/loginQr";
import { authRateLimit, resetAuthRateLimitForTests } from "./rateLimit";

describe("authentication rate limits", { concurrency: false }, () => {
  const envNames = ["JWT_SECRET", "AUTH_RATE_LIMIT_MAX", "AUTH_RATE_LIMIT_WINDOW_MS"] as const;
  const previousEnv = envNames.map((name) => process.env[name]);
  let server: Server;
  let baseUrl: string;

  before(async () => {
    process.env.JWT_SECRET = "rate-limit-test-secret";
    process.env.AUTH_RATE_LIMIT_MAX = "10";
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = "900000";
    const app = express();
    app.use(express.json());
    // This handler proves admission through the limiter, not successful authentication.
    app.post(["/login", "/qr-login", "/refresh"], authRateLimit, (_req, res) => res.sendStatus(204));
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => resetAuthRateLimitForTests());
  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    resetAuthRateLimitForTests();
    envNames.forEach((name, index) => {
      if (previousEnv[index] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[index];
    });
  });

  function qr(userId: string): string {
    return createLoginQrPayload({ userId, username: `staff-${userId}`, password: "test-password" });
  }

  async function post(path: string, body: Record<string, unknown>): Promise<Response> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await response.text();
    return response;
  }

  test("more than ten valid QR accounts can log in from one network", async () => {
    for (let index = 0; index < 15; index += 1) {
      assert.equal((await post("/qr-login", { qr_payload: qr(`user-${index}`) })).status, 204);
    }
  });

  test("new QR envelopes, wrapper formatting, and spoofed usernames cannot reset a user's limit", async () => {
    for (let index = 0; index < 10; index += 1) {
      const envelope = JSON.parse(qr("same-user"));
      assert.equal((await post("/qr-login", {
        qr_payload: JSON.stringify({ extra: index, ...envelope }, null, index % 3),
        username: `spoof-${index}`,
      })).status, 204);
    }
    assert.equal((await post("/qr-login", {
      qr_payload: qr("same-user"), username: "another-spoof",
    })).status, 429);
    for (const path of ["/QR-LOGIN", "/qr-login/"]) {
      assert.equal((await post(path, {
        qr_payload: qr("same-user"), username: `spoof-${path}`,
      })).status, 429);
    }
    assert.equal((await post("/qr-login", { qr_payload: qr("different-user") })).status, 204);
  });

  test("malformed, expired, tampered, and missing QR payloads share an anonymous limit", async (context) => {
    let now = Date.now();
    context.mock.method(Date, "now", () => now);
    const expired = qr("expired-user");
    now += 24 * 60 * 60 * 1000 + 1;
    const tampered = JSON.parse(qr("tampered-user"));
    const parts = tampered.token.split(".");
    parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
    tampered.token = parts.join(".");
    const bodies = [
      { qr_payload: "not-json" },
      { qr_payload: expired },
      { qr_payload: JSON.stringify(tampered) },
      {},
      { qr_payload: { token: "wrong-type" } },
    ];
    for (let index = 0; index < 15; index += 1) {
      const response = await post("/qr-login", { ...bodies[index % bodies.length], username: `spoof-${index}` });
      assert.equal(response.status, index < 10 ? 204 : 429);
    }
    assert.equal((await post("/qr-login", { qr_payload: qr("valid-user") })).status, 204);
  });

  test("blocked requests expose Retry-After and the window expires at its boundary", async (context) => {
    let now = Date.now();
    context.mock.method(Date, "now", () => now);
    const body = { qr_payload: qr("window-user") };
    for (let index = 0; index < 10; index += 1) assert.equal((await post("/qr-login", body)).status, 204);
    now += 1001;
    const blocked = await post("/qr-login", body);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("Retry-After"), "899");
    now += 898999;
    assert.equal((await post("/qr-login", body)).status, 204);
  });

  test("refresh tokens with identical first 24 characters have independent limits", async () => {
    const prefix = "same-refresh-token-prefix";
    assert.equal(prefix.length, 25);
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await post("/refresh", { refresh_token: `${prefix}-first` })).status, 204);
    }
    assert.equal((await post("/refresh", { refresh_token: `${prefix}-first` })).status, 429);
    for (const path of ["/REFRESH", "/refresh/"]) {
      assert.equal((await post(path, {
        refresh_token: `${prefix}-first`, username: `spoof-${path}`,
      })).status, 429);
    }
    assert.equal((await post("/refresh", { refresh_token: `${prefix}-second` })).status, 204);
  });

  test("password attempts still exhaust the existing per-username allowance", async () => {
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await post("/login", { username: "password-user", password: `wrong-${index}` })).status, 204);
    }
    assert.equal((await post("/login", { username: "password-user", password: "another" })).status, 429);
    for (const path of ["/LOGIN", "/login/"]) {
      assert.equal((await post(path, { username: "password-user", password: "another" })).status, 429);
    }
    assert.equal((await post("/login", { username: "another-user", password: "wrong" })).status, 204);
  });
});
