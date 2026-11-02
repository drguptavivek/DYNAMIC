import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

let slots = [], cursor = 0, effects = [], dirty = true, tree;
const requests = [];
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
globalThis.syncLogsHarness = {
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
  api: { getPage(path) { return new Promise((resolve, reject) => requests.push({ path, resolve, reject })); } },
};
const output = await build({
  entryPoints: [fileURLToPath(new URL("../pages/SyncLogsPage.tsx", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  plugins: [{ name: "sync-logs-dependencies", setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime)$|\/lib\/api$|\.module\.css$/ }, args => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents:
      args.path === "react" ? "export const useState=(...x)=>globalThis.syncLogsHarness.useState(...x),useEffect=(...x)=>globalThis.syncLogsHarness.useEffect(...x);" :
      args.path === "react/jsx-runtime" ? "export const Fragment='Fragment',jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;" :
      args.path.endsWith("/api") ? "export const api=globalThis.syncLogsHarness.api;" :
      "export default new Proxy({}, {get:(_,key)=>key});",
    }));
  } }],
});
const compiled = { exports: {} };
new Function("module", "exports", output.outputFiles[0].text)(compiled, compiled.exports);
function render() {
  for (let i = 0; i < 10 && dirty; i++) {
    dirty = false; cursor = 0; tree = compiled.exports.default();
    effects.splice(0).forEach(effect => effect());
  }
}
const nodes = node => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = node => typeof node === "object" && node ? [node.props?.children].flat(Infinity).map(text).join("") : String(node ?? "");
const control = label => nodes(tree).find(node => node.props?.["aria-label"] === label);
const button = label => nodes(tree).find(node => node.type === "button" && text(node) === label);
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
const last = () => requests.at(-1);
const params = () => new URL(last().path, "https://test.invalid").searchParams;
const row = { sync_log_id: "a", device_id: "device-ABC", user_id: "opaque-account-id", user_name: "Visible Worker", username: "worker.login", direction: "push", records_sent: 1, records_received: 1, status: "success", started_at: "2026-11-02T18:29:00Z" };
const resolve = async (data = [row], total = 1) => { last().resolve({ data, meta: { total, page: Number(params().get("page")), per_page: 100 } }); await flush(); };
function change(label, value) { control(label).props.onChange({ target: { value } }); render(); }

render();
assert.equal(params().get("per_page"), "100");
assert.equal(params().get("page"), "1");
assert.match(text(tree), /Loading sync logs/);
await resolve(Array.from({ length: 100 }, (_, i) => ({ ...row, sync_log_id: String(i) })), 201);
assert.match(text(tree), /Showing 1–100 of 201/);
assert.equal(button("Previous").props.disabled, true);
button("Next").props.onClick(); render();
assert.equal(params().get("page"), "2");
await resolve([row], 201);
assert.equal(button("Previous").props.disabled, false);
change("Name or username", "  worker.login  ");
assert.equal(params().get("page"), "1", "Changing filters resets pagination");
assert.equal(params().get("user_name"), "worker.login");
await resolve();
assert.ok(text(tree).includes("Visible Worker"), "Server-matched username rows must not be rejected by opaque user ID");
change("Device ID", "  DEVICE-abc  ");
assert.equal(params().get("device_id"), "DEVICE-abc");
assert.equal(params().get("user_name"), "worker.login", "Filters combine in one request");
await resolve();
assert.ok(text(tree).includes("device-ABC"), "Server matches must not be filtered again with case-sensitive device search");
change("Direction", "pull");
assert.equal(params().get("direction"), "pull");
await resolve([{ ...row, direction: "pull" }]);
assert.ok(text(tree).includes("↓ Pull"));
const statuses = nodes(control("Status")).filter(node => node.type === "option").map(node => node.props.value);
for (const status of ["success", "partial_success", "pending", "in_progress", "completed", "failed"]) {
  assert.ok(statuses.includes(status));
  change("Status", status); assert.equal(params().get("status"), status);
  await resolve([{ ...row, status }]);
  assert.ok(text(tree).includes(status));
}
change("From date (IST)", "2026-11-02"); assert.equal(params().get("from"), "2026-11-02");
const stale = last();
change("To date (IST, inclusive)", "2026-11-02"); assert.equal(params().get("to"), "2026-11-02");
await resolve();
assert.ok(text(tree).includes("Visible Worker"), "An end-date match returned by the server remains visible late in the IST day");
stale.resolve({ data: [{ ...row, user_name: "STALE" }], meta: { total: 1 } }); await flush();
assert.ok(!text(tree).includes("STALE"));
change("Name or username", "none"); await resolve([], 0);
assert.match(text(tree), /No sync logs found/);
assert.match(text(tree), /0 results/);
change("From date (IST)", "2026-11-03");
last().reject(new Error("Invalid date range")); await flush();
assert.ok(nodes(tree).some(node => node.props?.role === "alert"));
assert.match(text(tree), /Invalid date range/);
button("Try again").props.onClick(); render();
assert.match(text(tree), /Loading sync logs/);
await resolve();
change("Name or username", "");
assert.equal(params().has("user_name"), false);
await resolve();
for (const slot of slots) slot?.cleanup?.();
delete globalThis.syncLogsHarness;
console.log("Sync log filters passed: username/device server matches, direction, every status, inclusive IST dates, combined filters, pagination, stale responses, loading/error/retry and empty states.");
