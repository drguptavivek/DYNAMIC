import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../components/forms/renderers/BhqRegistryLookupDrawer.js", import.meta.url), "utf8");
const requestFunctions = source.slice(source.indexOf("  function updateFilter("), source.indexOf("  function renderPerson("));
const selectionGuard = source.match(/onPress=\{\(\) => \{\s*(if \(resultToken === queryToken.current\) onSelect\?\.\(item\);)\s*\}\}/)?.[1];
assert.ok(selectionGuard, "Selection must reject a callback from an earlier search.");
for (const [setter, value] of [["setVillageCode", "villageCode"], ["setHouseNo", "houseNo"], ["setSearch", "search"]]) {
  assert.ok(source.includes(`onChangeText={(value) => updateFilter(${setter}, value, ${value})}`), `${setter} must invalidate results before the next effect.`);
}

let finishRequest;
const state = { rows: [{ uid: "old-person" }], busy: false, loadingMore: true, hasMore: true, offset: 10, error: "old-error" };
const queryToken = { current: 1 };
const selected = [];
const context = {
  queryToken,
  villageCode: "11",
  houseNo: "0011",
  search: "",
  offset: 10,
  PAGE_SIZE: 10,
  getAssignedBlbRegistryVillages: () => ["11", "12"],
  searchBlbRegistryPeople: () => new Promise((resolve) => { finishRequest = resolve; }),
  onSelect: (item) => selected.push(item),
};
for (const key of Object.keys(state)) {
  context[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => {
    state[key] = typeof value === "function" ? value(state[key]) : value;
  };
}
vm.createContext(context);
vm.runInContext(`${requestFunctions}\nthis.updateFilter = updateFilter; this.loadResults = loadResults;`, context);

const pending = context.loadResults();
const unchangedState = { ...state };
const unchangedToken = queryToken.current;
context.updateFilter(() => assert.fail("An unchanged input must not call its setter."), "11", "11");
assert.deepEqual(state, unchangedState, "An unchanged input notification must not clear results or alter loading state.");
assert.equal(queryToken.current, unchangedToken, "An unchanged input must leave its pending request valid.");
const oldSelection = vm.runInContext(`((resultToken, item) => () => { ${selectionGuard} })(queryToken.current, { uid: "old-person" })`, context);
context.updateFilter((value) => { context.villageCode = value; }, "12", context.villageCode);
assert.equal(context.villageCode, "12");
assert.equal(state.rows.length, 0, "Previous village rows disappear synchronously, before debounce/effects.");
assert.equal(state.hasMore, false);
assert.equal(state.offset, 0);
assert.equal(state.loadingMore, false);
assert.equal(state.error, "");
assert.equal(state.busy, true);
oldSelection();
assert.equal(selected.length, 0, "A stale Select callback cannot link the previous village's person.");

finishRequest([{ uid: "late-old-village-person" }]);
await pending;
assert.equal(state.rows.length, 0, "A late previous-village request cannot repopulate rows.");
assert.equal(state.busy, true, "The stale request's finally must not settle the new search.");

const current = context.loadResults({ reset: true });
finishRequest([{ uid: "current-village-person" }]);
await current;
assert.equal(state.rows[0].uid, "current-village-person");
assert.equal(state.busy, false);
const currentSelection = vm.runInContext(`((resultToken, item) => () => { ${selectionGuard} })(queryToken.current, { uid: "current-village-person" })`, context);
currentSelection();
assert.equal(selected[0].uid, "current-village-person");

console.log("BHQ lookup input, late-request, and selection guards passed.");
