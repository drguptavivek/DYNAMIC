/** Synthetic host benchmark: real SQLite query plans, never the device/service database. */
import assert from "node:assert/strict";
import { normalizeHdssHouseNumber } from "../../../shared/hdssHouseNumber.cjs";
import fs from "node:fs";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { getBlbRegistryVillageSearchScope } from "../modules/households/blbRegistryScope.js";

const source = fs.readFileSync(new URL("../modules/households/blbRegistryRepository.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n").replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
const schema = fs.readFileSync(new URL("../modules/households/householdRepository.js", import.meta.url), "utf8");
const sqlite = new DatabaseSync(":memory:");
const queries = [];
const db = {
  execAsync: async (sql) => sqlite.exec(sql),
  runAsync: async (sql, params = []) => sqlite.prepare(sql).run(...params),
  getFirstAsync: async (sql, params = []) => sqlite.prepare(sql).get(...params),
  getAllAsync: async (sql, params = []) => {
    const rows = sqlite.prepare(sql).all(...params);
    queries.push({ sql, params, rows: rows.length });
    return rows;
  },
};
const initStart = schema.indexOf("async function initializeSqlite(db)");
const initEnd = schema.indexOf("async function ensureSqliteInitialized", initStart);
const init = { STUDY_SITES: [], STUDY_VILLAGES: [] };
vm.runInNewContext(`${schema.slice(initStart, initEnd)}\nthis.initialize = initializeSqlite;`, init);
await init.initialize(db);
const context = {
  normalizeHdssHouseNumber,
  Platform: { OS: "android" }, getOfflineDatabase: () => db,
  getRegistrySessionGeneration: () => 0, withRegistryCacheLock: async (work) => work(),
  getBlbRegistryVillageSearchScope,
};
vm.runInNewContext(`${source}\nthis.api = { listBlbRegistryHouseholds, listBlbRegistryHouseholdMembers, searchBlbRegistryPeople };`, context);
const { api } = context;
const villages = ["10", "11", "12", "13", "14", "15", "20", "21", "22", "30", "31", "32", "33", "34", "39", "40", "41", "42", "43", "50", "51", "52", "60", "61", "62", "63", "64", "70", "71"];
const allowed = ["02", ...villages];
const count = 210000;
sqlite.exec("BEGIN");
const insert = sqlite.prepare("INSERT INTO blb_registry_individuals (uid,village_code,hh_list_no,family_no,ind_no,name) VALUES (?,?,?,?,?,?)");
for (let i = 0; i < count; i += 1) {
  const household = Math.floor(i / 5);
  insert.run(`uid-${String(i).padStart(7, "0")}`, villages[household % villages.length],
    String(Math.floor(household / villages.length)).padStart(5, "0"), "01", String(i % 5).padStart(2, "0"),
    i === count - 1 ? "Zed last marker" : i === count - 2 ? "Rajat" : i === count - 3 ? "Ankit" : `Person ${i}`);
}
sqlite.exec("COMMIT");

// The old implementation aggregated every matching household's name array before LIMIT.
const oldHouseholdSql = `SELECT trim(village_code) AS village_code, MIN(village_name) AS village_name,
 trim(hh_list_no) AS hh_list_no, trim(family_no) AS family_no, COUNT(*) AS member_count,
 json_group_array(name) AS member_names FROM blb_registry_individuals
 WHERE trim(village_code) IN (${villages.map(() => "?").join(",")})
 AND trim(COALESCE(hh_list_no,'')) <> '' AND trim(COALESCE(family_no,'')) <> ''
 GROUP BY trim(village_code),trim(hh_list_no),trim(family_no)
 ORDER BY village_code COLLATE BINARY,hh_list_no COLLATE BINARY,family_no COLLATE BINARY LIMIT 51`;
const oldPickerSql = `SELECT * FROM blb_registry_individuals
 WHERE trim(village_code) = ? AND trim(hh_list_no) = ?
 ORDER BY family_no COLLATE BINARY,ind_no COLLATE BINARY,uid COLLATE BINARY LIMIT 10`;
const plan = (sql, params) => sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => row.detail);
const measure = async (work) => {
  const times = [];
  for (let i = 0; i < 5; i += 1) { const start = performance.now(); await work(); times.push(performance.now() - start); }
  return Math.round(times.sort((a, b) => a - b)[2] * 100) / 100;
};
sqlite.exec(`DROP INDEX idx_blb_registry_household_browse; DROP INDEX idx_blb_registry_people_browse;
 DELETE FROM local_schema_migrations WHERE name='blb_registry.browse_indexes.v1'`);
