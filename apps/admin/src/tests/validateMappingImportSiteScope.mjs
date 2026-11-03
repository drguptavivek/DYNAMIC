import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";

// Render the existing import modal without uploading files or changing households.
const source = readFileSync(new URL("../pages/MastersPage.tsx", import.meta.url), "utf8");
const modal = source.slice(source.indexOf("function MappingCsvImportModal("), source.indexOf("function formatConsent("));
const compiled = await transform(`const {useState,useEffect,useAuth,api,styles}=globalThis.importHarness; ${modal}\nmodule.exports=MappingCsvImportModal;`, { loader: "tsx", jsxFactory: "element", jsxFragment: "'fragment'" });
let user, slots, cursor, effects, dirty, tree;
const uploads = [];
const sites = [{ site_id: 1, site_name: "Bareilly" }, { site_id: 2, site_name: "Ballabhgarh" }];
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
globalThis.importHarness = {
  styles: {},
  useAuth: () => ({ user }),
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; dirty = true; }];
  },
  useEffect(callback, deps) {
    const index = cursor++;
    if (!same(slots[index], deps)) { slots[index] = deps; effects.push(callback); }
  },
  api: { async upload(path, data) { uploads.push({ path, site: data.get("site_id") }); return { ready: 1, rows: [], total: 1 }; } },
};
const output = { exports: {} };
const element = (type, props, ...children) => ({ type, props: { ...props, children } });
new Function("module", "element", compiled.code)(output, element);
const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = (node) => typeof node === "object" && node ? [node.props?.children].flat(Infinity).map(text).join("") : String(node ?? "");
function render() {
  for (let i = 0; dirty && i < 10; i++) {
    dirty = false; cursor = 0;
    tree = output.exports({ sites, onClose() {}, async onImported() {} });
    effects.splice(0).forEach((callback) => callback());
  }
}
function reset(nextUser) { user = nextUser; slots = []; effects = []; dirty = true; render(); }
const siteSelect = () => nodes(tree).find((node) => node.props?.id === "mapping-import-site");
const input = () => nodes(tree).find((node) => node.type === "input" && node.props.type === "file");
const button = (label) => nodes(tree).find((node) => node.type === "button" && text(node).trim() === label);
const file = new File(["csv"], "households.csv", { type: "text/csv" });

reset({ role: "site_data_manager", site_id: 2 });
assert.equal(siteSelect().props.value, "2");
assert.equal(siteSelect().props.disabled, true);
assert.deepEqual(nodes(siteSelect()).filter((node) => node.type === "option").map((node) => String(node.props.value)), ["", "2"]);
input().props.onChange({ target: { files: [file] } }); render();
await button("Preview").props.onClick(); render();
assert.deepEqual(uploads.at(-1), { path: "/masters/mapping-frame/import-csv/preview", site: "2" });
assert.equal(button("Add Data").props.disabled, false);
globalThis.window = { confirm: () => true };
await button("Add Data").props.onClick(); render();
assert.deepEqual(uploads.at(-1), { path: "/masters/mapping-frame/import-csv", site: "2" });
user = { role: "site_data_manager", site_id: 1 }; dirty = true; render();
assert.equal(siteSelect().props.value, "1");
assert.equal(button("Add Data").props.disabled, true, "Changing account site discards previous preview and file");
reset({ role: "site_data_manager", site_id: null });
assert.equal(siteSelect().props.value, "");
assert.equal(input(), undefined);
assert.equal(button("Add Data").props.disabled, true);
reset({ role: "central_admin", site_id: null });
assert.equal(siteSelect().props.disabled, false);
assert.deepEqual(nodes(siteSelect()).filter((node) => node.type === "option").map((node) => String(node.props.value)), ["", "1", "2"]);
siteSelect().props.onChange({ target: { value: "1" } }); render();
input().props.onChange({ target: { files: [file] } }); render();
assert.equal(button("Add Data").props.disabled, true, "Preview is still required before import");
await button("Preview").props.onClick(); render();
assert.equal(uploads.at(-1).site, "1");
delete globalThis.window;
delete globalThis.importHarness;
console.log("Household CSV import site scope passed: manager pinned to own site, preview/import payload, missing site denied, site changes clear preview, central selection preserved.");
