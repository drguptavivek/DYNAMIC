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
  delayedPermission = false, delayedServices = false, permissionError } = {}) {
  let callback, errorCallback, timeout, resolveWatch, resolvePermission, rejectPermission, resolveServices;
  let removed = 0, watches = 0, waiting = 0, cleared = 0;
  const subscription = { remove: () => removed++ };
  const location = {
    Accuracy: { BestForNavigation: 6 },
    requestForegroundPermissionsAsync: () => {
      assert.equal(isAppLockMediaActivityActive(), true, "Only the system permission request needs the app-lock exception");
      if (permissionError === "throw") throw new Error("permission failed");
      if (permissionError === "reject") return Promise.reject(new Error("permission failed"));
      return delayedPermission ? new Promise((resolve, reject) => { resolvePermission = resolve; rejectPermission = reject; }) : Promise.resolve({ granted });
    },
    hasServicesEnabledAsync: async () => delayedServices ? new Promise(resolve => { resolveServices = resolve; }) : enabled,
    watchPositionAsync: async (options, receive, fail) => {
      watches++; callback = receive; errorCallback = fail;
      assert.deepEqual(options, { accuracy: 6, timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false });
      if (synchronous) receive(synchronous);
      return delayed ? new Promise(resolve => { resolveWatch = resolve; }) : subscription;
    },
  };
  const operation = startHouseholdGpsCapture(location, { now: () => timestamp,
    schedule: (fn, ms) => { assert.equal(ms, 60000); timeout = fn; return 1; },
    unschedule: () => cleared++, onWaiting: () => waiting++ });
  const outcome = operation.promise.then(gps => ({ gps }), error => ({ error: error.message }));
  return { operation, outcome, emit: p => callback(p), fail: () => errorCallback("native error"),
    expire: () => timeout(), resolveWatch: () => resolveWatch(subscription),
    resolvePermission: () => resolvePermission({ granted }), rejectPermission: () => rejectPermission(new Error("permission failed")),
    resolveServices: () => resolveServices(enabled),
    counts: () => ({ removed, watches, waiting, cleared }) };
}
const fix = (accuracy = 25, time = timestamp) => ({ timestamp: time, coords: { latitude: 0, longitude: 0, accuracy } });
resetAppLockMediaActivityForTests();
for (const granted of [true, false]) {
  const f = fixture({ delayedPermission: true, granted });
  assert.equal(isAppLockMediaActivityActive(), true, "Pending Android permission dialog must not immediately trigger PIN lock");
  await flush(); assert.equal(isAppLockMediaActivityActive(), true);
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
    const f = fixture({ delayedPermission: true });
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
  const f = fixture({ delayedPermission: true });
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
  assert.equal(f.counts().removed, 1); assert.equal(f.counts().cleared, 1);
}
for (const [options, error] of [[{ granted: false }, "location_permission_was_not_granted"], [{ enabled: false }, "gps_services_disabled"]]) {
  const f = fixture(options); assert.equal((await f.outcome).error, error); assert.equal(f.counts().watches, 0);
}
for (const action of ["expire", "fail"]) {
  const f = fixture(); await flush(); f[action]();
  assert.equal((await f.outcome).error, action === "expire" ? "gps_timeout" : "gps_capture_failed");
  assert.equal(f.counts().removed, 1);
}
{
  const f = fixture({ delayed: true }); await flush(); f.operation.cancel();
  assert.equal((await f.outcome).error, "gps_capture_cancelled");
  f.resolveWatch(); await flush(); assert.equal(f.counts().removed, 1, "Late subscription must be removed after cancellation");
  f.emit(fix()); assert.equal(f.counts().cleared, 1);
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
      args.path === "react-native" ? 'export const Text="Text",Pressable="Pressable";export const Linking={openURL:url=>globalThis.gpsHarness.openURL(url)};' :
      args.path === "expo-location" ? 'export const Accuracy={BestForNavigation:6},requestForegroundPermissionsAsync=()=>globalThis.gpsHarness.permission(),hasServicesEnabledAsync=async()=>true,watchPositionAsync=(...a)=>globalThis.gpsHarness.watch(...a);' :
      args.path.endsWith("/appLockMediaActivity.js") ? 'export const beginAppLockMediaActivity=()=>globalThis.gpsHarness.beginPermission(),endAppLockMediaActivity=()=>globalThis.gpsHarness.endPermission();' :
      'export const QuestionFrame="QuestionFrame",controlStyles={};'
    }));
  } }] });
const module = { exports: {} }; new Function("module", "exports", compiled.outputFiles[0].text)(module, module.exports);
let hooks = [], cursor = 0, cleanup, changes = 0, requested = 0, removed = 0, callback;
let urls = [];
globalThis.gpsHarness = {
  beginPermission: beginAppLockMediaActivity, endPermission: endAppLockMediaActivity,
  state(value) { const slot = cursor++; if (!(slot in hooks)) hooks[slot] = value; return [hooks[slot], next => { hooks[slot] = next; }]; },
  ref(value) { const slot = cursor++; return hooks[slot] ||= { current: value }; },
  effect(fn) { if (!cleanup) cleanup = fn(); },
  permission: async () => { requested++; return { granted: true }; },
  watch: async (_options, receive) => { callback = receive; return { remove: () => removed++ }; },
  openURL: async url => { urls.push(url); },
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
assert.doesNotMatch(JSON.stringify(render()), /Accuracy \(metres\)|25 metres|25-metre/);
buttons()[0].props.onPress(); assert.equal(requested, 1, "Double taps must not create concurrent watches");
callback({ timestamp: Date.now(), coords: { latitude: 28.4, longitude: 77.3, accuracy: 26 } });
assert.deepEqual(question.survey.data, { unrelated_answer: "keep", ...saved });
callback({ timestamp: Date.now(), coords: { latitude: 28.4, longitude: 77.3, accuracy: 15 } });
await capture;
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
for (const key of ["gps_latitude", "gps_longitude", "gps_waiting_for_accuracy", "gps_timeout",
  "gps_services_disabled", "gps_capture_failed", "gps_capture_cancelled", "gps_cancel_capture", "gps_open_google_maps",
  "gps_maps_unavailable", "capture_gps", "not_captured", "location_permission_was_not_granted", "requesting_location_permission"]) {
  assert.ok(NATIVE_FORM_TEXT.HHQ[key], key + " must be available for translation/codebook");
}
delete globalThis.gpsHarness;
console.log("Validated GPS permission-only app-lock exception, cancellation/timeout/nested operation cleanup, offline accuracy, fresh fixes, draft preservation, map links, translation, and read-only UI.");