const oldPlan = plan(oldHouseholdSql, villages);
const baselineHouseholds = await measure(() => sqlite.prepare(oldHouseholdSql).all(...villages));
const pickerParams = ["10", "00000"];
const baselinePicker = await measure(() => sqlite.prepare(oldPickerSql).all(...pickerParams));
await init.initialize(db);
queries.length = 0;
const afterHouseholds = await measure(() => api.listBlbRegistryHouseholds({}, allowed));
const householdQuery = queries.at(-1);
assert.equal(householdQuery.rows, 51, "only one page plus lookahead crosses into JavaScript");
const householdPlan = plan(householdQuery.sql, householdQuery.params);
const pageStep = householdPlan.findIndex((detail) => /CO-ROUTINE page|MATERIALIZE page/.test(detail));
const joinStep = householdPlan.findIndex((detail) => /SCAN page/.test(detail));
assert.ok(pageStep >= 0 && joinStep > pageStep);
assert.ok(householdPlan.slice(pageStep, joinStep).some((detail) => /idx_blb_registry_household_browse/.test(detail)));
assert.ok(!householdPlan.slice(pageStep, joinStep).some((detail) => /TEMP B-TREE/.test(detail)), "initial key paging uses index order, without a full grouped sort");
const first = await api.listBlbRegistryHouseholds({}, allowed);
assert.equal(first.households.length, 50);
assert.equal(first.households[0].member_count, 5);
assert.equal(first.households[0].member_names.length, 5);
const second = await api.listBlbRegistryHouseholds({ offset: 50 }, allowed);
const key = (row) => `${row.village_code}/${row.hh_list_no}/${row.family_no}`;
assert.equal(new Set([...first.households, ...second.households].map(key)).size, 100);
const searchStart = performance.now();
const found = await api.listBlbRegistryHouseholds({ search: "  RAJAT , aNkIt , zed last marker " }, allowed);
const searchMs = Math.round(performance.now() - searchStart);
assert.equal(found.households.length, 1, "comma terms match different members beyond the first page");
assert.equal(found.households[0].member_count, 5);
assert.equal(found.households[0].member_names.length, 5);
assert.equal((await api.listBlbRegistryHouseholdMembers({ villageCode: found.households[0].village_code,
  houseNo: found.households[0].hh_list_no, familyNo: "01" }, allowed)).length, 5);
const afterPicker = await measure(() => api.searchBlbRegistryPeople({ villageCode: "10", houseNo: "00000", limit: 10 }, allowed));
const pickerQuery = queries.at(-1);
const pickerPlan = plan(pickerQuery.sql, pickerQuery.params);
assert.ok(pickerPlan.some((detail) => /idx_blb_registry_people_browse/.test(detail)));
assert.equal(pickerQuery.rows, 5, "only exact household members cross into JavaScript");
const oldPickerRows = sqlite.prepare(oldPickerSql).all(...pickerParams);
const newPickerRows = await api.searchBlbRegistryPeople({ villageCode: "10", houseNo: "00000", limit: 10 }, allowed);
assert.deepEqual(Array.from(newPickerRows, (row) => row.uid), oldPickerRows.map((row) => row.uid), "exact household lookup retains established family/individual/UID ordering");
const lastPerson = await api.searchBlbRegistryPeople({ villageCode: found.households[0].village_code, houseNo: found.households[0].hh_list_no, search: "  ZED LAST MARKER ", limit: 10 }, allowed);
assert.equal(lastPerson.length, 1);
assert.equal(lastPerson[0].uid, "uid-0209999");
const nameOnlyStart = performance.now();
const nameOnly = await api.searchBlbRegistryPeople({ villageCode: found.households[0].village_code,
  search: "  ZED LAST MARKER ", limit: 10 }, allowed);
const nameOnlyMs = Math.round(performance.now() - nameOnlyStart);
assert.deepEqual(Array.from(nameOnly, (row) => row.uid), ["uid-0209999"], "name-only lookup searches the full village beyond the first page");
const commaStart = performance.now();
const commaPeople = await api.searchBlbRegistryPeople({ villageCode: found.households[0].village_code,
  search: "  RAJAT, ankit ", limit: 2 }, allowed);
const commaPeopleMs = Math.round(performance.now() - commaStart);
assert.equal(commaPeople.length, 2);
assert.equal(queries.at(-1).rows, 2, "only the requested household-member page crosses into JavaScript");
const commaRest = await api.searchBlbRegistryPeople({ villageCode: found.households[0].village_code,
  search: "rajat, ankit", offset: 2, limit: 10 }, allowed);
assert.equal(commaRest.length, 3, "all members are returned, including those matching neither search term");
assert.equal(new Set([...commaPeople, ...commaRest].map((row) => row.uid)).size, 5);
assert.ok([...commaPeople, ...commaRest].every((row) => row.hh_list_no === found.households[0].hh_list_no));
assert.equal((await api.searchBlbRegistryPeople({ villageCode: "02", houseNo: "00000" }, allowed)).length, 0, "study locality is not expanded during BHQ lookup");
assert.equal((await api.listBlbRegistryHouseholds({}, [])).households.length, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM blb_registry_individuals").get().n, count);
console.log(JSON.stringify({ syntheticPeople: count, medianMs: {
  householdsBefore: baselineHouseholds, householdsAfter: afterHouseholds,
  pickerBefore: baselinePicker, pickerAfter: afterPicker, substringSearch: searchMs, nameOnly: nameOnlyMs, commaPeople: commaPeopleMs,
}, householdBeforePlan: oldPlan, householdAfterPlan: householdPlan,
  pickerIndexedSearches: pickerPlan.filter((detail) => /idx_blb_registry_people_browse/.test(detail)).length,
  note: "Host SQLite timings; not phone measurements. Substring search still scans native SQLite rows." }, null, 2));
sqlite.close();
