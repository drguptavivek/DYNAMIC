import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import { JwtPayload } from "../middleware/auth";
import { getHouseholdAssignmentLocalities } from "../lib/householdAssignmentScope";
import assignmentsRouter from "./field-worker-household-assignments";
import usersRouter from "./users";
import areaAssignmentsRouter from "./area-assignments";

test("site data manager allocation is limited to its active assigned areas and own site workers", async () => {
  const original = { select: db.select, insert: db.insert, update: db.update, delete: db.delete };
  const dialect = new PgDialect();
  const manager: JwtPayload = { sub: "manager", username: "manager", role: "site_data_manager", site_id: 4, type: "access" };
  const household = (id: string, site: number, locality: string) => ({ household_id: id, site_id: site, locality_code: locality, household_number: "01", baseline_enrollment_status: "pending" });
  let areas: any[] = [];
  const households = [household("4-10-0001-01", 4, "10"), household("4-11-0001-01", 4, "11"), household("2-10-0001-01", 2, "10")];
  const workers = [
    { user_id: "worker", site_id: 4, role: "field_worker", active: true },
    { user_id: "other-site", site_id: 2, role: "field_worker", active: true },
    { user_id: "admin", site_id: 4, role: "site_research_scientist", active: true },
    { user_id: "inactive", site_id: 4, role: "field_worker", active: false },
    { user_id: "manager", site_id: 4, role: "site_data_manager", active: true },
  ];
  const writes: any[] = [];
  function matches(row: any, condition: any) {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    if (/\bfalse\b/.test(sql)) return false;
    for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)) {
      if (row[match[1]] !== params[Number(match[2]) - 1]) return false;
    }
    for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" in \(([^)]+)\)/g)) {
      const values = [...match[2].matchAll(/\$(\d+)/g)].map((value) => params[Number(value[1]) - 1]);
      if (!values.includes(row[match[1]])) return false;
    }
    return true;
  }
  (db as any).select = () => ({ from(table: unknown) {
    let condition: any;
    const rows = () => {
      const source = table === schema.userAreaAssignments ? areas : table === schema.households ? households :
        table === schema.users ? workers : table === schema.devices ? [] : assert.fail("Unexpected table");
      return source.filter((row: any) => matches(row, condition));
    };
    const chain: any = {
      where(value: any) { condition = value; return chain; }, leftJoin() { return chain; },
      orderBy: async () => rows(), limit: async (count: number) => rows().slice(0, count),
      then(resolve: any, reject: any) { return Promise.resolve(rows()).then(resolve, reject); },
    };
    return chain;
  } });
  (db as any).delete = (table: unknown) => ({ where: async () => { writes.push({ type: "delete", table }); } });
  (db as any).update = (table: unknown) => ({ set: (values: unknown) => ({ where: async () => { writes.push({ type: "update", table, values }); } }) });
  (db as any).insert = (table: unknown) => ({ values: (values: unknown) => ({ onConflictDoUpdate: async () => { writes.push({ type: "insert", table, values }); } }) });
  async function call(router: any, method: string, actor = manager, input: any = {}, path = "/") {
    const route = router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
    const request = { user: actor, query: {}, body: {}, params: {}, ...input };
    let status = 0, body: any;
    const response = { status(code: number) { status = code; return this; }, json(value: any) { body = value; } };
    // Authentication is injected; execute the actual role middleware and route handler.
    for (const layer of route.stack.slice(1)) {
      let next = false;
      await layer.handle(request, response, () => { next = true; });
      if (!next) break;
    }
    return { status, body };
  }
  const assignment = (user_id: string, site_id = 4, locality_code = "10", active_from: string | null = null, active_to: string | null = null) => ({ user_id, site_id, locality_code, active_from, active_to });
  try {
    areas = [assignment("manager"), assignment("manager", 2), assignment("manager", 4, "11", null, "2000-01-01")];
    assert.deepEqual(await getHouseholdAssignmentLocalities(manager), ["10"]);
    const realDate = globalThis.Date;
    try {
      globalThis.Date = class extends realDate { constructor() { super("2026-10-28T19:00:00Z"); } } as DateConstructor;
      areas = [assignment("manager", 4, "10", "2026-10-29"), assignment("manager", 4, "11", null, "2026-10-28")];
      assert.deepEqual(await getHouseholdAssignmentLocalities(manager), ["10"], "Active bounds use the IST day, not UTC");
    } finally { globalThis.Date = realDate; }
    areas = [assignment("manager"), assignment("worker"), assignment("worker", 4, "11")];
    const listed = await call(assignmentsRouter, "get", manager, { query: { site_id: "4" } });
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.data.map((row: any) => row.household_id), ["4-10-0001-01"]);
    assert.equal((await call(assignmentsRouter, "get", manager, { query: { site_id: "2" } })).status, 403);
    assert.equal((await call(assignmentsRouter, "get", manager, { query: { site_id: "4", locality_code: "11" } })).status, 403);
    assert.equal((await call(assignmentsRouter, "get", { ...manager, role: "field_worker" }, { query: { site_id: "4" } })).status, 403);
    for (const ids of [["4-10-0001-01", "4-11-0001-01"], ["4-10-0001-01", "2-10-0001-01"]]) {
      assert.notEqual((await call(assignmentsRouter, "post", manager, { body: { household_ids: ids, user_ids: ["worker"] } })).status, 200);
      assert.equal((await call(assignmentsRouter, "delete", manager, { body: { household_ids: ids } })).status, 403);
      assert.equal(writes.length, 0, "Mixed-scope batches never partially write");
    }
    for (const user of ["other-site", "admin", "inactive", "missing"]) {
      assert.notEqual((await call(assignmentsRouter, "post", manager, { body: { household_ids: ["4-10-0001-01"], user_ids: [user] } })).status, 200);
      assert.equal(writes.length, 0);
    }
    for (const user of ["other-site", "admin", "missing"]) {
      assert.equal((await call(assignmentsRouter, "delete", manager, { body: { household_ids: ["4-10-0001-01"], user_ids: [user] } })).status, 403);
      assert.equal(writes.length, 0);
    }
    assert.equal((await call(assignmentsRouter, "post", manager, { body: { household_ids: ["4-10-0001-01"], user_ids: ["worker"] } })).status, 200);
    const taskWrite = writes.find((write) => write.type === "insert" && write.table === schema.followUpTasks);
    assert.equal(taskWrite.values[0].generation_source, "field_worker_household_assignment");
    assert.equal(taskWrite.values[0].task_type, "HHQ");
    assert.equal(taskWrite.values[0].action_state, "enabled");
    assert.ok(taskWrite.values[0].task_key.startsWith("4-10-0001-01:household:4-10-0001-01:HHQ:baseline:"));
    writes.length = 0;
    assert.equal((await call(assignmentsRouter, "delete", manager, { body: { household_ids: ["4-10-0001-01"], user_ids: ["worker"] } })).status, 200);
    assert.equal(writes.length, 1);
    writes.length = 0;
    const visibleWorkers = await call(usersRouter, "get", manager, { query: { site_id: "4", role: "field_worker", active: "1" } });
    assert.equal(visibleWorkers.status, 200);
    assert.deepEqual(visibleWorkers.body.data.map((user: any) => user.user_id), ["worker"]);
    assert.equal((await call(usersRouter, "get", manager, { query: { site_id: "2" } })).status, 403);
    assert.equal((await call(usersRouter, "get", manager, { query: { role: "central_admin" } })).status, 403);
    const workerAreas = await call(areaAssignmentsRouter, "get", manager, { params: { userId: "worker" } }, "/users/:userId/area-assignments");
    assert.equal(workerAreas.status, 200);
    assert.deepEqual(workerAreas.body.data.map((area: any) => area.locality_code), ["10"]);
    assert.equal((await call(areaAssignmentsRouter, "get", manager, { params: { userId: "other-site" } }, "/users/:userId/area-assignments")).status, 403);
    areas = [];
    assert.deepEqual((await call(assignmentsRouter, "get", manager, { query: { site_id: "4" } })).body.data, []);
    assert.deepEqual((await call(usersRouter, "get", manager)).body.data, []);
    assert.equal((await call(assignmentsRouter, "post", manager, { body: { household_ids: ["4-10-0001-01"], user_ids: ["worker"] } })).status, 403);
    assert.equal((await call(assignmentsRouter, "delete", manager, { body: { household_ids: ["4-10-0001-01"] } })).status, 403);
    assert.deepEqual((await call(assignmentsRouter, "get", { ...manager, site_id: null }, { query: { site_id: "4" } })).status, 403);
    assert.equal(writes.length, 0);
    for (const role of ["central_admin", "site_research_scientist", "field_supervisor"] as const) {
      assert.equal(await getHouseholdAssignmentLocalities({ ...manager, role }), undefined, "Existing roles retain their scope rules");
      assert.equal((await call(assignmentsRouter, "get", { ...manager, role }, { query: { site_id: "4" } })).body.data.length, 2);
    }
    const futureManager = { ...manager, site_id: 9 };
    areas = [assignment("manager", 9, "90")];
    households.push(household("9-90-0001-01", 9, "90"));
    workers.push({ user_id: "future-worker", site_id: 9, role: "field_worker", active: true });
    assert.equal((await call(assignmentsRouter, "post", futureManager, { body: { household_ids: ["9-90-0001-01"], user_ids: ["future-worker"] } })).status, 200, "Future sites use the same assignment path");
  } finally { Object.assign(db, original); }
});
