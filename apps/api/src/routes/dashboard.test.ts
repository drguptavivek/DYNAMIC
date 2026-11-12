import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import express from "express";
import * as orm from "drizzle-orm";
import * as schema from "../db/schema";
import * as operations from "../lib/operationsDashboard";
import * as errors from "../lib/errors";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AddressInfo } from "node:net";

function load(path: string, modules: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  runInNewContext(source, { exports, console, Error, require(name: string) { assert.ok(name in modules, `Unexpected module ${name}`); return modules[name]; } });
  return exports;
}

test("operations HTTP route enforces authentication, aggregate permission, role and site scope", async () => {
  let capability = true;
  let pii = true;
  const executed: { sql: string; params: unknown[] }[] = [];
  const access = load("../lib/dataAccess.ts", {
    "drizzle-orm": orm, "./errors": errors,
    "../db": { schema, db: { select() { const builder: any = { from: () => builder, leftJoin: () => builder, where: () => builder, limit: async () => [{ can_access_pii: pii, can_access_aggregate_dashboards: capability }] }; return builder; } } },
  });
  const router = load("./dashboard.ts", {
    express: { Router: express.Router }, "drizzle-orm": orm, "../lib/errors": errors,
    "../lib/areaScope": { appendAreaScopeCondition() {} }, "../lib/dataAccess": access, "../lib/operationsDashboard": operations,
    "../lib/siteFormTotals": { assembleSiteFormTotals() {}, siteFormTotalsSql() {} },
    "../lib/siteOperationalProgress": { siteOperationalProgressSql() {} },
    "../middleware/auth": { requireRole: (...roles: string[]) => (req: any, res: any, next: any) => roles.includes(req.user.role) ? next() : errors.sendError(res, 403, "FORBIDDEN", "Role not permitted"), requireAuth(req: any, res: any, next: any) {
      if (!req.headers.authorization) return errors.sendError(res, 401, "MISSING_AUTH", "Missing auth");
      req.user = { sub: "manager", username: "manager", role: req.headers["x-role"] || "site_data_manager", site_id: 4, type: "access" }; next();
    } },
    "../db": { schema, db: { async execute(query: orm.SQL) {
      const compiled = new PgDialect().sqlToQuery(query);
      executed.push(compiled);
      if (compiled.sql.startsWith("with assigned as")) return { rows: [{ rows: [{ household_id: "c1", household_head_name: "Test head", site_id: 4, site_name: "Chennai", locality_code: "04", locality_name: "Village", bhq_status: "draft", last_activity_at: "2026-11-12T04:00:00.000Z" }], summary: { assigned: 1, completed: 0, draft: 1, excluded: 0, pending: 0 }, page: 1, total_pages: 1 }] };
      return { rows: executed.length % 6 === 4 ? [{ unattributed_forms: 0, open_data_quality_flags: 0 }] : executed.length % 6 === 5 ? [{ households: 0, members: 0, eligible_women: 0, tracking_eligible_women: 0, active_pregnancies: 0, children: 0 }] : [] };
    } } },
  }).default;
  const app = express(); app.use("/dashboard", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/dashboard/operations`;
  try {
    assert.equal((await fetch(base)).status, 401);
    capability = false;
    assert.equal((await fetch(base, { headers: { authorization: "test" } })).status, 403);
    assert.equal(executed.length, 0);
    capability = true;
    for (const role of ["field_worker", "field_supervisor", "us_collaborator"]) assert.equal((await fetch(base, { headers: { authorization: "test", "x-role": role } })).status, 403);
    assert.equal(executed.length, 0);
    assert.equal((await fetch(base + "?date=2026-02-30", { headers: { authorization: "test" } })).status, 400);
    const response = await fetch(base + "?site_id=2&date=2026-10-21", { headers: { authorization: "test" } });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.data.scope.site_id, 4);
    assert.equal(body.data.scope.all_sites, false);
    assert.equal(executed.length, 6);
    for (const query of executed) { assert.ok(query.params.includes(4)); assert.ok(!query.params.includes(2)); }
    for (const query of [
      "?period=range&date_from=2026-11-01", "?period=range&date_to=2026-11-12",
      "?period=range&date_from=2026-11-13&date_to=2026-11-12",
      "?period=range&date_from=2026-02-30&date_to=2026-03-01",
      "?period=range&date_from=2026-11-01&date_to=2026-11-12&date=2026-11-12",
      "?period=range&date_from=2026-11-01&date_from=2026-11-02&date_to=2026-11-12",
    ]) assert.equal((await fetch(base + query, { headers: { authorization: "test" } })).status, 400);
    assert.equal(executed.length, 6, "invalid range requests fail before database queries");
    const ranged = await fetch(base + "?period=range&date_from=2026-11-01&date_to=2026-11-12&site_id=2", { headers: { authorization: "test" } });
    assert.equal(ranged.status, 200);
    const rangeBody = await ranged.json() as any;
    assert.equal(rangeBody.data.period, "range");
    assert.equal(rangeBody.data.date_from, "2026-11-01");
    assert.equal(rangeBody.data.date_to, "2026-11-12");
    assert.equal(rangeBody.data.scope.site_id, 4);
    assert.equal((await fetch(base + "?period=today", { headers: { authorization: "test" } })).status, 200);
    const assignedBase = base.replace("/operations", "/assigned-households");
    const beforeAssignments = executed.length;
    assert.equal((await fetch(assignedBase + "?user_id=cw")).status, 401);
    for (const role of ["field_worker", "field_supervisor", "us_collaborator"]) assert.equal((await fetch(assignedBase + "?user_id=cw", { headers: { authorization: "test", "x-role": role } })).status, 403);
    capability = false;
    assert.equal((await fetch(assignedBase + "?user_id=cw", { headers: { authorization: "test" } })).status, 403);
    capability = true;
    for (const query of ["", "?user_id=", "?user_id=cw&page=0", "?user_id=cw&page=1x", "?user_id=cw&page=2147483648", "?user_id=cw&page=1&page=2", "?user_id=cw&period=range&date_from=2026-11-12"]) assert.equal((await fetch(assignedBase + query, { headers: { authorization: "test" } })).status, 400);
    assert.equal(executed.length, beforeAssignments, "invalid or unauthorized assigned-household requests never query data");
    const assigned = await fetch(assignedBase + "?user_id=cw&site_id=2&period=range&date_from=2026-11-01&date_to=2026-11-12", { headers: { authorization: "test" } });
    assert.equal(assigned.status, 200);
    const assignedBody = await assigned.json() as any;
    assert.equal(assignedBody.data.rows[0].site_id, 4);
    assert.equal(assignedBody.data.rows[0].household_head_name, "Test head");
    assert.equal(assignedBody.data.rows[0].bhq_status, "draft");
    assert.equal(assignedBody.data.summary.assigned, 1);
    assert.ok(executed.at(-1)!.params.includes(4));
    assert.ok(!executed.at(-1)!.params.includes(2));
    assert.ok(executed.at(-1)!.params.includes("2026-11-01T00:00:00+05:30"));
    pii = false;
    const masked = await fetch(assignedBase + "?user_id=cw", { headers: { authorization: "test" } });
    assert.equal(masked.status, 200);
    assert.equal(((await masked.json()) as any).data.rows[0].household_head_name, null, "aggregate permission does not reveal head names without PII access");


  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
