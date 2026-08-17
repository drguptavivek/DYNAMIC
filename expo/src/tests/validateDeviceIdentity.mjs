import assert from "node:assert/strict";

import { formatAndroidDeviceId } from "../modules/auth/deviceIdentity.js";

assert.equal(
  formatAndroidDeviceId("  A1B2C3D4E5F6  "),
  "dynamic-field-android-a1b2c3d4e5f6",
  "Android identity should be deterministic across repeated logins",
);
assert.equal(formatAndroidDeviceId(""), null, "missing Android identity should use fallback");
assert.equal(formatAndroidDeviceId(null), null, "null Android identity should use fallback");

console.log("Stable Android device identity validation passed.");
