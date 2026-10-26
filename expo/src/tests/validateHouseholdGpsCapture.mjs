import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { startHouseholdGpsCapture } from "../lib/gpsCapture.js";
import { readHouseholdGps, buildHouseholdMapsUrl } from "../lib/householdGps.js";
import { NATIVE_FORM_TEXT } from "../lib/nativeFormText.js";
import { createSurveyModel } from "../polyfills/surveyCoreNative.js";
import { beginAppLockMediaActivity, endAppLockMediaActivity, isAppLockMediaActivityActive,
  resetAppLockMediaActivityForTests } from "../modules/auth/appLockMediaActivity.js";

const timestamp = Date.parse("2026-10-19T10:00:00.000Z");
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function fixture({ granted = true, enabled = true, synchronous, delayed = false,
  delayedPermission = false, delayedServices = false, permissionError, androidAccuracy } = {}) {
  let callback, errorCallback, timeout, resolveWatch, resolvePermission, rejectPermission, resolveServices;
  let removed = 0, watches = 0, waiting = 0, cleared = 0, requested = 0, requesting = 0, serviceChecks = 0;
  let enabledNow = enabled, delayNextCheck = false;
  const timers = new Map();
  let timerId = 0;
  const subscription = { remove: () => removed++ };
  const permission = { granted, ...(androidAccuracy ? { android: { accuracy: androidAccuracy } } : {}) };
  const location = {
    Accuracy: { BestForNavigation: 6 },
    requestForegroundPermissionsAsync: () => {
      requested++;
      assert.equal(isAppLockMediaActivityActive(), true, "Only the system permission request needs the app-lock exception");
      if (permissionError === "throw") throw new Error("permission failed");
      if (permissionError === "reject") return Promise.reject(new Error("permission failed"));
      return delayedPermission ? new Promise((resolve, reject) => { resolvePermission = resolve; rejectPermission = reject; }) : Promise.resolve(permission);
    },
    hasServicesEnabledAsync: async () => {
      serviceChecks++;
      if ((delayedServices && serviceChecks === 1) || delayNextCheck) {
        delayNextCheck = false;
        return new Promise(resolve => { resolveServices = resolve; });
      }
      return enabledNow;
    },
    watchPositionAsync: async (options, receive, fail) => {
      watches++; callback = receive; errorCallback = fail;
      assert.deepEqual(options, { accuracy: 6, timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false });
      if (synchronous) receive(synchronous);
      return delayed ? new Promise(resolve => { resolveWatch = resolve; }) : subscription;
    },
  };
  const operation = startHouseholdGpsCapture(location, { now: () => timestamp,
    schedule: (fn, ms) => { assert.ok([60000, 2000].includes(ms)); const id = ++timerId; timers.set(id, { fn, ms }); if (ms === 60000) timeout = fn; return id; },
    unschedule: id => { cleared++; timers.delete(id); }, onWaiting: () => waiting++,
    onRequestingPermission: () => requesting++ });
  const outcome = operation.promise.then(gps => ({ gps }), error => ({ error: error.message }));
  return { operation, outcome, emit: p => callback(p), fail: () => errorCallback("native error"),
    expire: () => timeout(), resolveWatch: () => resolveWatch(subscription),
    resolvePermission: () => resolvePermission(permission), rejectPermission: () => rejectPermission(new Error("permission failed")),
    resolveServices: () => resolveServices(enabledNow), setEnabled: value => { enabledNow = value; },
    delayNextServices: () => { delayNextCheck = true; },
    poll: () => { const next = [...timers].find(([, timer]) => timer.ms === 2000); assert.ok(next); timers.delete(next[0]); next[1].fn(); },
    counts: () => ({ removed, watches, waiting, cleared, requested, requesting, serviceChecks, pendingTimers: timers.size }) };
}
const fix = (accuracy = 25, time = timestamp) => ({ timestamp: time, coords: { latitude: 0, longitude: 0, accuracy } });
resetAppLockMediaActivityForTests();
for (const granted of [true, false]) {
  const f = fixture({ delayedPermission: true, granted });
  assert.equal(isAppLockMediaActivityActive(), false, "Checking device Location must not hold the app-lock exception");
  await flush(); assert.equal(isAppLockMediaActivityActive(), true, "Pending Android permission dialog must not immediately trigger PIN lock");
  f.resolvePermission(); await flush();
  assert.equal(isAppLockMediaActivityActive(), false, "The exception must end before waiting for satellites or GPS services");
  if (granted) {
    assert.equal(f.counts().watches, 1);
    f.emit(fix()); assert.ok((await f.outcome).gps);
  } else {
    assert.equal((await f.outcome).error, "location_permission_was_not_granted");
  }
}
for (const permissionError of ["throw", "reject"]) {
  const f = fixture({ permissionError });
  assert.equal((await f.outcome).error, "gps_capture_failed");
  assert.equal(isAppLockMediaActivityActive(), false, "Permission exceptions must release app-lock protection");
  assert.equal(f.counts().watches, 0);
}
{
  const f = fixture({ delayedServices: true, delayed: true }); await flush();
  assert.equal(isAppLockMediaActivityActive(), false, "Checking enabled services must not inherit the permission exception");
  f.resolveServices(); await flush();
  assert.equal(isAppLockMediaActivityActive(), false, "Starting a GPS watch must not inherit the permission exception");
  f.resolveWatch(); await flush();
  f.operation.cancel(); await f.outcome;
}
for (const action of ["cancel", "expire"]) {
  for (const settlePermission of ["resolvePermission", "rejectPermission"]) {
    const f = fixture({ delayedPermission: true }); await flush();
    assert.equal(isAppLockMediaActivityActive(), true);
    if (action === "cancel") f.operation.cancel(); else f.expire();
    assert.equal((await f.outcome).error, action === "cancel" ? "gps_capture_cancelled" : "gps_timeout");
    assert.equal(isAppLockMediaActivityActive(), false, "Cancelling or timing out an unresolved permission prompt must release its exception");
    beginAppLockMediaActivity();
    f[settlePermission](); await flush();
    assert.equal(isAppLockMediaActivityActive(), true, "Late permission completion must not release a newer camera operation's exception");
    assert.equal(f.counts().watches, 0);
    assert.equal(f.counts().cleared, 1);
    endAppLockMediaActivity();
    assert.equal(isAppLockMediaActivityActive(), false);
  }
}
{
  beginAppLockMediaActivity();
  const f = fixture({ delayedPermission: true }); await flush();
  f.resolvePermission(); await flush();
  assert.equal(isAppLockMediaActivityActive(), true, "A nested camera operation must survive GPS permission completion");
  endAppLockMediaActivity();
  assert.equal(isAppLockMediaActivityActive(), false, "An active GPS watch must not delay ordinary background PIN locking");
  f.operation.cancel(); await f.outcome;
}
{
  const f = fixture(); await flush();
  for (const accuracy of [25.1, null, -1, undefined, '25', NaN, Infinity]) f.emit({ ...fix(), coords: { ...fix().coords, accuracy } });
  for (const invalidTime of [undefined, NaN, Infinity, '2026-10-19']) f.emit({ ...fix(), timestamp: invalidTime });
  f.emit(fix(1, timestamp - 30000));
  f.emit(fix(1, timestamp + 30000)); f.emit({ ...fix(), coords: { latitude: NaN, longitude: 0, accuracy: 1 } });
  assert.equal(f.counts().removed, 0, "Bad or cached fixes must not complete capture");
  f.emit(fix()); const { gps } = await f.outcome;
  assert.deepEqual(gps, { latitude: 0, longitude: 0 }, 'Capture checks accuracy/time transiently and returns only coordinates');
  assert.equal(f.counts().removed, 1); assert.equal(f.counts().pendingTimers, 0);
}
for (const [options, error] of [[{ granted: false }, "location_permission_was_not_granted"], [{ enabled: false }, "gps_services_disabled"]]) {
  const f = fixture(options); assert.equal((await f.outcome).error, error); assert.equal(f.counts().watches, 0);
  assert.equal(f.counts().pendingTimers, 0);
  if (options.enabled === false) {
    assert.equal(f.counts().requested, 0, "Disabled device Location must fail before requesting app permission");
    assert.equal(f.counts().requesting, 0);
  }
}
{
  const f = fixture({ androidAccuracy: "coarse" });
  assert.equal((await f.outcome).error, "gps_precise_location_required", "Approximate Android permission cannot meet the study GPS accuracy requirement");
  assert.equal(f.counts().watches, 0);
  assert.equal(f.counts().pendingTimers, 0);
  assert.equal(isAppLockMediaActivityActive(), false);
}
{
  const f = fixture({ androidAccuracy: "fine" }); await flush();
  f.emit(fix()); assert.ok((await f.outcome).gps, "Precise Android permission supports an offline fix");
  assert.equal(f.counts().pendingTimers, 0);
}
{
  const f = fixture({ delayedPermission: true }); await flush();
  f.setEnabled(false); f.resolvePermission();
  assert.equal((await f.outcome).error, "gps_services_disabled", "Location is rechecked after the permission dialog");
  assert.equal(f.counts().watches, 0);
  assert.equal(f.counts().pendingTimers, 0);
}
{
  const f = fixture(); await flush();
  f.poll(); await flush();
  assert.equal(f.counts().pendingTimers, 2, "Successful service checks keep one poll and the capture deadline");
  f.setEnabled(false); f.poll();
  assert.equal((await f.outcome).error, "gps_services_disabled", "Turning Location off during satellite capture stops promptly");
  assert.equal(f.counts().removed, 1);
  assert.equal(f.counts().pendingTimers, 0);
  f.emit(fix()); assert.equal(f.counts().removed, 1, "Late coordinates cannot replace the disabled outcome");
}
for (const delayedInitial of [true, false]) {
  const f = fixture({ delayedServices: delayedInitial }); await flush();
  if (!delayedInitial) { f.delayNextServices(); f.poll(); await flush(); }
  f.operation.cancel();
  assert.equal((await f.outcome).error, "gps_capture_cancelled");
  f.resolveServices(); await flush();
  assert.equal(f.counts().pendingTimers, 0, "Late service status cannot restart a cancelled capture");
  assert.equal(f.counts().requested, delayedInitial ? 0 : 1);
  assert.equal(f.counts().removed, delayedInitial ? 0 : 1);
}
for (const action of ["expire", "fail"]) {
  const f = fixture(); await flush(); f[action]();
  assert.equal((await f.outcome).error, action === "expire" ? "gps_timeout" : "gps_capture_failed");
  assert.equal(f.counts().removed, 1);
  assert.equal(f.counts().pendingTimers, 0);
}
{
  const f = fixture({ delayed: true }); await flush(); f.operation.cancel();
  assert.equal((await f.outcome).error, "gps_capture_cancelled");
  f.resolveWatch(); await flush(); assert.equal(f.counts().removed, 1, "Late subscription must be removed after cancellation");
  f.emit(fix()); assert.equal(f.counts().pendingTimers, 0);
}
{
  const f = fixture({ synchronous: fix() }); assert.ok((await f.outcome).gps);
  await flush(); assert.equal(f.counts().removed, 1, "Synchronous first callback must clean up the later subscription");
}
{
  const f = fixture(); f.operation.cancel(); assert.equal((await f.outcome).error, "gps_capture_cancelled");
  await flush(); assert.equal(f.counts().watches, 0);
}
const saved = { hhq_gps_latitude: 0, hhq_gps_longitude: 0 };
assert.equal(buildHouseholdMapsUrl(readHouseholdGps(saved)), "https://www.google.com/maps/dir/?api=1&destination=0,0");
assert.equal(readHouseholdGps({ ...saved, hhq_gps_latitude: 91 }), null);
assert.deepEqual(readHouseholdGps({ ...saved, hhq_gps_accuracy_m: null }), { latitude: 0, longitude: 0 });
assert.deepEqual(readHouseholdGps({ ...saved, hhq_gps_accuracy_m: 25.1, hhq_gps_captured_at: 'invalid' }), { latitude: 0, longitude: 0 }, 'Legacy capture metadata does not prevent valid saved coordinates from opening maps');
assert.equal(buildHouseholdMapsUrl({ latitude: 1, longitude: 2 }), 'https://www.google.com/maps/dir/?api=1&destination=1,2');
assert.equal(buildHouseholdMapsUrl({ latitude: 91, longitude: 2 }), null);

