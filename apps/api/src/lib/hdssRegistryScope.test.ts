import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { PgDialect } from "drizzle-orm/pg-core";
import villageMapping from "../../../../shared/hdssVillageMapping.json";
import { db, schema } from "../db";
import { JwtPayload } from "../middleware/auth";
import { buildAreaScopeCondition } from "./areaScope";
import { buildHdssRegistryScopeCondition } from "./hdssRegistryScope";

test("HDSS registry scope matches assigned villages without locality wildcard expansion", async (t) => {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE") {
      t.skip("SQLite SQL evaluation requires Node 22+; production scope is also verified with PostgreSQL");
      return;
    }
    throw error;
  }
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE blb_registry_individuals (village_code TEXT)");
  const villages = [...villageMapping.villageCodes, "02", "99"].sort();
  const insert = sqlite.prepare("INSERT INTO blb_registry_individuals VALUES (?)");
  villages.forEach((village) => insert.run(village));
  const originalSelect = db.select;
  let assignments: { site_id: number; locality_code: string; active_from: string | null; active_to: string | null }[] = [];
  (db as any).select = () => ({ from: (table: unknown) => ({ where: async () => {
    if (table === schema.fieldWorkerHouseholdAssignments) return [];
    assert.equal(table, schema.userAreaAssignments);
    return assignments;
  } }) });
  const worker: JwtPayload = { sub: "worker", username: "worker", role: "field_worker", site_id: 2, type: "access" };
  const dialect = new PgDialect();
  const visible = async (user = worker) => {
    const scope = await buildHdssRegistryScopeCondition(user);
    if (!scope) return villages;
    const compiled = dialect.sqlToQuery(scope);
    return sqlite.prepare(`SELECT village_code FROM blb_registry_individuals WHERE ${compiled.sql.replace(/\$\d+/g, "?")} ORDER BY village_code`)
      .all(...compiled.params).map((row: { village_code: string }) => row.village_code);
  };
  const assign = (site: number, locality: string) => {
    assignments = [{ site_id: site, locality_code: locality, active_from: null, active_to: null }];
  };
  try {
    await t.test("locality 02 grants only village 02", async () => {
      assign(2, "02");
      assert.deepEqual(await visible(), ["02"]);
      const householdScope = await buildAreaScopeCondition(worker, schema.households);
      assert.ok(householdScope);
      assert.equal(dialect.sqlToQuery(householdScope).sql, "false");
    });
    await t.test("Bareilly and zero, expired, or future assignments have no access", async () => {
      assign(1, "02");
      assert.deepEqual(await visible({ ...worker, site_id: 1 }), []);
      assignments = [];
      assert.deepEqual(await visible(), []);
      assign(2, "02");
      assignments[0].active_to = "2000-01-01";
      assert.deepEqual(await visible(), []);
      assignments[0].active_to = null;
      assignments[0].active_from = "2999-01-01";
      assert.deepEqual(await visible(), []);
    });
    await t.test("direct village assignments and central admin access are preserved", async () => {
      assign(2, "10");
      assert.deepEqual(await visible(), ["10"]);
      assign(2, "99");
      assert.deepEqual(await visible(), ["99"]);
      assignments = [];
      assert.deepEqual(await visible({ ...worker, role: "central_admin", site_id: null }), villages);
    });
    await t.test("multiple assigned villages form a union for workers and assigned site staff", async () => {
      assignments = ["10", "11"].map((locality_code) => ({
        site_id: 2, locality_code, active_from: null, active_to: null,
      }));
      assert.deepEqual(await visible(), ["10", "11"]);
      assert.deepEqual(await visible({ ...worker, role: "site_data_manager" }), ["10", "11"]);
      assignments.push({ site_id: 2, locality_code: "02", active_from: null, active_to: null });
      assert.deepEqual(await visible(), ["02", "10", "11"]);
    });
  } finally {
    db.select = originalSelect;
    sqlite.close();
  }
});
