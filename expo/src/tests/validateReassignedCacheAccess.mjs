/** Cached detail routes and HDSS must respect the account's current scope. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { getAssignedBlbRegistryVillages, getSelectedBlbRegistryVillages } from "../modules/households/blbRegistryScope.js";

const today = "2026-10-29";
const user = { role: "field_worker", site_id: 2, area_assignments: [{ site_id: 2, locality_code: "39" }] };
const original = JSON.stringify(user);
assert.deepEqual(getAssignedBlbRegistryVillages(user, today), ["39"]);
assert.deepEqual(getAssignedBlbRegistryVillages({ ...user, site_id: 1 }, today), []);
assert.deepEqual(getSelectedBlbRegistryVillages({ ...user, site_id: 1 }, "39", today), []);
assert.deepEqual(getAssignedBlbRegistryVillages({ ...user, role: "central_admin", site_id: null }, today), ["39"]);
assert.equal(JSON.stringify(user), original);

const oldId = "1-01-0004-04", currentId = "2-39-0002-01";
let assignedIds = [currentId], cursor = 0, slots = [], effects = [], reads = [], pefCalls = 0, opened = 0;
let pendingRows = null;
const rows = [{ household_id: currentId, individual_id: `${currentId}-02`, member_name: "Current member", woman_questionnaire_eligible: 1 }];
const beforeRows = JSON.stringify(rows);
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const react = {
  createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
  useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: initial };
    return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
  },
  useEffect(effect, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) {
      slots[index]?.cleanup?.();
      slots[index] = { deps };
      effects.push(() => { slots[index].cleanup = effect(); });
    }
  },
};
const imports = {
  react,
  "react-native": { Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View", StyleSheet: { create: value => value } },
  "./householdRepository.js": {
    async getHousehold(id) { reads.push(["household", id]); return { household_id: id }; },
    async listHouseholdMembers(id) { reads.push(["members", id]); return pendingRows ? pendingRows : rows; },
    async searchHouseholdMembers() { reads.push(["search"]); return pendingRows ? pendingRows : rows; },
  },
  "../sync/householdAssignmentScope.js": { getAssignedHouseholdIds: () => assignedIds },
  "../../navigation/routes.js": { ROUTES: {}, navigateTo() {} },
  "../pregnancy/directPef.js": {
    async createDirectPefTask({ member }) { pefCalls++; return { task: { household_id: member.household_id } }; },
    async getDirectPefEligibility() { return { eligible: true }; },
  },
  "./householdMemberLabels.js": { formatHouseholdMemberStatus: () => "", formatHouseholdRelationship: () => "" },
};
const context = { module: { exports: {} }, require: id => imports[id], setTimeout, clearTimeout };
vm.runInNewContext(transformSync(readFileSync(new URL("../modules/households/HouseholdMembersModule.js", import.meta.url), "utf8"), { loader: "jsx", format: "cjs" }).code, context);
const component = context.module.exports.HouseholdMembersModule;
const render = id => { cursor = 0; return component({ householdId: id, onOpenTask: () => { opened++; } }); };
const flush = async () => { effects.splice(0).forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); };
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
const text = tree => nodes(tree).flatMap(node => node.props?.children || []).filter(value => typeof value === "string").join(" ");
const reset = () => { slots.forEach(slot => slot?.cleanup?.()); slots = []; effects = []; reads = []; };

let tree = render(oldId); await flush(); tree = render(oldId);
assert.match(text(tree), /no longer assigned/);
assert.deepEqual(reads, [], "A known old route must not read cached household/member data");

reset();
tree = render(currentId); await flush(); tree = render(currentId);
assert.match(text(tree), /Current member/);
assert.deepEqual(reads, [["household", currentId], ["members", currentId]]);
const button = nodes(tree).find(node => node.type?.name === "DirectPefButton");
assert.ok(button);
assignedIds = [];
await button.props.onPress();
assert.equal(pefCalls, 0, "A callback rendered before scope withdrawal must not create a task");
assert.match(text(render(currentId)), /no longer assigned/);
assignedIds = [currentId];
await button.props.onPress();
assert.equal(pefCalls, 1);
assert.equal(opened, 1);

reset();
let resolveRows;
pendingRows = new Promise(resolve => { resolveRows = resolve; });
render(currentId); await flush();
assignedIds = [];
resolveRows(rows); await flush();
assert.equal(slots[0].value.length, 0, "A withdrawn scope must discard an in-flight member result");
assert.match(text(render(currentId)), /no longer assigned/);
pendingRows = null;

reset(); assignedIds = [currentId];
pendingRows = new Promise(resolve => { resolveRows = resolve; });
render(""); await flush();
assignedIds = [];
resolveRows(rows); await flush();
assert.equal(slots[0].value.length, 0, "Global search results must be filtered against scope after the read completes");
assert.ok(!text(render("")).includes("Current member"));
pendingRows = null;

reset(); assignedIds = null;
render(oldId); await flush();
assert.equal(reads.length, 2, "Non-field-worker scope remains unchanged");
assert.equal(JSON.stringify(rows), beforeRows);
reset();
console.log("Current-site HDSS and member-detail guards passed, including stale PEF callbacks and in-flight cache reads.");
