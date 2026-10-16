import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const repository = fs.readFileSync(new URL("../modules/households/blbRegistryRepository.js", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../modules/households/HdssListModule.js", import.meta.url), "utf8");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE blb_registry_individuals (uid TEXT, village_code TEXT, village_name TEXT,
  hh_list_no TEXT, family_no TEXT, ind_no TEXT, name TEXT);
  CREATE INDEX browse ON blb_registry_individuals(trim(village_code),trim(hh_list_no),trim(family_no));`);
const insert = sqlite.prepare("INSERT INTO blb_registry_individuals VALUES (?, ?, 'Village', ?, ?, '01', ?)");
const people = [];
for (let i = 0; i < 121; i++) {
  for (const name of ["Asha", i === 120 ? "Last 100%" : "Rani"]) {
    const person = { uid: String(people.length), village_code: i < 60 ? "10" : "11", hh_list_no: String(i).padStart(4, "0"), family_no: "01", name };
    people.push(person);
    insert.run(person.uid, person.village_code, person.hh_list_no, person.family_no, name);
  }
}
insert.run("blank", "10", "", "01", "Asha");
insert.run("outside", "12", "0001", "01", "Asha");
const db = { getFirstAsync: async (sql, values) => sqlite.prepare(sql).get(...values), getAllAsync: async (sql, values) => sqlite.prepare(sql).all(...values) };
const transformedRepository = repository.replace(/^import[\s\S]*?;/gm, "").replace(/^export /gm, "")
  + "\nthis.api = { countBlbRegistryHouseholds, listBlbRegistryHouseholds };";
function loadApi(os) {
  const context = { Platform: { OS: os }, getOfflineDatabase: () => db, window: { localStorage: { getItem: () => JSON.stringify({ individuals: people }) } } };
  vm.runInNewContext(transformedRepository, context);
  return context.api;
}
for (const os of ["android", "web"]) {
  const api = loadApi(os);
  assert.equal(await api.countBlbRegistryHouseholds({}, ["10", "11"]), 121);
  assert.equal(await api.countBlbRegistryHouseholds({ villageCode: " 10 " }, ["10", "11"]), 60);
  assert.equal(await api.countBlbRegistryHouseholds({ villageCode: "12" }, ["10", "11"]), 0);
  assert.equal(await api.countBlbRegistryHouseholds({}, []), 0);
  assert.equal(await api.countBlbRegistryHouseholds({ search: " ASHA , last 100% " }, ["10", "11"]), 1);
  const last = await api.listBlbRegistryHouseholds({ search: " ASHA , last 100% " }, ["10", "11"]);
  assert.equal(last.households.length, 1);
  assert.equal(last.households[0].hh_list_no, "0120", "search/count cover records beyond the first page");
  assert.equal(last.households[0].member_count, 2, "matching household contains both names");
  assert.equal((await api.listBlbRegistryHouseholds({ offset: 100 }, ["10", "11"])).households.length, 21);
}
sqlite.close();

// Execute the real component with a tiny hook host: no phone or React Native runtime is claimed.
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { transformSync } = require("@babel/core");
const hooks = [];
let index = 0;
let effects = [];
let focus;
let focusCleanup;
let back;
let removed = 0;
let countCalls = 0;
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
};
const context = {
  React,
  useState(initial) {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = initial;
    return [hooks[slot], (value) => { hooks[slot] = typeof value === "function" ? value(hooks[slot]) : value; }];
  },
  useRef(initial) { const slot = index++; if (!(slot in hooks)) hooks[slot] = { current: initial }; return hooks[slot]; },
  useCallback: (callback) => callback,
  useEffect(callback, deps) {
    const slot = index++;
    if (!hooks[slot] || JSON.stringify(hooks[slot].deps) !== JSON.stringify(deps)) {
      hooks[slot]?.cleanup?.();
      hooks[slot] = { deps };
      effects.push(() => { hooks[slot].cleanup = callback(); });
    }
  },
  useFocusEffect: (callback) => { focus = callback; },
  BackHandler: { addEventListener(event, callback) {
    assert.equal(event, "hardwareBackPress"); back = callback;
    return { remove() { back = null; removed++; } };
  } },
  countBlbRegistryHouseholds: async () => { countCalls++; return 121; },
  listBlbRegistryHouseholds: async () => ({ households: [{ village_code: "10", hh_list_no: "0001", family_no: "01" }], hasMore: true }),
  FlatList: "FlatList", ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View",
  StyleSheet: { create: (value) => value },
};
const compiled = transformSync(source.replace(/^import[\s\S]*?;/gm, "").replace(/^export /gm, "") + "\nthis.browser = HdssBrowser;", {
  babelrc: false, configFile: false, plugins: [require.resolve("@babel/plugin-transform-react-jsx")],
}).code;
vm.runInNewContext(compiled, context);
function render() {
  index = 0; effects = [];
  const tree = context.browser({ villages: ["10", "11"] });
  effects.forEach((effect) => effect());
  focusCleanup?.();
  focusCleanup = focus();
  return tree;
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
}
const settle = async () => { await new Promise((resolve) => setImmediate(resolve)); };
render(); await settle();
let tree = render();
assert.equal(countCalls, 1);
let all = nodes(tree);
const footer = all.find((node) => node.type === "Text" && node.props.children[0] === "Page ");
assert.equal(footer.props.children.join(""), "Page 1 / 3");
assert.doesNotMatch(footer.props.children.join(""), /households/);
let list = all.find((node) => node.type === "FlatList");
list.props.onScroll({ nativeEvent: { contentOffset: { y: 432 } } });
list.props.renderItem({ item: list.props.data[0] }).props.onPress();
tree = render();
assert.equal(tree.type.name, "HouseholdMembers");
assert.equal(back(), true, "hardware Back consumes only the member-detail back action");
tree = render();
assert.equal(back, null, "list view does not intercept Android Back");
assert.ok(removed > 0);
list = nodes(tree).find((node) => node.type === "FlatList");
assert.equal(list.props.contentOffset.y, 432, "return supplies the saved household list scroll offset");
const next = nodes(tree).find((node) => node.type?.name === "Button" && node.props.children[0] === "Next");
next.props.onPress(); render(); await settle(); tree = render();
assert.equal(countCalls, 1, "page changes reuse the count for the same search and scope");
assert.equal(nodes(tree).find((node) => node.type === "FlatList").props.contentOffset.y, 0);
assert.match(source, /keyExtractor=\{\(member\) => String\(member\.uid\)\}/, "UID remains the internal key");
assert.doesNotMatch(source, /HDSS UID:/, "UID is hidden from member cards");
focusCleanup?.();
console.log("HDSS filtered page counts, presentation, and focus-scoped hardware Back passed");
