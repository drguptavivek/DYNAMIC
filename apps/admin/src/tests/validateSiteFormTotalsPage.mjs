import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

let user = { user_id: "central", role: "central_admin" };
let slots = [], cursor = 0, effects = [], dirty = true, tree;
const requests = [];
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
globalThis.siteTotalsHarness = {
  useAuth: () => ({ user }),
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; dirty = true; }];
  },
  useEffect(callback, deps) {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) {
      slots[i]?.cleanup?.();
      const slot = slots[i] = { deps };
      effects.push(() => { slot.cleanup = callback(); });
    }
  },
  api: { get(path) { return new Promise((resolve, reject) => requests.push({ path, resolve, reject })); } },
};
const output = await build({
  entryPoints: [fileURLToPath(new URL("../pages/SiteFormTotalsPage.tsx", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  plugins: [{ name: "site-totals-dependencies", setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-router-dom)$|\/lib\/(api|auth-context)$|\.module\.css$/ }, args => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents:
      args.path === "react" ? "export const useState=(...x)=>globalThis.siteTotalsHarness.useState(...x),useEffect=(...x)=>globalThis.siteTotalsHarness.useEffect(...x);" :
      args.path === "react/jsx-runtime" ? "export const Fragment='Fragment',jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;" :
      args.path === "react-router-dom" ? "export const Link='a',Navigate='Navigate';" :
      args.path.endsWith("/api") ? "export const api=globalThis.siteTotalsHarness.api;" :
      args.path.endsWith("/auth-context") ? "export const useAuth=()=>globalThis.siteTotalsHarness.useAuth();" :
      "export default new Proxy({}, {get:(_,key)=>key});",
    }));
  } }],
});
const compiled = { exports: {} };
new Function("module", "exports", output.outputFiles[0].text)(compiled, compiled.exports);
function render() {
  for (let i = 0; i < 10 && dirty; i++) {
    dirty = false; cursor = 0;
    tree = compiled.exports.default();
    while (typeof tree?.type === "function") tree = tree.type(tree.props);
    effects.splice(0).forEach(effect => effect());
  }
}
const nodes = node => !node || typeof node !== "object" ? [] :
  [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = node => typeof node === "object" && node ? [node.props?.children].flat(Infinity).map(text).join("") : String(node ?? "");
const button = label => nodes(tree).find(node => node.type === "button" && text(node) === label);
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };

render();
assert.equal(requests.length, 1);
assert.equal(requests[0].path, "/dashboard/site-form-totals", "No date filter is sent");
assert.match(text(tree), /Loading site totals/);
const result = { generated_at: "2026-10-30T04:00:00Z", sites: [
  { site_id: 1, site_name: "Bareilly", total: 6, forms_by_code: { HHQ: 3, WQ: 2, PEF: 1 } },
  { site_id: 2, site_name: "Ballabhgarh", total: 1, forms_by_code: { NEW_FORM: 1 } },
  { site_id: 7, site_name: "New study site", total: 0, forms_by_code: {} },
] };
requests[0].resolve(result); await flush();
const cards = nodes(tree).filter(node => node.type === "section");
assert.equal(cards.length, 3, "Every site appears, including newly added and zero-activity sites");
assert.match(text(cards[0]), /BHQ3BWQ2PEF1/);
assert.ok(text(cards[1]).includes("NEW_FORM1"), "Additional form types are retained");
assert.equal(nodes(cards[2]).filter(node => node.type === "dd").length, 12);
assert.ok(nodes(cards[2]).filter(node => node.type === "dd").every(node => text(node) === "0"));
assert.ok(nodes(tree).some(node => node.type === "a" && node.props.to === "/staff-dashboard"));
assert.ok(!nodes(tree).some(node => node.type === "input" && node.props.type === "date"));
button("Refresh").props.onClick(); render();
assert.match(text(tree), /Loading site totals/);
assert.equal(nodes(tree).filter(node => node.type === "section").length, 0, "Stale totals are hidden while refreshing");
requests[1].reject(new Error("Connection interrupted")); await flush();
assert.ok(nodes(tree).some(node => node.props?.role === "alert"));
assert.match(text(tree), /Connection interrupted/);
assert.equal(nodes(tree).filter(node => node.type === "section").length, 0);
button("Try again").props.onClick(); render();
requests[2].resolve({ ...result, sites: [] }); await flush();
assert.match(text(tree), /No study sites found/);
const requestCount = requests.length;
slots.forEach(slot => slot?.cleanup?.()); slots = []; effects = [];
user = { user_id: "site-manager", role: "site_data_manager", site_id: 2 }; dirty = true; render();
assert.equal(requests.length, requestCount + 1, "Site data managers request their server-scoped site totals");
assert.equal(nodes(tree).filter(node => node.type === "section").length, 0, "Central totals are not reused on account change");
requests[requestCount].resolve({ ...result, sites: [result.sites[1]] }); await flush();
assert.equal(nodes(tree).filter(node => node.type === "section").length, 1);
assert.ok(text(tree).includes("Ballabhgarh"));
assert.ok(!text(tree).includes("Bareilly"));
assert.ok(nodes(tree).some(node => node.type === "a" && node.props.to === "/staff-dashboard"));
user = { user_id: "field-worker", role: "field_worker" }; dirty = true; render();
assert.equal(tree.type, "Navigate");
assert.equal(requests.length, requestCount + 1, "Other roles cannot request site totals");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
assert.match(appSource, /role === "central_admin" \|\| user\?\.role === "site_data_manager" \? <SiteFormTotalsPage \/> : <DashboardPage \/>/);
assert.match(appSource, /path="\/staff-dashboard" element=\{<DashboardPage \/>\}/);
const layoutSource = readFileSync(new URL("../components/Layout.tsx", import.meta.url), "utf8");
assert.match(layoutSource, /canViewSiteTotals = user\?\.role === "central_admin" \|\| user\?\.role === "site_data_manager"/);
assert.match(layoutSource, /canViewSiteTotals \? \[\{ path: "\/staff-dashboard"/);
const pageSource = readFileSync(new URL("../pages/SiteFormTotalsPage.tsx", import.meta.url), "utf8");
assert.ok(pageSource.includes('key={`${user.user_id}:${user.role}:${user.site_id}`}'), "Scope changes remount the totals view");
delete globalThis.siteTotalsHarness;
console.log("Site cards passed: all-time totals, central and site-manager access, scoped response display, other-role guard, refresh/error/empty states and staff dashboard route.");
