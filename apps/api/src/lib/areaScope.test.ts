import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import { JwtPayload } from "../middleware/auth";
import { appendAreaScopeCondition, buildAreaScopeCondition, canAccessLocation, getCurrentFieldWorkerHouseholdAssignments } from "./areaScope";

test("field-worker scope follows the current account site without erasing old allocations", async (t) => {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE") {
      t.skip("Isolated SQLite SELECT verification requires Node 22+");
      return;
    }
    throw error;
  }
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE users (user_id TEXT, site_id INTEGER, role TEXT, active INTEGER);
    CREATE TABLE households (household_id TEXT, site_id INTEGER, locality_code TEXT);
    CREATE TABLE field_worker_household_assignments (user_id TEXT, household_id TEXT);
    CREATE TABLE user_area_assignments (assignment_id TEXT, user_id TEXT, site_id INTEGER,
      locality_code TEXT, role TEXT, active_from TEXT, active_to TEXT, created_at TEXT);
    INSERT INTO users VALUES ('worker', 2, 'field_worker', 1);
    INSERT INTO households VALUES ('1-01-0004-04', 1, '01'), ('2-02-0001-01', 2, '02'),
      ('2-02-0001-02', 2, '02'), ('2-39-0002-01', 2, '39'), ('2-39-0002-02', 2, '39');`);
  const originalSelect = db.select;
  const selections: string[] = [];
  // Run production Drizzle SELECT statements against isolated SQLite, never the configured database.
  (db as any).select = (...args: unknown[]) => {
    const builder = (originalSelect as any).apply(db, args);
    const from = builder.from.bind(builder);
    builder.from = (table: unknown) => {
      const query = from(table);
      query.execute = async () => {
        const compiled = query.toSQL();
        selections.push(compiled.sql);
        return sqlite.prepare(compiled.sql.replace(/\$\d+/g, "?"))
          .all(...compiled.params.map((value: unknown) => typeof value === "boolean" ? Number(value) : value));
      };
      return query;
    };
    return builder;
  };
  const assign = (ids: string[]) => {
    sqlite.exec("DELETE FROM field_worker_household_assignments WHERE user_id = 'worker'");
    ids.forEach((id) => sqlite.prepare("INSERT INTO field_worker_household_assignments VALUES ('worker', ?)").run(id));
  };
  const areas = (rows: [number, string, string | null, string | null][]) => {
    sqlite.exec("DELETE FROM user_area_assignments");
    rows.forEach(([site, code, from, to], index) => sqlite.prepare("INSERT INTO user_area_assignments VALUES (?, 'worker', ?, ?, 'field_worker', ?, ?, NULL)")
      .run(String(index), site, code, from, to));
  };
  const worker: JwtPayload = { sub: "worker", username: "worker", role: "field_worker", site_id: 2, type: "access" };
  const dialect = new PgDialect();
  const query = (condition: SQL | undefined) => {
    assert.ok(condition);
    return dialect.sqlToQuery(condition);
  };
  const householdTables = [schema.households, schema.householdMembers, schema.eligibleWomen,
    schema.pregnancies, schema.followUpTasks, schema.formResponses, schema.domainEvents];
  try {
    await t.test("zero assignments denies household reads without locality expansion", async () => {
      areas([[2, "02", null, null]]);
      for (const table of householdTables) {
        assert.equal(query(await buildAreaScopeCondition(worker, table)).sql, "false");
        const conditions: SQL[] = [];
        await appendAreaScopeCondition(worker, table, conditions);
        assert.equal(conditions.length, 1);
        assert.equal(query(conditions[0]).sql, "false");
      }
      assert.ok(selections.every((sql) => !sql.includes('from "user_area_assignments"')));
    });
    await t.test("explicit same-site households remain authoritative without area assignments", async () => {
      const ids = ["2-02-0001-01", "2-02-0001-02"];
      assign(ids); areas([]);
      for (const table of householdTables) {
        const compiled = query(await buildAreaScopeCondition(worker, table));
        assert.match(compiled.sql, /household_id.* in \(\$1, \$2\)/);
        assert.deepEqual(compiled.params, ids);
      }
      for (const id of ids) assert.equal(await canAccessLocation(worker, 2, "02", id), true);
      assert.equal(await canAccessLocation(worker, 2, "02", "2-02-0001-03"), false);
      assert.equal(await canAccessLocation(worker, 1, "02", ids[0]), false);
      assert.equal(await canAccessLocation(worker, 2, "39", ids[0]), false);
    });
    await t.test("moving Bareilly to Ballabhgarh ignores legacy links and stale JWT scope", async () => {
      const currentIds = ["2-39-0002-01", "2-39-0002-02"];
      assign(["1-01-0004-04", ...currentIds]);
      sqlite.prepare("INSERT INTO field_worker_household_assignments VALUES (?, ?)").run("other-worker", "1-01-0004-04");
      areas([[1, "01", null, null], [2, "39", null, null]]);
      const before = JSON.stringify(sqlite.prepare("SELECT * FROM field_worker_household_assignments").all());
      const oldToken = { ...worker, site_id: 1 };
      assert.deepEqual((await getCurrentFieldWorkerHouseholdAssignments(worker.sub)).map((row) => row.household_id), currentIds,
        "sync uses the same valid current allocation snapshot");
      assert.deepEqual(query(await buildAreaScopeCondition(oldToken, schema.households)).params, currentIds);
      assert.equal(await canAccessLocation(oldToken, 1, "01", "1-01-0004-04"), false);
      assert.equal(await canAccessLocation(oldToken, 2, "39", "1-01-0004-04"), false);
      assert.equal(await canAccessLocation(oldToken, 2, "39", currentIds[0]), true);
      const masterScope = await buildAreaScopeCondition(oldToken, { site_id: schema.households.site_id, locality_code: schema.households.locality_code });
      assert.deepEqual(query(masterScope).params, [2, "39"]);
      assert.equal(JSON.stringify(sqlite.prepare("SELECT * FROM field_worker_household_assignments").all()), before);
      sqlite.exec("UPDATE users SET active = 0 WHERE user_id = 'worker'");
      assert.deepEqual(await getCurrentFieldWorkerHouseholdAssignments(worker.sub), []);
      assert.equal(query(await buildAreaScopeCondition(oldToken, schema.households)).sql, "false");
      assert.equal(await canAccessLocation(oldToken, 2, "39", currentIds[0]), false);
      sqlite.exec("UPDATE users SET active = 1 WHERE user_id = 'worker'");
    });
    await t.test("area-scoped baseline checks remain limited to current live account areas", async () => {
      assign([]); areas([[1, "01", null, null], [2, "02", null, null]]);
      const areaTable = { site_id: schema.households.site_id, locality_code: schema.households.locality_code };
      assert.deepEqual(query(await buildAreaScopeCondition(worker, areaTable)).params, [2, "02"]);
      assert.equal(await canAccessLocation(worker, 2, "02"), true);
      assert.equal(await canAccessLocation(worker, 2, "02", "2-02-0001-01"), true);
      assert.equal(await canAccessLocation(worker, 2, "02", "1-01-0004-04"), false,
        "old household metadata cannot claim a new site to use the baseline fallback");
      assert.equal(await canAccessLocation(worker, 1, "01"), false);
      areas([[2, "02", null, "2000-01-01"], [2, "39", "2999-01-01", null]]);
      assert.equal(query(await buildAreaScopeCondition(worker, areaTable)).sql, "false");
      assert.equal(await canAccessLocation(worker, 2, "02"), false);
    });
    await t.test("central and site manager scopes are unchanged", async () => {
      areas([]);
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
    sqlite.close();
  }
});