const compiled = await build({ entryPoints: [fileURLToPath(new URL("../components/forms/renderers/GpsRenderer.js", import.meta.url))],
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", loader: { ".js": "jsx" },
  plugins: [{ name: "gps-native-mocks", setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-native|expo-location)$|\/(QuestionFrame|appLockMediaActivity)\.js$/ },
      args => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents:
      args.path === "react" ? 'export default {}; export const useState=x=>globalThis.gpsHarness.state(x),useRef=x=>globalThis.gpsHarness.ref(x),useEffect=x=>globalThis.gpsHarness.effect(x);' :
      args.path === "react/jsx-runtime" ? 'export const Fragment="Fragment",jsx=(type,props)=>({type,props}),jsxs=jsx;' :
      args.path === "react-native" ? 'export const Text="Text",Pressable="Pressable",ActivityIndicator="ActivityIndicator";export const Alert={alert:(...args)=>globalThis.gpsHarness.alert(...args)},Linking={openURL:url=>globalThis.gpsHarness.openURL(url)};' :
      args.path === "expo-location" ? 'export const Accuracy={BestForNavigation:6},requestForegroundPermissionsAsync=()=>globalThis.gpsHarness.permission(),hasServicesEnabledAsync=async()=>globalThis.gpsHarness.servicesEnabled,watchPositionAsync=(...a)=>globalThis.gpsHarness.watch(...a);' :
      args.path.endsWith("/appLockMediaActivity.js") ? 'export const beginAppLockMediaActivity=()=>globalThis.gpsHarness.beginPermission(),endAppLockMediaActivity=()=>globalThis.gpsHarness.endPermission();' :
      'export const QuestionFrame="QuestionFrame",controlStyles={};'
    }));
  } }] });
