import assert from "node:assert/strict";
import test from "node:test";
import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import { JwtPayload } from "../middleware/auth";
import { appendAreaScopeCondition, buildAreaScopeCondition, canAccessLocation } from "./areaScope";

test("field-worker household scope never expands to locality when assignments are empty", async (t) => {
  const originalSelect = db.select;
  let householdIds: string[] = [];
  let localityRows = [{ site_id: 2, locality_code: "02", active_from: null, active_to: null }];
  const selections: unknown[] = [];
  // Only assignment rows are synthetic; scope predicates are the production Drizzle SQL.
  (db as any).select = () => ({ from: (table: unknown) => ({ where: async () => {
    selections.push(table);
    if (table === schema.fieldWorkerHouseholdAssignments) {
      return householdIds.map((household_id) => ({ household_id }));
    }
    assert.equal(table, schema.userAreaAssignments);
    return localityRows;
  } }) });
  const worker: JwtPayload = { sub: "worker", username: "worker", role: "field_worker", site_id: 2, type: "access" };
  const dialect = new PgDialect();
  const query = (condition: SQL | undefined) => {
    assert.ok(condition);
    return dialect.sqlToQuery(condition);
  };
  const householdTables = [schema.households, schema.householdMembers, schema.eligibleWomen,
    schema.pregnancies, schema.followUpTasks, schema.formResponses, schema.domainEvents];
  try {
    await t.test("zero assignments denies every household-backed read", async () => {
      for (const table of householdTables) {
        assert.equal(query(await buildAreaScopeCondition(worker, table)).sql, "false");
        const conditions: SQL[] = [];
        await appendAreaScopeCondition(worker, table, conditions);
        assert.equal(conditions.length, 1);
        assert.equal(query(conditions[0]).sql, "false");
      }
      assert.ok(!selections.includes(schema.userAreaAssignments), "household checks must not use locality fallback");
    });
    await t.test("two assignments grants exactly those households", async () => {
      householdIds = ["2-02-0001-01", "2-02-0001-02"];
      for (const table of householdTables) {
        const compiled = query(await buildAreaScopeCondition(worker, table));
        assert.match(compiled.sql, /household_id.* in \(\$1, \$2\)/);
        assert.deepEqual(compiled.params, householdIds);
      }
      for (const householdId of householdIds) {
        assert.equal(await canAccessLocation(worker, 2, "02", householdId), true);
      }
      assert.equal(await canAccessLocation(worker, 2, "02", "2-02-0001-03"), false);
    });
    await t.test("locality-only masters and baseline area checks retain their existing scope", async () => {
      householdIds = [];
      const areaTable = { site_id: schema.households.site_id, locality_code: schema.households.locality_code };
      assert.deepEqual(query(await buildAreaScopeCondition(worker, areaTable)).params, [2, "02"]);
      assert.equal(await canAccessLocation(worker, 2, "02"), true);
      assert.equal(await canAccessLocation(worker, 2, "02", "2-02-0001-01"), true,
        "existing area-scoped baseline submission behavior must remain unchanged");
      assert.equal(await canAccessLocation(worker, 1, "01"), false);
      localityRows = [];
      assert.equal(query(await buildAreaScopeCondition(worker, areaTable)).sql, "false");
      assert.equal(await canAccessLocation(worker, 2, "02"), false);
    });
    await t.test("central and site manager scopes are unchanged", async () => {
      for (const role of ["central_admin", "central_data_manager", "us_collaborator"] as const) {
        const admin = { ...worker, role };
        assert.equal(await buildAreaScopeCondition(admin, schema.households), undefined);
        assert.equal(await canAccessLocation(admin, 1, "01", "1-01-0001-01"), true);
      }
      const siteManager = { ...worker, role: "site_data_manager" as const };
      assert.deepEqual(query(await buildAreaScopeCondition(siteManager, schema.households)).params, [2]);
      assert.equal(await canAccessLocation(siteManager, 2, "02", "2-02-0001-01"), true);
      assert.equal(await canAccessLocation(siteManager, 1, "01", "1-01-0001-01"), false);
    });
  } finally {
    db.select = originalSelect;
  }
});
