import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "@babel/core";
import * as gpsHelpers from "../lib/householdGps.js";

function load(relativePath, imports) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const context = { exports: {}, require: (id) => imports[id] || {} };
  vm.runInNewContext(transformSync(source, {
    babelrc: false, configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs", "@babel/plugin-transform-react-jsx"],
  }).code, context);
  return context.exports;
}
const answers = {
  hhq_gps_latitude: 28.31, hhq_gps_longitude: 77.32,
  hhq_gps_accuracy_m: 12, hhq_gps_captured_at: "2026-10-19T10:00:00.000Z",
};
let rows = [];
const queries = [];
const repository = load("../modules/households/householdGpsRepository.js", {
  "../../lib/householdGps.js": gpsHelpers,
  "../tasks/taskRepository.js": { listFormResponses(filters) { queries.push(filters); return rows; } },
});
const response = (overrides = {}) => ({ household_id: "H1", answers_json: answers, ...overrides });
assert.equal(repository.getSavedHouseholdGps(null), null);
assert.equal(queries.length, 0, "a missing household must never cause a global response query");
assert.equal(repository.getSavedHouseholdGps("H1"), null);
for (const status of ["invalid_rejected", "rejected", "duplicate", "superseded_by:replacement", "held_for_review"]) {
  rows = [response({ server_response_status: status })];
  assert.equal(repository.getSavedHouseholdGps("H1"), null, status);
}
rows = [response({ sync_status: "superseded" })];
assert.equal(repository.getSavedHouseholdGps("H1"), null);
rows = [
  response({ household_id: "H2" }),
  response({ answers_json: "malformed JSON" }),
  response({ answers_json: { ...answers, hhq_gps_accuracy_m: 26 } }),
  response({ answers_json: JSON.stringify(answers), sync_status: "pending" }),
  response({ answers_json: { ...answers, hhq_gps_latitude: 29 } }),
];
assert.deepEqual(repository.getSavedHouseholdGps("H1"), gpsHelpers.readHouseholdGps(answers), "newest valid local evidence wins");
assert.deepEqual(JSON.parse(JSON.stringify(queries.at(-1))), { form_code: "HHQ", household_id: "H1" });
const prefill = load("../lib/prefillMapper.js", {
  "../modules/households/householdGpsRepository.js": repository,
});
const household = { household_id: "H1", site_id: 2, locality_code: "11", head_name: "Head", address: "Street", locality_type: "rural" };
const restored = prefill.buildHhqPrefill(household, new Date(2026, 9, 19));
assert.equal(typeof restored.then, "undefined", "BHQ prefill retains its synchronous contract");
for (const [key, value] of Object.entries(answers)) assert.equal(restored.prefill[key], value);
assert.equal(restored.prefill.hhq_locality_code, "11");
assert.equal(restored.prefill.hhq_household_head_name, "Head");
assert.equal(restored.prefill.hhq_residence_area_type, 2);
rows = [];
assert.equal(prefill.buildHhqPrefill(household).prefill.hhq_gps_latitude, undefined);

// Exercise real component hooks with delayed household reads and map failures.
const slots = [];
let cursor = 0;
let effects = [];
let reads = [];
let readLocation = () => gpsHelpers.readHouseholdGps(answers);
let openUrl = async () => {};
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: initial };
    return [slots[index].value, (value) => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
  },
  useRef(current) { const index = cursor++; slots[index] ??= { current }; return slots[index]; },
  useEffect(create, deps) {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
      slots[index]?.cleanup?.();
      slots[index] = { deps };
      effects.push(() => { slots[index].cleanup = create(); });
    }
  },
};
const { SavedHouseholdLocation } = load("../components/SavedHouseholdLocation.js", {
  react,
  "react-native": {
    View: "View", Text: "Text", Pressable: "Pressable", StyleSheet: { create: (styles) => styles },
    Linking: { openURL: (url) => openUrl(url) },
  },
  "../lib/householdGps.js": gpsHelpers,
  "../modules/households/householdGpsRepository.js": { getSavedHouseholdGps(id) { reads.push(id); return readLocation(id); } },
});
const render = (householdId, visible = true) => {
  cursor = 0;
  const tree = SavedHouseholdLocation({ householdId, visible });
  const pending = effects; effects = []; pending.forEach((effect) => effect());
  return tree;
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const textOf = (tree) => JSON.stringify(tree);
function button(tree, label) {
  if (!tree || typeof tree !== "object") return null;
  if (tree.type === "Pressable" && textOf(tree).includes(label)) return tree;
  for (const child of tree.props?.children?.flat(Infinity) || []) {
    const found = button(child, label);
    if (found) return found;
  }
  return null;
}
assert.equal(render(undefined), null, "a missing household never renders a false coordinate or throws");
await tick();
assert.deepEqual(reads, [], "a missing household never loads GPS");
render("H1", false); await tick();
assert.deepEqual(reads, [], "closed details must not load GPS");
let resolveOld;
readLocation = (id) => id === "H1" ? new Promise((resolve) => { resolveOld = resolve; }) : null;
render("H1"); await tick();
render("H2"); await tick();
resolveOld(gpsHelpers.readHouseholdGps(answers)); await tick();
assert.equal(render("H2"), null, "a late result cannot show another household's coordinates");
readLocation = () => gpsHelpers.readHouseholdGps(answers);
render("H3"); await tick();
let tree = render("H3");
assert.ok(textOf(tree).includes("28.31"));
assert.ok(!textOf(tree).includes("Accuracy:"), "saved location details hide accuracy while retaining the internal accuracy check");
let opened;
openUrl = async (url) => { opened = url; };
await button(tree, "Open in Google Maps").props.onPress();
assert.equal(opened, "https://www.google.com/maps/dir/?api=1&destination=28.31,77.32");
openUrl = async () => { throw new Error("No maps handler"); };
await button(tree, "Open in Google Maps").props.onPress();
tree = render("H3");
assert.ok(textOf(tree).includes("Could not open Google Maps"));
let rejectOldMap;
openUrl = () => new Promise((resolve, reject) => { rejectOldMap = reject; });
const pendingMap = button(tree, "Open in Google Maps").props.onPress();
render("H5"); await tick();
rejectOldMap(new Error("Old household map failed")); await pendingMap;
assert.ok(!textOf(render("H5")).includes("Could not open Google Maps"), "late map errors cannot leak into another household");
readLocation = () => { throw new Error("Read failed"); };
render("H4"); await tick();
tree = render("H4");
assert.ok(button(tree, "Retry location"));
readLocation = () => gpsHelpers.readHouseholdGps(answers);
button(tree, "Retry location").props.onPress();
render("H4"); await tick();
assert.ok(textOf(render("H4")).includes("28.31"));
console.log("Household GPS persistence, scoped prefill, map target, retry and stale-request checks passed.");