const module = { exports: {} }; new Function("module", "exports", compiled.outputFiles[0].text)(module, module.exports);
let hooks = [], cursor = 0, cleanup, changes = 0, requested = 0, removed = 0, callback;
let urls = [], alerts = [];
globalThis.gpsHarness = {
  beginPermission: beginAppLockMediaActivity, endPermission: endAppLockMediaActivity,
  state(value) { const slot = cursor++; if (!(slot in hooks)) hooks[slot] = value; return [hooks[slot], next => { hooks[slot] = next; }]; },
  ref(value) { const slot = cursor++; return hooks[slot] ||= { current: value }; },
  effect(fn) { if (!cleanup) cleanup = fn(); },
  permission: async () => { requested++; return { granted: true }; },
  watch: async (_options, receive) => { callback = receive; return { remove: () => removed++ }; },
  openURL: async url => { urls.push(url); },
  servicesEnabled: true,
  alert: (...args) => alerts.push(args),
};
const question = { name: "hhq_gps_latitude", survey: { data: { unrelated_answer: "keep", ...saved }, nativeText: {
  gps_open_google_maps: { hi: "Hindi maps" } }, mergeData(values) { Object.assign(this.data, values); } }, value: 0 };
function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : []; }
function render() { cursor = 0; return nodes(module.exports.GpsRenderer({ question, locale: "hi", onChange: () => changes++ })); }
const buttons = () => render().filter(n => n.type === "Pressable");
assert.doesNotMatch(JSON.stringify(render()), /Accuracy \(metres\)|25 metres|25-metre/);
assert.ok(!render().filter(n => n.type === "Text").some(n => [].concat(n.props.children).includes(25)),
  "Accuracy is neither stored nor displayed as a questionnaire answer");
