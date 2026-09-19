/** Verifies app-lock PIN policy, hashing, persistence, and retry behavior. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  clearLockForTests,
  configureLockForUser,
  isBiometricUnlockEnabledForUser,
  isLockConfiguredForUser,
  isValidPin,
  readLockRecord,
  setBiometricUnlockForUser,
  setLocalAuthenticationForTests,
  unlockWithBiometrics,
  verifyPinForUser,
} from "../modules/auth/appLockStore.js";
import {
  beginAppLockMediaActivity,
  endAppLockMediaActivity,
  isAppLockMediaActivityActive,
  resetAppLockMediaActivityForTests,
} from "../modules/auth/appLockMediaActivity.js";

const user = { user_id: "field-worker-1", username: "field-worker-1" };
const otherUser = { user_id: "field-worker-2", username: "field-worker-2" };

const fieldAppProviderSource = readFileSync(
  new URL("../shell/FieldAppProvider.js", import.meta.url),
  "utf8",
);
const mediaRendererSources = [
  "../components/forms/renderers/CameraRenderer.js",
  "../components/forms/renderers/FilePickerRenderer.js",
  "../components/forms/renderers/PefUltrasoundReportsRenderer.js",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
assert.match(
  fieldAppProviderSource,
  /APP_LOCK_MEDIA_PICKER_GRACE_MS = 60 \* 1000/,
  "external media picker must allow one minute to return",
);
assert.match(
  fieldAppProviderSource,
  /nextState === "active"[\s\S]*cancelPendingAppLock\(\)/,
  "returning from camera or gallery must cancel the pending app lock",
);
assert.match(
  fieldAppProviderSource,
  /isAppLockMediaActivityActive\(\)[\s\S]*setTimeout\([\s\S]*APP_LOCK_MEDIA_PICKER_GRACE_MS/,
  "the grace period must be restricted to an active external media picker",
);
assert.match(
  fieldAppProviderSource,
  /if \(isAppLockMediaActivityActive\(\)\)[\s\S]*return;[\s\S]*setAppLocked\(true\)/,
  "ordinary app backgrounding must lock immediately",
);
assert.doesNotMatch(
  fieldAppProviderSource,
  /initializeAppLock\(result\.user,\s*\{\s*afterLogin:/,
  "password and QR login must not bypass local PIN setup or unlock",
);
assert.match(
  fieldAppProviderSource,
  /initializeAppLock = useCallback\(async \(nextUser\) => \{[\s\S]*setAppLockReady\(false\);[\s\S]*setAppLocked\(true\);[\s\S]*await appLockStore\.isLockConfiguredForUser/,
  "authenticated content must be hidden before asynchronous PIN state lookup",
);
for (const source of mediaRendererSources) {
  assert.match(source, /beginAppLockMediaActivity\(\)/, "media picker must begin its lock exception");
  assert.match(
    source,
    /finally\s*\{[\s\S]*endAppLockMediaActivity\(\)/,
    "media picker must always end its lock exception",
  );
}

resetAppLockMediaActivityForTests();
assert.equal(isAppLockMediaActivityActive(), false, "media exception starts inactive");
beginAppLockMediaActivity();
beginAppLockMediaActivity();
assert.equal(isAppLockMediaActivityActive(), true, "nested media operations remain active");
endAppLockMediaActivity();
assert.equal(isAppLockMediaActivityActive(), true, "one active media operation retains exception");
endAppLockMediaActivity();
assert.equal(isAppLockMediaActivityActive(), false, "media exception ends after every operation");
endAppLockMediaActivity();
assert.equal(isAppLockMediaActivityActive(), false, "media activity count cannot become negative");

await clearLockForTests();

assert.equal(isValidPin("1234"), true, "4 digit PIN is valid");
assert.equal(isValidPin("12345678"), true, "8 digit PIN is valid");
assert.equal(isValidPin("123"), false, "short PIN is rejected");
assert.equal(isValidPin("12ab"), false, "non-numeric PIN is rejected");

assert.equal(await isLockConfiguredForUser(user), false, "lock starts unconfigured");

await configureLockForUser(user, "123456", { biometricEnabled: true });
const configuredRecord = await readLockRecord();
assert.equal(configuredRecord.pin_hash.length, 64, "PIN uses a SHA-256 digest");

assert.equal(await isLockConfiguredForUser(user), true, "lock is scoped to configured user");
assert.equal(
  await isLockConfiguredForUser(otherUser),
  false,
  "lock is not shared across study users",
);
assert.equal(await verifyPinForUser(user, "999999"), false, "wrong PIN fails");
assert.equal(await verifyPinForUser(otherUser, "123456"), false, "other user cannot unlock");
assert.equal(await verifyPinForUser(user, "123456"), true, "configured PIN unlocks");
assert.equal(
  await isBiometricUnlockEnabledForUser(user),
  true,
  "biometric preference is persisted for the configured user",
);

let authenticateCalls = 0;
setLocalAuthenticationForTests({
  hasHardwareAsync: async () => true,
  isEnrolledAsync: async () => true,
  supportedAuthenticationTypesAsync: async () => [1],
  authenticateAsync: async (options) => {
    authenticateCalls += 1;
    assert.equal(options.promptMessage, "Unlock DYNAMIC");
    return { success: true };
  },
});

assert.deepEqual(await unlockWithBiometrics(user), { ok: true }, "enabled biometric unlock succeeds");
assert.equal(authenticateCalls, 1, "native authentication prompt is invoked once");

await setBiometricUnlockForUser(user, false);
assert.equal(
  await isBiometricUnlockEnabledForUser(user),
  false,
  "biometric preference can be disabled for the configured user",
);
assert.deepEqual(
  await unlockWithBiometrics(user),
  { ok: false, reason: "not_configured" },
  "disabled biometric preference blocks biometric unlock",
);

await setBiometricUnlockForUser(user, true);
assert.equal(
  await isBiometricUnlockEnabledForUser(user),
  true,
  "biometric preference can be re-enabled when device biometrics are available",
);

await clearLockForTests();
setLocalAuthenticationForTests(null);
