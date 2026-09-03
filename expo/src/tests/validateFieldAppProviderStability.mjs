/** Verifies provider state stabilization keeps no-op clock evaluations referentially stable. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { areClockGuardValuesEqual, stabilizeClockGuard } = await import(
  "../shell/fieldAppProviderStability.js"
);

const previous = { status: "warning", message: "Clock is ahead", skewMs: 120000 };
const equivalent = { status: "warning", message: "Clock is ahead", skewMs: 120000 };
const changedStatus = { status: "blocked", message: "Clock is behind", skewMs: -120000 };

assert.equal(areClockGuardValuesEqual(previous, previous), true);
assert.equal(areClockGuardValuesEqual(previous, equivalent), true);
assert.equal(areClockGuardValuesEqual(previous, changedStatus), false);
assert.equal(areClockGuardValuesEqual(previous, null), false);
assert.equal(stabilizeClockGuard(previous, equivalent), previous);
assert.equal(stabilizeClockGuard(previous, changedStatus), changedStatus);
assert.equal(stabilizeClockGuard(null, equivalent), equivalent);

const providerPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../shell/FieldAppProvider.js",
);
const providerSource = fs.readFileSync(providerPath, "utf8");
assert.match(
  providerSource,
  /setClockGuard\(\(previous\) => stabilizeClockGuard\(previous, result\)\)/,
);
for (const action of [
  "refreshLocalities",
  "login",
  "loginWithQrPayload",
  "logout",
  "initializeAppLock",
  "configureAppLock",
  "unlockAppWithPin",
  "unlockAppWithBiometrics",
  "unlockAppWithPassword",
  "changeAppPinWithPassword",
  "setAppLockBiometricPreference",
  "clearFormContext",
  "openTask",
  "closeTaskModal",
  "notifyTaskWorklistChanged",
  "resolveActiveDraftForTask",
  "openFormFromTask",
]) {
  assert.match(providerSource, new RegExp(`const ${action} = useCallback\\(`));
}

console.log("FieldAppProvider stability validation passed");
