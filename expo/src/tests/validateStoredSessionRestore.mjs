/** Exercise real session restoration without native storage, networking or study-data writes. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "@babel/core";

const compiled = transformSync(fs.readFileSync(new URL("../modules/auth/authStore.js", import.meta.url), "utf8"), {
  babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"],
}).code;
const user = { user_id: "worker-1", username: "worker", device_id: "device-1", site_id: 2 };
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => ({ data }) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function setup(fetch) {
  const meta = new Map([
    ["access_token", "old-access"], ["refresh_token", "old-refresh"], ["auth_user", JSON.stringify(user)],
    ["device_id", "device-1"], ["study_rows", "drafts-and-finalized-outbox"],
  ]);
  let clears = 0;
  const db = {
    getFirstSync(_sql, [key]) { return { value: meta.get(key) }; },
    runSync(_sql, [key, value]) { meta.set(key, value); },
  };
  const imports = {
    "expo-application": {}, "react-native": { Platform: { OS: "web" } },
    "../tasks/taskSchema.js": { getDb: () => db },
    "../tasks/taskRepository.js": { clearSyncedTaskCache() {} },
    "../households/householdRepository.js": { clearHouseholdCacheForSync() {} },
    "../sync/apiConfig.js": { API_BASE_URL: "https://example.invalid/api/v1" },
    "../storage/localDeviceDataReset.js": { async clearLocalDeviceData() { clears++; meta.clear(); } },
    "./deviceIdentity.js": { formatAndroidDeviceId: value => value },
    "../../lib/networkErrors.js": {},
  };
  const context = { exports: {}, fetch, console: { error() {}, warn() {} },
    require: id => { assert.ok(id in imports, `Unexpected import ${id}`); return imports[id]; } };
  vm.runInNewContext(compiled, context);
  return { auth: context.exports, meta, clears: () => clears };
}

const accepted = setup(async () => response(200, user));
assert.equal((await accepted.auth.restoreSession()).user_id, user.user_id);
assert.equal(accepted.clears(), 0);
assert.equal(accepted.meta.get("study_rows"), "drafts-and-finalized-outbox");

// Two startup/sync callers used to rotate the same token and mistake the loser for revocation.
let refreshCalls = 0;
const refreshReply = deferred();
const concurrent = setup(async (url, options) => {
  if (url.endsWith("/auth/refresh")) { refreshCalls++; return refreshReply.promise; }
  return options.headers.Authorization === "Bearer old-access" ? response(401) : response(200, user);
});
const restoring = [concurrent.auth.restoreSession(), concurrent.auth.restoreSession()];
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(refreshCalls, 1, "Concurrent restore must send one rotating refresh request");
refreshReply.resolve(response(200, { access_token: "new-access", refresh_token: "new-refresh" }));
for (const result of await Promise.all(restoring)) assert.equal(result.user_id, user.user_id);
assert.equal(concurrent.clears(), 0);
assert.equal(concurrent.meta.get("study_rows"), "drafts-and-finalized-outbox");
assert.equal(concurrent.meta.get("refresh_token"), "new-refresh");

// An old request may report 401 after another caller has already finished rotating.
let oldChecks = 0, delayedRefreshes = 0;
const lateRejection = deferred();
const delayed = setup(async (url, options) => {
  if (url.endsWith("/auth/refresh")) {
    delayedRefreshes++;
    return response(200, { access_token: "new-access", refresh_token: "new-refresh" });
  }
  if (options.headers.Authorization === "Bearer old-access") {
    return ++oldChecks === 1 ? response(401) : lateRejection.promise;
  }
  return response(200, user);
});
const first = delayed.auth.restoreSession(), second = delayed.auth.restoreSession();
assert.equal((await first).user_id, user.user_id);
lateRejection.resolve(response(401));
assert.equal((await second).user_id, user.user_id);
assert.equal(delayedRefreshes, 1, "Late rejection must reuse the already rotated access token");
assert.equal(delayed.clears(), 0);

for (const unavailable of ["offline", 500]) {
  const cached = setup(async () => { if (unavailable === "offline") throw Error("No network"); return response(unavailable); });
  assert.equal((await cached.auth.restoreSession()).user_id, user.user_id);
  assert.equal(cached.clears(), 0, "Network failures must retain PIN-protected offline work");
}
for (const unavailable of ["offline", 500]) {
  const cached = setup(async url => {
    if (!url.endsWith("/auth/refresh")) return response(401);
    if (unavailable === "offline") throw Error("No network");
    return response(unavailable);
  });
  assert.equal((await cached.auth.restoreSession()).user_id, user.user_id);
  assert.equal(cached.clears(), 0, "Temporary refresh failure must not log out the saved user");
}
const revoked = setup(async () => response(401));
assert.equal(await revoked.auth.restoreSession(), null);
assert.equal(revoked.clears(), 1, "Genuine server rejection must still invalidate the local login");
const rejectedNewToken = setup(async url => url.endsWith("/auth/refresh") ?
  response(200, { access_token: "rejected-access", refresh_token: "rejected-refresh" }) : response(401));
assert.equal(await rejectedNewToken.auth.restoreSession(), null);
assert.equal(rejectedNewToken.clears(), 1, "A revoked newly issued token must not grant offline access");
const missingRefresh = setup(async () => response(401));
missingRefresh.meta.delete("refresh_token");
assert.equal(await missingRefresh.auth.restoreSession(), null);
assert.equal(missingRefresh.clears(), 1);

let rotations = 0;
const repeated = setup(async () => response(200, { access_token: `access-${++rotations}`, refresh_token: `refresh-${rotations}` }));
await repeated.auth.refreshStoredSession("old-access");
await repeated.auth.refreshStoredSession("access-1");
assert.equal(rotations, 2, "Completed refresh promises must not prevent a later legitimate refresh");

const logoutReply = deferred();
const loggedOut = setup(async () => logoutReply.promise);
const outstanding = loggedOut.auth.refreshStoredSession("old-access");
await loggedOut.auth.logout();
logoutReply.resolve(response(200, { access_token: "late-access", refresh_token: "late-refresh" }));
assert.equal((await outstanding).ok, false);
assert.equal(loggedOut.auth.getToken(), null, "An outstanding refresh must not undo explicit logout");
assert.equal(loggedOut.auth.getUser(), null);
for (const method of ["login", "loginWithQrPayload"]) {
  const signingIn = setup(async url => response(200, url.endsWith("/users/me") ? user : {
    access_token: "login-access", refresh_token: "login-refresh", user,
  }));
  const result = method === "login" ? await signingIn.auth.login("worker", "test-password") :
    await signingIn.auth.loginWithQrPayload("test-encrypted-payload");
  assert.equal(result.ok, true);
  assert.ok(Number.isFinite(Date.parse(signingIn.meta.get("auth_session_refreshed_at"))),
    `${method} must record successful session renewal`);
}

let unlockRenewals = 0;
const regularlyUnlocked = setup(async () => response(200, {
  access_token: `unlock-access-${++unlockRenewals}`, refresh_token: `unlock-refresh-${unlockRenewals}`,
}));
await regularlyUnlocked.auth.renewSessionAfterUnlock();
await regularlyUnlocked.auth.renewSessionAfterUnlock();
assert.equal(unlockRenewals, 1, "Repeated PIN unlocks within 24 hours must not rotate repeatedly");
regularlyUnlocked.meta.set("auth_session_refreshed_at", new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString());
await regularlyUnlocked.auth.renewSessionAfterUnlock();
assert.equal(unlockRenewals, 2, "Daily online unlock must renew the rotating refresh session");
assert.equal(regularlyUnlocked.clears(), 0);
assert.equal(regularlyUnlocked.meta.get("study_rows"), "drafts-and-finalized-outbox");
const offlineUnlock = setup(async () => { throw Error("No network"); });
assert.equal((await offlineUnlock.auth.renewSessionAfterUnlock()).ok, false);
assert.equal(offlineUnlock.clears(), 0, "Offline PIN unlock must not erase the saved login or study data");
assert.equal(offlineUnlock.auth.getUser().user_id, user.user_id);
assert.equal(offlineUnlock.meta.has("auth_session_refreshed_at"), false,
  "Failed renewal must not throttle a later retry");
console.log("Saved session restoration passed: accepted restart, shared/late refresh, offline fallback, revocation and logout.");