assert.equal(NATIVE_FORM_TEXT.HHQ.gps_accuracy_metres, undefined);
assert.doesNotMatch(NATIVE_FORM_TEXT.HHQ.gps_waiting_for_accuracy + NATIVE_FORM_TEXT.HHQ.gps_timeout, /accuracy|25|60/i);
assert.equal(buttons().length, 2);
assert.equal(buttons()[1].props.children.props.children, "Hindi maps");
await buttons()[1].props.onPress(); assert.equal(urls.length, 1);
const capture = buttons()[0].props.onPress(); await flush();
assert.equal(render().filter(n => n.type === "ActivityIndicator").length, 1, "Capture shows a rotating activity indicator");
assert.equal(buttons()[0].props.accessibilityState.busy, true);
assert.equal(buttons()[0].props.disabled, true);
assert.doesNotMatch(JSON.stringify(render()), /Accuracy \(metres\)|25 metres|25-metre/);
buttons()[0].props.onPress(); assert.equal(requested, 1, "Double taps must not create concurrent watches");
callback({ timestamp: Date.now(), coords: { latitude: 28.4, longitude: 77.3, accuracy: 26 } });
assert.deepEqual(question.survey.data, { unrelated_answer: "keep", ...saved });
callback({ timestamp: Date.now(), coords: { latitude: 28.4, longitude: 77.3, accuracy: 15 } });
await capture;
assert.equal(render().filter(n => n.type === "ActivityIndicator").length, 0);
assert.equal(buttons()[0].props.accessibilityState.busy, false);
assert.deepEqual(question.survey.data, { unrelated_answer: 'keep', hhq_gps_latitude: 28.4, hhq_gps_longitude: 77.3 });
assert.equal(question.survey.data.unrelated_answer, "keep"); assert.equal(changes, 1); assert.equal(removed, 1);
question.readOnly = true;
assert.equal(buttons().length, 1, "Read-only saved locations can open maps but cannot be captured again");
await buttons()[0].props.onPress(); assert.equal(urls.length, 2);
question.name = "hhq_gps_longitude"; assert.equal(buttons().length, 0);
question.name = "hhq_gps_latitude"; question.readOnly = false;
const before = JSON.stringify(question.survey.data), pending = buttons()[0].props.onPress(); await flush();
cleanup(); await pending;
assert.equal(JSON.stringify(question.survey.data), before); assert.equal(removed, 2);
// GPS-only merges must retain the live household roster and its editor state.
hooks = []; cleanup = null;
const model = createSurveyModel({ elements: [
  { type: "text", name: "hhq_gps_latitude" }, { type: "text", name: "unrelated_answer" },
  { type: "paneldynamic", name: "roster", templateElements: [{ type: "text", name: "member_name" }] },
] });
model.data = { unrelated_answer: "keep", roster: [{ member_name: "Asha" }] };
const rosterPanel = model.getQuestionByName("roster").panels[0];
question.survey = model;
const realCapture = buttons()[0].props.onPress(); await flush();
callback({ timestamp: Date.now(), coords: { latitude: 28.4, longitude: 77.3, accuracy: 15 } });
await realCapture;
assert.equal(model.getQuestionByName("roster").panels[0], rosterPanel);
assert.deepEqual(model.getValue("roster"), [{ member_name: "Asha" }]);
assert.equal(model.getValue("unrelated_answer"), "keep");
assert.deepEqual(readHouseholdGps(model.data), { latitude: 28.4, longitude: 77.3 });
assert.ok(!('hhq_gps_accuracy_m' in model.data) && !('hhq_gps_captured_at' in model.data));
cleanup();
assert.equal(isAppLockMediaActivityActive(), false, "Renderer capture/unmount paths must not leak the permission exception");
hooks = []; cleanup = null;
question.survey = { data: { ...saved }, nativeText: {
  gps_services_disabled: { hi: "Hindi Location is off" }, capture_gps: { hi: "Hindi capture" },
} };
globalThis.gpsHarness.servicesEnabled = false;
const beforeDisabled = requested;
await buttons()[0].props.onPress();
assert.equal(requested, beforeDisabled, "Location-off renderer path does not prompt for permission");
assert.equal(alerts.length, 1);
assert.equal(alerts[0][0], "Hindi capture");
assert.equal(alerts[0][1], "Hindi Location is off");
assert.equal(render().filter(n => n.type === "ActivityIndicator").length, 0);
assert.equal(buttons()[0].props.disabled, false);
assert.deepEqual(question.survey.data, saved, "Location-off capture preserves saved coordinates");
globalThis.gpsHarness.servicesEnabled = true;
const retryCapture = buttons()[0].props.onPress(); await flush();
assert.equal(requested, beforeDisabled + 1, "Capture retries normally after Location is enabled");
assert.equal(render().filter(n => n.type === "ActivityIndicator").length, 1);
buttons()[1].props.onPress(); await retryCapture;
assert.equal(render().filter(n => n.type === "ActivityIndicator").length, 0, "Cancellation clears the capture spinner");
assert.equal(buttons()[0].props.disabled, false);
assert.deepEqual(question.survey.data, saved, "Cancelled retry preserves existing coordinates");
cleanup();
for (const key of ["gps_latitude", "gps_longitude", "gps_waiting_for_accuracy", "gps_timeout",
  "gps_services_disabled", "gps_capture_failed", "gps_capture_cancelled", "gps_cancel_capture", "gps_open_google_maps",
  "gps_maps_unavailable", "capture_gps", "gps_capturing", "gps_checking_services", "gps_precise_location_required", "not_captured", "location_permission_was_not_granted", "requesting_location_permission"]) {
  assert.ok(NATIVE_FORM_TEXT.HHQ[key], key + " must be available for translation/codebook");
}
delete globalThis.gpsHarness;
console.log("Validated GPS permission-only app-lock exception, cancellation/timeout/nested operation cleanup, offline accuracy, fresh fixes, draft preservation, map links, translation, and read-only UI.");
