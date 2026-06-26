import assert from "node:assert/strict";
import test from "node:test";

test("JWT verification uses distinct access and refresh secrets and expected token type", async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

  const { signAccessToken, signRefreshToken, verifyToken } = await import("./jwt");
  const { default: jwt } = await import("jsonwebtoken");

  const payload = {
    sub: "user-1",
    username: "fieldworker",
    role: "field_worker" as const,
    site_id: 1,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  assert.equal(verifyToken(accessToken, "access").type, "access");
  assert.equal(verifyToken(refreshToken, "refresh").type, "refresh");
  assert.throws(() => verifyToken(refreshToken, "access"), /invalid signature/);
  assert.throws(() => verifyToken(accessToken, "refresh"), /invalid signature/);

  const wrongTypeWithAccessSecret = jwt.sign(
    { ...payload, type: "refresh" },
    "test-access-secret",
    { algorithm: "HS256" },
  );
  assert.throws(() => verifyToken(wrongTypeWithAccessSecret, "access"), /Expected access token/);
});
