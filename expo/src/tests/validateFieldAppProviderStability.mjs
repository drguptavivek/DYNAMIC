/** Verifies provider state stabilization keeps no-op clock evaluations referentially stable. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { areClockGuardValuesEqual, refreshSameSessionUser, stabilizeClockGuard } = await import(
  "../shell/fieldAppProviderStability.js"
);

const previous = { status: "warning", message: "Clock is ahead", skewMs: 120000 };
const oldUser = { user_id: "worker-1", area_assignments: [] };
const refreshedUser = { user_id: "worker-1", area_assignments: [{ site_id: 2, locality_code: "02" }] };
assert.equal(refreshSameSessionUser(oldUser, refreshedUser), refreshedUser);
assert.equal(refreshSameSessionUser(null, refreshedUser), null, "sync cannot reopen a logged-out session");
assert.equal(refreshSameSessionUser(oldUser, { user_id: "worker-2" }), oldUser);
assert.equal(refreshSameSessionUser(oldUser, null), oldUser);
assert.equal(refreshSameSessionUser({ id: "worker-1" }, refreshedUser), refreshedUser);
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
