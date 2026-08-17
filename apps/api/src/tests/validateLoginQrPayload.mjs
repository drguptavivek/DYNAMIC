import assert from "node:assert/strict";
import { createLoginQrPayload, decryptLoginQrPayload } from "../lib/loginQr.ts";

const password = "unwiLli-privIle-coNtrav-314";
const qrPayload = createLoginQrPayload({
  userId: "user-1",
  username: "dev-field-worker",
  password,
});

const publicQr = JSON.parse(qrPayload);
assert.equal(publicQr.type, "dynamic-login-token-v1");
assert.equal(typeof publicQr.token, "string");
assert.ok(!qrPayload.includes(password), "QR payload must not contain the password");
assert.ok(!qrPayload.includes("dev-field-worker"), "QR payload must not contain the username");

const decrypted = decryptLoginQrPayload(qrPayload);
assert.equal(decrypted.user_id, "user-1");
assert.equal(decrypted.username, "dev-field-worker");
assert.equal(decrypted.password, password);

assert.throws(() => decryptLoginQrPayload(JSON.stringify({ type: "dynamic-login-token-v1", token: "bad" })));

console.log("Encrypted login QR payload validation passed");
