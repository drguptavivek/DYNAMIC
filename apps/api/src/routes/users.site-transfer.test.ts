import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import usersRouter from "./users";

test("field-worker site transfer withdraws only that worker's obsolete household allocations atomically", async () => {
  const original = { select: db.select, transaction: db.transaction };
  const dialect = new PgDialect();
  const initial = () => ({
    users: [{ user_id: "worker", username: "worker", role: "field_worker", site_id: 1, active: true }],
    areas: [{ user_id: "worker", site_id: 1, locality_code: "01" }],
    allocations: [
      ...[1, 2, 3, 4].map((n) => ({ user_id: "worker", household_id: `1-01-000${n}-01` })),
      ...[1, 2].map((n) => ({ user_id: "worker", household_id: `2-39-000${n}-01` })),
      { user_id: "other-worker", household_id: "1-01-0001-01" },
    ],
  });
  let state: any = initial();
  const households = [
    ...[1, 2, 3, 4].map((n) => ({ household_id: `1-01-000${n}-01`, site_id: 1 })),
    ...[1, 2].map((n) => ({ household_id: `2-39-000${n}-01`, site_id: 2 })),
  ];
  const writes: { table: unknown; type: string }[] = [];
  let transactions = 0;
  let failAllocationDelete = false;
  let failAreaInsert = false;
  const matches = (row: any, condition: any) => {
    const { sql, params } = dialect.sqlToQuery(condition);
    for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)) {
      if (row[match[1]] !== params[Number(match[2]) - 1]) return false;
    }
    for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" in \(([^)]+)\)/g)) {
      const values = [...match[2].matchAll(/\$(\d+)/g)].map((value) => params[Number(value[1]) - 1]);
      if (!values.includes(row[match[1]])) return false;
    }
    return true;
  };
  (db as any).select = () => ({ from(table: unknown) {
    let condition: any;
    const rows = () => {
      const source = table === schema.users ? state.users : table === schema.studySites ? [{ site_id: 1 }, { site_id: 2 }] :
        table === schema.studyLocalities ? [{ site_id: 1, locality_code: "01" }, { site_id: 2, locality_code: "39" }] :
        assert.fail("Unexpected read table");
      return source.filter((row: any) => matches(row, condition));
    };
    const chain: any = { where(value: any) { condition = value; return chain; }, leftJoin() { return chain; },
      then(resolve: any, reject: any) { return Promise.resolve(rows()).then(resolve, reject); } };
    return chain;
  } });
  (db as any).transaction = async (callback: any) => {
    transactions++;
    const before = structuredClone(state);
    const tx = {
      // Build the actual Drizzle subquery without executing a database read.
      select: original.select.bind(db),
      update(table: unknown) { return { set: (values: any) => ({ where: async (condition: any) => {
        assert.equal(table, schema.users);
        writes.push({ table, type: "update" });
        state.users = state.users.map((row: any) => matches(row, condition) ? { ...row, ...values } : row);
      } }) }; },
      delete(table: unknown) { return { where: async (condition: any) => {
        writes.push({ table, type: "delete" });
        if (table === schema.userAreaAssignments) {
          state.areas = state.areas.filter((row: any) => !matches(row, condition));
        } else {
          assert.equal(table, schema.fieldWorkerHouseholdAssignments, "Never remove study or task rows");
          if (failAllocationDelete) throw new Error("Simulated allocation write failure");
          const compiled = dialect.sqlToQuery(condition);
          assert.match(compiled.sql, /"field_worker_household_assignments"\."user_id" = \$1/);
          assert.match(compiled.sql, /"household_id" in \(select "household_id" from "households" where "households"\."site_id" <> \$2\)/);
          const [userId, nextSite] = compiled.params;
          state.allocations = state.allocations.filter((row: any) => row.user_id !== userId ||
            households.find((household) => household.household_id === row.household_id)?.site_id === nextSite);
        }
      } }; },
      insert(table: unknown) { return { values: async (values: any[]) => {
        assert.equal(table, schema.userAreaAssignments);
        if (failAreaInsert) throw new Error("Simulated area write failure");
        writes.push({ table, type: "insert" });
        state.areas.push(...values);
      } }; },
    };
    try { return await callback(tx); } catch (error) { state = before; throw error; }
  };
  async function patch(body: any, role = "central_admin", siteId: number | null = null) {
    const route = (usersRouter as any).stack.find((layer: any) => layer.route?.path === "/:id" && layer.route.methods.patch).route;
    const request = { user: { sub: "admin", username: "admin", role, site_id: siteId, type: "access" }, params: { id: "worker" }, body };
    let status = 0, result: any;
    const response = { status(code: number) { status = code; return this; }, json(value: any) { result = value; } };
    for (const layer of route.stack.slice(1)) {
      let next = false;
      await layer.handle(request, response, () => { next = true; });
      if (!next) break;
    }
    return { status, result };
  }
  const reset = () => { state = initial(); writes.length = 0; transactions = 0; failAllocationDelete = false; failAreaInsert = false; };
  try {
    const transferred = await patch({ site_id: 2, locality_codes: ["39"] });
    assert.equal(transferred.status, 200);
    assert.equal(transactions, 1);
    assert.equal(state.users[0].site_id, 2);
    assert.deepEqual(state.areas.map((row: any) => [row.site_id, row.locality_code]), [[2, "39"]]);
    assert.deepEqual(state.allocations, initial().allocations.filter((row) => row.user_id === "other-worker" || row.household_id.startsWith("2-")));
    assert.equal(transferred.result.data.site_id, 2);
    assert.ok(writes.every(({ table }) => [schema.users, schema.userAreaAssignments, schema.fieldWorkerHouseholdAssignments].includes(table as any)));

    for (const body of [{ display_name: "Renamed" }, { site_id: 1, locality_codes: ["01"] }]) {
      reset();
      assert.equal((await patch(body)).status, 200);
      assert.deepEqual(state.allocations, initial().allocations, "Same-site and profile changes keep every allocation");
      assert.ok(!writes.some(({ table }) => table === schema.fieldWorkerHouseholdAssignments));
    }
    reset();
    state.users[0].role = "field_supervisor";
    assert.equal((await patch({ site_id: 2, locality_codes: ["39"] })).status, 200);
    assert.deepEqual(state.allocations, initial().allocations, "Other roles retain their existing behavior");

    reset();
    assert.equal((await patch({ site_id: 2, locality_codes: ["invalid"] })).status, 400);
    assert.equal(transactions, 0);
    assert.equal(writes.length, 0);
    assert.deepEqual(state, initial());
    assert.equal((await patch({ site_id: 2, locality_codes: ["39"] }, "site_research_scientist", 1)).status, 403);
    assert.equal(transactions, 0);
    assert.deepEqual(state, initial());

    for (const failure of ["allocation", "area"]) {
      reset();
      failAllocationDelete = failure === "allocation";
      failAreaInsert = failure === "area";
      const beforeFailure: ReturnType<typeof initial> = structuredClone(state);
      const originalConsoleError = console.error;
      try {
        console.error = () => {};
        assert.equal((await patch({ site_id: 2, locality_codes: ["39"] })).status, 500);
      } finally { console.error = originalConsoleError; }
      assert.equal(transactions, 1);
      assert.deepEqual(state, beforeFailure, "Every failed transfer rolls back user, area and allocation changes together");
    }
  } finally { Object.assign(db, original); }
});
