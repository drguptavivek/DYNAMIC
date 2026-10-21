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
  const executed: { sql: string; params: unknown[] }[] = [];
  const access = load("../lib/dataAccess.ts", {
    "drizzle-orm": orm, "./errors": errors,
    "../db": { schema, db: { select() { const builder: any = { from: () => builder, leftJoin: () => builder, where: () => builder, limit: async () => [{ can_access_pii: true, can_access_aggregate_dashboards: capability }] }; return builder; } } },
  });
  const router = load("./dashboard.ts", {
    express: { Router: express.Router }, "drizzle-orm": orm, "../lib/errors": errors,
    "../lib/areaScope": { appendAreaScopeCondition() {} }, "../lib/dataAccess": access, "../lib/operationsDashboard": operations,
    "../middleware/auth": { requireAuth(req: any, res: any, next: any) {
      if (!req.headers.authorization) return errors.sendError(res, 401, "MISSING_AUTH", "Missing auth");
      req.user = { sub: "manager", username: "manager", role: req.headers["x-role"] || "site_data_manager", site_id: 4, type: "access" }; next();
    } },
    "../db": { schema, db: { async execute(query: orm.SQL) {
      executed.push(new PgDialect().sqlToQuery(query));
      return { rows: executed.length === 4 ? [{ unattributed_forms: 0, open_data_quality_flags: 0 }] : executed.length === 5 ? [{ households: 0, members: 0, eligible_women: 0, tracking_eligible_women: 0, active_pregnancies: 0, children: 0 }] : [] };
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
    assert.equal(executed.length, 5);
    for (const query of executed) { assert.ok(query.params.includes(4)); assert.ok(!query.params.includes(2)); }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
