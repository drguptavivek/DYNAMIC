/** Verifies app timing spans are recorded, persisted, summarised and exportable. */
import assert from "node:assert/strict";
import { createFakeSqliteDb } from "./helpers/createFakeSqliteDb.mjs";

const {
  PERF_LOG_MAX_ROWS,
  __resetPerfLogForTests,
  buildTimingExport,
  clearTimings,
  configurePerfLog,
  flushPerfLog,
  listTimings,
  recordTiming,
  startTiming,
  summarizeTimings,
  timeAsync,
} = await import("../lib/perfLog.js");

// Fake db that stores inserted rows so listTimings can read them back.
const stored = [];
const db = createFakeSqliteDb({
  getAllSyncResults: (sql) => (/FROM app_timings ORDER BY id DESC/.test(sql) ? [...stored].reverse() : []),
});
const originalRun = db.runSync.bind(db);
db.runSync = (sql, params = []) => {
  if (/^INSERT INTO app_timings/.test(sql)) {
    stored.push({
      id: stored.length + 1,
      name: params[0],
      duration_ms: params[1],
      meta: params[2],
      at: params[3],
      app_version: params[4],
      device_id: params[5],
    });
  }
  if (/^DELETE FROM app_timings$/.test(sql)) stored.length = 0;
  return originalRun(sql, params);
};

let clock = 1000;
let fakeNow = Date.parse("2026-09-03T10:00:00Z");
configurePerfLog({
  getDb: () => db,
  appVersion: "0.2.0",
  deviceId: "device-1",
  now: () => fakeNow,
  monotonic: () => clock,
});
__resetPerfLogForTests();

// startTiming / end
const end = startTiming("form.open", { form: "WQ" });
clock += 250.4;
assert.equal(Math.round(end({ questions: 181 })), 250);
assert.equal(end(), null, "ending twice is a no-op");

// timeAsync records ok/error metadata
await timeAsync("draft.save", async () => "saved", { form: "WQ" });
await assert.rejects(
  timeAsync("sync.all", async () => {
    throw new TypeError("boom");
  })
);

recordTiming({ name: "worklist.load", durationMs: 40, meta: { tasks: 12 } });
recordTiming({ name: "worklist.load", durationMs: 60 });
recordTiming({ name: "", durationMs: 5 }, "unnamed spans are dropped");

assert.equal(await flushPerfLog(), 5);
const inserts = db.calls.filter((call) => /^INSERT INTO app_timings/.test(call.sql));
assert.equal(inserts.length, 5);
assert.deepEqual(inserts[0].params.slice(0, 2), ["form.open", 250.4]);
assert.equal(JSON.parse(inserts[0].params[2]).questions, 181);
assert.equal(inserts[0].params[3], "2026-09-03T10:00:00.000Z");
assert.equal(inserts[0].params[4], "0.2.0");
assert.equal(inserts[0].params[5], "device-1");
assert.equal(JSON.parse(inserts[2].params[2]).ok, false);
assert.equal(JSON.parse(inserts[2].params[2]).error, "TypeError");
assert.ok(db.calls.some((call) => call.sql === "BEGIN"), "batched in a transaction");
assert.ok(db.calls.some((call) => call.sql === "COMMIT"));
const cap = db.calls.find((call) => /DELETE FROM app_timings WHERE id IN/.test(call.sql));
assert.deepEqual(cap.params, [PERF_LOG_MAX_ROWS], "table is capped to the newest rows");

// listTimings returns oldest first
const rows = await listTimings();
assert.deepEqual(
  rows.map((row) => row.name),
  ["form.open", "draft.save", "sync.all", "worklist.load", "worklist.load"]
);

// summarizeTimings
const summary = summarizeTimings([
  { name: "a", duration_ms: 10, at: "2026-09-03T10:00:00Z" },
  { name: "a", duration_ms: 20, at: "2026-09-03T11:00:00Z" },
  { name: "a", duration_ms: 30, at: "2026-09-03T09:00:00Z" },
  { name: "a", duration_ms: 1000, at: "" },
  { name: "b", duration_ms: 5, at: "" },
  { name: "", duration_ms: 5, at: "" },
]);
assert.deepEqual(summary.map((row) => row.name), ["a", "b"]);
assert.deepEqual(
  { ...summary[0] },
  { name: "a", count: 4, totalMs: 1060, avgMs: 265, p50Ms: 20, p95Ms: 1000, maxMs: 1000, lastAt: "2026-09-03T11:00:00Z" }
);

// buildTimingExport
const exported = JSON.parse(buildTimingExport(rows, { exportedAt: "2026-09-03T12:00:00Z" }));
assert.equal(exported.kind, "dynamic-app-timings");
assert.equal(exported.app_version, "0.2.0");
assert.equal(exported.device_id, "device-1");
assert.equal(exported.row_count, 5);
assert.equal(exported.timings[0].name, "form.open");
assert.deepEqual(exported.timings[0].meta, { form: "WQ", questions: 181 });
assert.ok(exported.summary.some((row) => row.name === "worklist.load" && row.count === 2));

// clearTimings
await clearTimings();
assert.equal((await listTimings()).length, 0);

console.log("Perf log validation passed");
