import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../shell/FieldAppProvider.js", import.meta.url), "utf8");
const start = source.indexOf("  const unlockAppWithPin = useCallback(");
const end = source.indexOf("  const unlockAppWithPassword = useCallback(", start);
assert.ok(start >= 0 && end > start);
let pinAccepted = false, biometricAccepted = false, renewals = 0;
const lockChanges = [];
const context = {
  user: { user_id: "worker" },
  useCallback: (callback) => callback,
  appLockStore: {
    verifyPinForUser: async () => pinAccepted,
    unlockWithBiometrics: async () => ({ ok: biometricAccepted, reason: "cancelled" }),
  },
  authStore: { renewSessionAfterUnlock() { renewals++; return new Promise(() => {}); } },
  setAppLocked: (value) => lockChanges.push(value),
  setAppLockBiometricEnabled() {}, setAppLockBiometricAvailable() {}, console,
};
vm.runInNewContext(`${source.slice(start, end)}
  this.pinUnlock = unlockAppWithPin; this.biometricUnlock = unlockAppWithBiometrics;`, context);
assert.equal((await context.pinUnlock("wrong")).ok, false);
assert.equal((await context.biometricUnlock()).ok, false);
assert.equal(renewals, 0, "Failed or cancelled unlock must not renew the session");
pinAccepted = true;
assert.equal((await context.pinUnlock("correct")).ok, true);
assert.equal(renewals, 1, "Successful PIN unlock starts renewal without awaiting the network");
biometricAccepted = true;
assert.equal((await context.biometricUnlock()).ok, true);
assert.equal(renewals, 2);
assert.deepEqual(lockChanges, [false, false]);
console.log("PIN and biometric unlock renew in background; offline requests cannot block unlock.");
