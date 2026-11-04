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
assert.equal(requests[0].path, "/dashboard/site-form-totals", "All-time view sends no date filter");
assert.match(text(tree), /Loading study progress/);
const emptyWork = () => ({ completed: 0, draft: 0, pending: 0, upcoming: 0, closed: 0, overdue: 0 });
const emptyProgress = () => ({ households: { total: 0, assigned: 0, completed: 0, draft: 0, pending: 0, closed: 0 }, tasks: emptyWork(), tasks_by_code: {}, active_field_workers: 0, eligible_women: 0, active_pregnancies: 0 });
const work = { completed: 30, draft: 5, pending: 15, upcoming: 10, closed: 4, overdue: 3 };
const bwqWork = { completed: 4, draft: 1, pending: 3, upcoming: 2, closed: 1, overdue: 1 };
const pefWork = { completed: 2, draft: 2, pending: 2, upcoming: 4, closed: 0, overdue: 0 };
const result = { generated_at: "2026-11-04T04:00:00Z", sites: [
  { site_id: 1, site_name: "Bareilly", total: 6, forms_by_code: { HHQ: 3, WQ: 2, PEF: 1 }, progress: {
    households: { total: 100, assigned: 80, completed: 40, draft: 5, pending: 50, closed: 5 },
    tasks: { completed: 36, draft: 8, pending: 20, upcoming: 16, closed: 5, overdue: 4 }, tasks_by_code: { HHQ: work, WQ: bwqWork, PEF: pefWork }, active_field_workers: 8, eligible_women: 90, active_pregnancies: 4,
  } },
  { site_id: 2, site_name: "Ballabhgarh", total: 1, forms_by_code: { NEW_FORM: 1 }, progress: { ...emptyProgress(), tasks: { ...emptyWork(), upcoming: 5 }, tasks_by_code: { NEW_FORM: { ...emptyWork(), upcoming: 5 } } } },
  { site_id: 7, site_name: "New study site", total: 0, forms_by_code: {}, progress: emptyProgress() },
] };
requests[0].resolve(result); await flush();
assert.match(text(tree), /Operational dashboard/);
assert.match(text(tree), /Accepted forms received7/);
assert.match(text(tree), /Tasks completed56.3%/);
assert.match(text(tree), /Work open now28/);
assert.match(text(tree), /Overdue tasks4/);
assert.match(text(tree), /36completed \/ 64 actionable tasks/);
assert.match(text(tree), /60.0%/);
assert.match(text(tree), /5 closed \/ cancelled/);
assert.ok(!text(tree).includes("NaN"));
const section = label => nodes(tree).find(node => node.type === "section" && node.props["aria-label"] === label);
const progressCards = () => nodes(section("Questionnaire progress cards")).filter(node => node.type === "article");
const progressCard = code => progressCards().find(node => node.props["aria-label"] === `${code} progress`);
assert.equal(progressCards().length, 13, "All twelve standard questionnaires and additional codes have prominent cards");
for (const code of ["BHQ", "BWQ", "PEF", "PSF", "PFF", "HRF", "UF", "POF", "BAF", "SBF", "NFF", "CDF"]) assert.ok(progressCard(code));
assert.match(text(progressCard("BHQ")), /BHQ60.0%Accepted forms\s3Completed tasks30Draft5Left now15/);
assert.match(text(progressCard("BWQ")), /BWQ50.0%Accepted forms\s2Completed tasks4Draft1Left now3/);
assert.match(text(progressCard("PEF")), /PEF33.3%Accepted forms\s1Completed tasks2Draft2Left now2/);
assert.match(text(progressCard("NEW_FORM")), /Upcoming only/);
assert.match(text(progressCard("CDF")), /No actionable tasks/);
assert.ok(text(section("Household coverage")).includes("40.0%"));
assert.ok(text(section("Household coverage")).includes("80.0%"));
const siteRows = nodes(section("Site progress comparison")).filter(node => node.type === "tr");
assert.equal(siteRows.length, 4, "New and zero-activity sites remain visible");
const formRows = nodes(section("Questionnaire workload")).filter(node => node.type === "tr");
assert.equal(formRows.length, 14, "Twelve standard forms plus unknown form code and heading");
assert.ok(formRows.some(node => text(node).startsWith("BHQ33051510460.0%")), "Accepted forms and task counts stay distinct");
assert.ok(formRows.some(node => text(node).startsWith("NEW_FORM1")));
assert.ok(nodes(tree).some(node => node.type === "a" && node.props.to === "/staff-dashboard"));
assert.ok(!nodes(tree).some(node => node.type === "input" && node.props.type === "date"));
const filter = nodes(tree).find(node => node.props?.["aria-label"] === "Study site");
filter.props.onChange({ target: { value: "2" } }); render();
assert.match(text(tree), /Accepted forms received1/);
assert.match(text(tree), /Tasks completed—/);
assert.match(text(progressCard("BWQ")), /Accepted forms\s0Completed tasks0Draft0Left now0/);
assert.match(text(progressCard("NEW_FORM")), /Upcoming only/);
assert.equal(nodes(section("Site progress comparison")).filter(node => node.type === "tr").length, 2);
filter.props.onChange({ target: { value: "" } }); render();
button("Refresh").props.onClick(); render();
assert.match(text(tree), /Loading study progress/);
assert.equal(nodes(tree).filter(node => node.type === "section").length, 0, "Stale totals hidden while refreshing");
requests[1].reject(new Error("Connection interrupted")); await flush();
assert.ok(nodes(tree).some(node => node.props?.role === "alert"));
assert.match(text(tree), /Connection interrupted/);
button("Try again").props.onClick(); render();
requests[2].resolve({ ...result, sites: [] }); await flush();
assert.match(text(tree), /No study sites found/);
const requestCount = requests.length;
slots.forEach(slot => slot?.cleanup?.()); slots = []; effects = [];
user = { user_id: "site-manager", role: "site_data_manager", site_id: 2 }; dirty = true; render();
assert.equal(requests.length, requestCount + 1);
assert.equal(nodes(tree).filter(node => node.type === "section").length, 0);
const managerSite = { ...result.sites[1], progress: { ...emptyProgress(), households: { total: 10000, assigned: 0, completed: 1, draft: 0, pending: 9999, closed: 0 } } };
requests[requestCount].resolve({ ...result, sites: [managerSite] }); await flush();
assert.ok(text(tree).includes("Ballabhgarh"));
assert.ok(!text(tree).includes("Bareilly"));
assert.ok(!nodes(tree).some(node => node.props?.["aria-label"] === "Study site"));
assert.ok(text(tree).includes("<0.1%"), "Small positive progress must not appear as zero");
button("Refresh").props.onClick(); render();
requests[requestCount + 1].resolve({ ...result, sites: [{ ...managerSite, progress: { ...managerSite.progress, households: { ...managerSite.progress.households, completed: 9999, pending: 1 } } }] }); await flush();
assert.ok(text(tree).includes(">99.9%"), "Incomplete work must not round to 100% complete");
user = { user_id: "field-worker", role: "field_worker" }; dirty = true; render();
assert.equal(tree.type, "Navigate");
assert.equal(requests.length, requestCount + 2);
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
assert.match(appSource, /role === "central_admin" \|\| user\?\.role === "site_data_manager" \? <SiteFormTotalsPage \/> : <DashboardPage \/>/);
assert.match(appSource, /path="\/staff-dashboard" element=\{<DashboardPage \/>\}/);
const pageSource = readFileSync(new URL("../pages/SiteFormTotalsPage.tsx", import.meta.url), "utf8");
assert.ok(pageSource.includes('key={`${user.user_id}:${user.role}:${user.site_id}`}'));
delete globalThis.siteTotalsHarness;
console.log("Operational progress passed: household/task denominators, percentages, no-data sites, form totals, site filter, own-site access, refresh/errors and preserved staff route.");
