/** Exercise atomic native batch writes against real SQLite, without a device or service DB. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const source = fs.readFileSync(new URL("../modules/households/blbRegistryRepository.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/^export /gm, "");
const columns = ["uid", "village_code", "village_name", "phc_code", "phc_name", "hh_list_no",
  "family_no", "ind_no", "name", "age_years", "sex", "status", "domicile", "curr_status",
  "death_date", "migrated_out_date", "migration_reason", "source_age_as_of"];
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE blb_registry_individuals (${columns.map((name) => `${name} ${name === "age_years" ? "INTEGER" : "TEXT"}${name === "uid" ? " PRIMARY KEY NOT NULL" : ""}`).join(",")});
  CREATE TABLE blb_registry_households (hh_list_no TEXT, family_no TEXT, head_name TEXT, address TEXT, updated_at TEXT, PRIMARY KEY (hh_list_no, family_no));`);
let generation = 0;
let scope = "02";
let onInsert = null;
let inserts = 0;
let maxParameters = 0;
const context = {
  Platform: { OS: "android" },
  getRegistrySessionGeneration: () => generation,
  withRegistryCacheLock: async (work) => work(),
  getOfflineDatabase: () => ({
    async execAsync(sql) { sqlite.exec(sql); },
    async runAsync(sql, values = []) {
      maxParameters = Math.max(maxParameters, values.length);
      const result = sqlite.prepare(sql).run(...values);
      if (sql.startsWith("INSERT")) { inserts += 1; onInsert?.(inserts); }
      return result;
    },
  }),
};
vm.runInNewContext(`${source}\nthis.replace = replaceBlbRegistry;`, context);
const replace = (rows, options = {}) => context.replace({ households: [], individuals: rows, ...options });
const allPeople = () => sqlite.prepare("SELECT * FROM blb_registry_individuals ORDER BY uid").all().map((row) => ({ ...row }));
const allHouseholds = () => sqlite.prepare("SELECT * FROM blb_registry_households ORDER BY hh_list_no").all().map((row) => ({ ...row }));
const special = {
  uid: "000'UID", village_code: "010", village_name: "O'Brien, village", phc_code: "001",
  phc_name: "Centre ?", hh_list_no: "0001", family_no: "002", ind_no: "003", name: "A 'quoted' नाम",
  age_years: 0, sex: "2", domicile: "RR", curr_status: "L", death_date: null,
  migrated_out_date: "2025-01-01", migration_reason: "a,b\\c", source_age_as_of: "2026-10-14",
};
const rows = [special, { uid: "blank" }, ...Array.from({ length: 2001 }, (_, i) => ({ uid: `person-${i}`, age_years: "28", domicile: "Dead" }))];
const households = Array.from({ length: 181 }, (_, i) => ({ hh_list_no: `00${i}`, family_no: "01", head_name: "Name ' ?", address: "address", updated_at: "fixed-time" }));
const progress = [];
await replace(rows, { households, onProgress: (value) => progress.push({ ...value }) });
assert.equal(inserts, Math.ceil(rows.length / 50) + Math.ceil(households.length / 180));
assert.equal(maxParameters, 900);
assert.equal(allPeople().length, rows.length);
assert.deepEqual(allPeople().find((row) => row.uid === special.uid), { ...special, status: "alive" });
assert.deepEqual(allPeople().find((row) => row.uid === "blank"), Object.fromEntries(columns.map((name) => [name,
  name === "uid" ? "blank" : ["hh_list_no", "family_no", "ind_no", "name"].includes(name) ? "" : null])));
assert.equal(allPeople().find((row) => row.uid === "person-0").age_years, 28);
assert.equal(allPeople().find((row) => row.uid === "person-0").status, "dead");
assert.deepEqual(allHouseholds(), [...households].sort((a, b) => a.hh_list_no.localeCompare(b.hh_list_no)));
assert.deepEqual(progress.at(-1), { processed: rows.length + households.length, total: rows.length + households.length });
assert.ok(progress.length < 5, "progress is throttled rather than emitted for every row or batch");
assert.ok(progress.every((value, i) => i === 0 || value.processed > progress[i - 1].processed));

const previousPeople = allPeople();
const previousHouseholds = allHouseholds();
const replacement = Array.from({ length: 151 }, (_, i) => ({ uid: `new-${i}`, name: "New person" }));
for (const failure of ["write", "session", "scope", "commit-session", "commit-scope"]) {
  inserts = 0;
  onInsert = (count) => {
    if (count !== (failure.startsWith("commit") ? 4 : 2)) return;
    if (failure === "write") throw new Error("simulated disk write failure");
    if (failure.endsWith("session")) generation += 1;
    if (failure.endsWith("scope")) scope = "03";
  };
  await assert.rejects(() => replace(replacement, {
    expectedScopeFingerprint: "02", getCurrentScopeFingerprint: () => scope,
  }), /simulated disk write failure|session changed|assignment scope changed/);
  assert.deepEqual(allPeople(), previousPeople, `${failure} preserves the complete old person cache`);
  assert.deepEqual(allHouseholds(), previousHouseholds, `${failure} preserves the complete old household cache`);
  scope = "02";
}
// Validation late in the source must roll back batches already written.
onInsert = null;
inserts = 0;
await assert.rejects(() => replace([...replacement.slice(0, 61), { uid: "  " }, ...replacement.slice(62)]), /missing uid/);
assert.equal(inserts, 1, "the first batch writes before validation reaches the invalid second-batch UID");
assert.deepEqual(allPeople(), previousPeople);
assert.deepEqual(allHouseholds(), previousHouseholds);
let normalized = 0;
onInsert = (count) => {
  if (count === 1) assert.equal(normalized, 50, "only the current batch is normalized before the first bridge write");
};
inserts = 0;
await replace(Array.from({ length: 151 }, (_, i) => ({ get uid() { normalized += 1; return `bounded-${i}`; } })));
assert.equal(normalized, 151, "every source row is normalized exactly once");
onInsert = null;
inserts = 0;
const started = performance.now();
const largeRows = Array.from({ length: 164529 }, (_, i) => ({ uid: `large-${i}`, village_code: "10", name: `Synthetic ${i}` }));
const largeProgress = [];
await replace(largeRows, { onProgress: (value) => largeProgress.push({ ...value }) });
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM blb_registry_individuals").get().count, largeRows.length);
assert.equal(inserts, Math.ceil(largeRows.length / 50));
assert.equal(largeProgress.at(-1).processed, largeRows.length);
assert.equal(largeProgress.length, Math.ceil(largeRows.length / 1000));
assert.equal(sqlite.prepare("SELECT uid FROM blb_registry_individuals WHERE uid = ?").get("large-164528").uid, "large-164528");
const elapsed = Math.round(performance.now() - started);
sqlite.close();
console.log(`HDSS batch writes passed: ${largeRows.length} synthetic people, ${inserts} inserts, ${elapsed} ms (host SQLite; not device timing).`);
