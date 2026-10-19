/** Stream real SQLite pages while readers retain the last complete registry. */
import assert from "node:assert/strict";
import { normalizeHdssHouseNumber } from "../../../shared/hdssHouseNumber.cjs";
import fs from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const source = fs.readFileSync(new URL("../modules/households/blbRegistryRepository.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n").replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
const columns = ["uid", "village_code", "village_name", "phc_code", "phc_name", "hh_list_no",
  "family_no", "ind_no", "name", "age_years", "sex", "status", "domicile", "curr_status",
  "death_date", "migrated_out_date", "migration_reason", "source_age_as_of"];
const diskDirectory = process.argv.includes("--disk") ? fs.mkdtempSync(path.join(os.tmpdir(), "dynamic-hdss-stream-test-")) : null;
const databasePath = diskDirectory ? path.join(diskDirectory, "test.sqlite") : ":memory:";
const sqlite = new DatabaseSync(databasePath);
sqlite.exec(`CREATE TABLE blb_registry_individuals (${columns.map((name) => `${name} ${name === "age_years" ? "INTEGER" : "TEXT"}${name === "uid" ? " PRIMARY KEY NOT NULL" : ""}`).join(",")});
  CREATE TABLE blb_registry_households (hh_list_no TEXT, family_no TEXT, head_name TEXT, address TEXT, updated_at TEXT, PRIMARY KEY (hh_list_no, family_no));`);
let generation = 0;
let scope = "02";
let fail = null;
let onInsert = null;
let transaction = false;
let inserts = 0;
let maxParameters = 0;
let stageWrites = 0;
const platform = { OS: "android" };
const storage = new Map();
let quotaError = false;
const context = {
  normalizeHdssHouseNumber,
  Platform: platform,
  window: { localStorage: {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => { if (quotaError) throw new Error("quota exceeded"); storage.set(key, value); },
  } },
  getRegistrySessionGeneration: () => generation,
  withRegistryCacheLock: async (work) => work(),
  getOfflineDatabase: () => ({
    async execAsync(sql) {
      if (sql.includes("CREATE TABLE")) stageWrites += 1;
      if (sql.includes("INSERT INTO blb_registry_individuals SELECT") && fail === "commit") {
        sqlite.exec("BEGIN TRANSACTION; DELETE FROM blb_registry_individuals;");
        transaction = true;
        throw new Error("simulated commit failure");
      }
      sqlite.exec(sql);
      if (sql.startsWith("BEGIN")) transaction = true;
      if (sql.includes("COMMIT") || sql.includes("ROLLBACK")) transaction = false;
    },
    async runAsync(sql, values = []) {
      assert.equal(transaction, false, "page writes never open a transaction on the shared connection");
      maxParameters = Math.max(maxParameters, values.length);
      if (fail === "disk") throw new Error("simulated disk failure");
      const result = sqlite.prepare(sql).run(...values);
      if (sql.startsWith("INSERT")) { inserts += 1; onInsert?.(); }
      return result;
    },
  }),
};
vm.runInNewContext(`${source}\nthis.stream = withBlbRegistryDownload;`, context);
const stream = (download, extra = {}) => context.stream({ download,
  expectedScopeFingerprint: "02", getCurrentScopeFingerprint: () => scope, ...extra });
const people = () => sqlite.prepare("SELECT uid FROM blb_registry_individuals ORDER BY uid").all().map((row) => row.uid);
const stageCount = () => sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name LIKE 'blb_registry_%_download'").get().count;
const old = () => {
  sqlite.exec("DELETE FROM blb_registry_individuals; INSERT INTO blb_registry_individuals(uid) VALUES ('old');");
};
old();
const special = { uid: "a", name: "First ???", domicile: "RR", hh_list_no: "0001", family_no: "01",
  village_code: "010", village_name: "O'Brien", phc_code: "001", phc_name: "Centre ?",
  ind_no: "003", age_years: 0, sex: "2", death_date: null, migrated_out_date: "2025-01-01",
  curr_status: "L", migration_reason: "a,b\\c", source_age_as_of: "2026-10-14" };
let invalidated = 0;
const result = await stream(async (save) => {
  await save({ households: [{ hh_list_no: "0001", family_no: "01" }], individuals: [special] });
  assert.deepEqual(people(), ["old"]);
  assert.equal(transaction, false, "no SQLite transaction spans the next network request");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM blb_registry_individuals_download").get().count, 1);
  await save({ individuals: [{ uid: "b", age_years: "24", name: "O'Brien" }] });
  assert.deepEqual(people(), ["old"]);
  return { registryVersion: "v", pages: 2 };
}, { beforeCommit: () => { invalidated += 1; assert.deepEqual(people(), ["old"]); } });
assert.deepEqual({ ...result }, { registryVersion: "v", pages: 2, households: 1, individuals: 2 });
assert.deepEqual(people(), ["a", "b"]);
assert.deepEqual({ ...sqlite.prepare("SELECT * FROM blb_registry_individuals WHERE uid='a'").get() }, { ...special, status: "alive" });
assert.equal(sqlite.prepare("SELECT age_years FROM blb_registry_individuals WHERE uid='b'").get().age_years, 24);
assert.deepEqual({ ...sqlite.prepare("SELECT name,hh_list_no,family_no,village_code,death_date FROM blb_registry_individuals WHERE uid='a'").get() },
  { name: "First ???", hh_list_no: "0001", family_no: "01", village_code: "010", death_date: null });
assert.equal(sqlite.prepare("SELECT name FROM blb_registry_individuals WHERE uid='b'").get().name, "O'Brien");
assert.equal(stageCount(), 0);
assert.equal(invalidated, 1);

for (const failure of ["network", "disk", "invalid-uid", "duplicate-uid", "commit", "session", "scope", "before-commit"]) {
  old();
  scope = "02";
  fail = null;
  await assert.rejects(() => stream(async (save) => {
    await save({ individuals: [{ uid: "first" }] });
    assert.equal(transaction, false);
    if (failure === "network") throw new Error("network failed");
    if (["disk", "commit"].includes(failure)) fail = failure;
    if (failure === "session") onInsert = () => { generation += 1; };
    if (failure === "scope") onInsert = () => { scope = "03"; };
    await save({ individuals: [{ uid: failure === "invalid-uid" ? "  " : failure === "duplicate-uid" ? "first" : "second" }] });
    return {};
  }, { beforeCommit: () => { if (failure === "before-commit") throw new Error("marker failed"); } }),
  /failed|missing uid|UNIQUE constraint|session changed|assignment scope changed|failure/);
  assert.deepEqual(people(), ["old"], `${failure} retains the complete old cache`);
  assert.equal(stageCount(), 0, `${failure} removes staged private data`);
  assert.equal(transaction, false);
  onInsert = null;
  fail = null;
  scope = "02";
}

const stagesBefore = stageWrites;
const unchanged = await stream(async () => ({ notModified: true }));
assert.equal(unchanged.notModified, true);
assert.equal(stageWrites, stagesBefore, "unchanged cache creates no staging tables");
// Simulate tables left by a killed process; a new download discards them.
sqlite.exec("CREATE TABLE blb_registry_individuals_download AS SELECT * FROM blb_registry_individuals;");
await stream(async (save) => { await save({ individuals: [{ uid: "nan", age_years: "invalid" }] }); return {}; });
assert.equal(sqlite.prepare("SELECT age_years FROM blb_registry_individuals WHERE uid='nan'").get().age_years, null);
await stream(async (save) => { await save({ households: [], individuals: [] }); return {}; });
assert.deepEqual(people(), []);
assert.equal(stageCount(), 0);

const total = 101005;
inserts = 0;
let largestPage = 0;
let saved = 0;
const start = performance.now();
const large = await stream(async (save) => {
  for (let offset = 0; offset < total; offset += 1000) {
    assert.equal(transaction, false);
    const page = Array.from({ length: Math.min(1000, total - offset) }, (_, i) => ({ uid: `large-${offset + i}`, village_code: "10" }));
    largestPage = Math.max(largestPage, page.length);
    await save({ individuals: page });
    saved += page.length;
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM blb_registry_individuals_download").get().count, saved);
  }
  return { pages: Math.ceil(total / 1000) };
});
assert.equal(large.individuals, total);
assert.equal(people().length, total);
assert.equal(largestPage, 1000);
assert.equal(inserts, Math.ceil(total / 1000));
assert.equal(maxParameters, 1);
assert.equal(stageCount(), 0);
const elapsed = Math.round(performance.now() - start);

platform.OS = "web";
const key = "dynamic_blb_registry_v1";
const previous = JSON.stringify({ households: [], individuals: [{ uid: "web-old" }] });
storage.set(key, previous);
quotaError = true;
await assert.rejects(() => stream(async (save) => { await save({ individuals: [{ uid: "web-new" }] }); return {}; }), /quota exceeded/);
assert.equal(storage.get(key), previous);
quotaError = false;
await stream(async (save) => { await save({ individuals: [{ uid: "web-new" }] }); return {}; });
assert.equal(JSON.parse(storage.get(key)).individuals[0].uid, "web-new");
sqlite.close();
if (diskDirectory) { fs.unlinkSync(databasePath); fs.rmdirSync(diskDirectory); }
console.log(`HDSS streaming passed: ${total} rows in ${large.pages} pages, ${inserts} bounded inserts, ${elapsed} ms host ${diskDirectory ? "disk" : "memory"} SQLite (not phone timing).`);
