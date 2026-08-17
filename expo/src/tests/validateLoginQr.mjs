import assert from "node:assert/strict";
import { parseLoginQrPayload } from "../modules/auth/loginQr.js";

const payload = JSON.stringify({
  type: "dynamic-login-token-v1",
  token: "opaque.encrypted.server-token",
});
const parsed = parseLoginQrPayload(payload);

assert.equal(parsed.qrPayload, payload);
assert.equal(parsed.password, undefined);

assert.throws(() => parseLoginQrPayload("not-json"), /not a DYNAMIC login QR/);
assert.throws(
  () => parseLoginQrPayload(JSON.stringify({ type: "wrong", token: "abc" })),
  /not for DYNAMIC login/,
);
assert.throws(
  () => parseLoginQrPayload(JSON.stringify({ type: "dynamic-login-token-v1", token: "" })),
  /missing secure login token/,
);
assert.throws(
  () => parseLoginQrPayload(JSON.stringify({ type: "dynamic-login-v1", username: "u", password: "p" })),
  /not for DYNAMIC login/,
);

console.log("Login QR validation passed");
