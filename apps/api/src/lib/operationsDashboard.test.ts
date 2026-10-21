import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { assembleDashboard, dashboardScope, dashboardSql, emptyDashboardMetrics } from "./operationsDashboard";
import type { JwtPayload } from "./jwt";

const user: JwtPayload = { sub: "manager", username: "manager", role: "site_data_manager", site_id: 4, type: "access" };
test("site managers stay in their own site even with a forged site filter", () => {
  assert.equal(dashboardScope(user, { site_id: "2" }).site_id, 4);
  assert.equal(dashboardScope({ ...user, role: "central_admin" }, { site_id: "2" }).site_id, 2);
  assert.throws(() => dashboardScope({ ...user, site_id: null }, {}), /FORBIDDEN/);
  for (const site_id of [undefined, 0, NaN, "4"]) assert.throws(() => dashboardScope({ ...user, site_id } as JwtPayload, {}), /FORBIDDEN/);
  for (const role of ["field_worker", "field_supervisor", "us_collaborator"] as const) assert.throws(() => dashboardScope({ ...user, role }, {}), /FORBIDDEN/);
});
test("India date boundary and strict calendar/filter validation", () => {
  assert.equal(dashboardScope(user, {}, new Date("2026-10-20T18:30:00Z")).date, "2026-10-21");
  assert.equal(dashboardScope(user, {}, new Date("2026-10-20T18:29:59Z")).date, "2026-10-20");
  for (const date of ["2026-02-30", "wrong", "2026-1-1", "0000-01-01"]) assert.throws(() => dashboardScope(user, { date }), /INVALID_DATE/);
  assert.throws(() => dashboardScope(user, { site_id: "2 OR true" }), /INVALID_SITE/);
  assert.throws(() => dashboardScope(user, { locality_code: "10' OR true" }), /INVALID_LOCALITY/);
  const compiled = new PgDialect().sqlToQuery(dashboardSql(dashboardScope(user, { date: "2026-10-21" })).facts);
  assert.ok(compiled.params.includes("2026-10-21T00:00:00+05:30"));
  assert.ok(compiled.params.includes("2026-10-21T18:30:00.000Z"));
  assert.match(compiled.sql, /count\(distinct id\)/);
});
test("past activity filters retain today's active assignment roster", () => {
  const scope = dashboardScope(user, { date: "2026-10-01", locality_code: "10" }, new Date("2026-10-21T12:00:00Z"));
  assert.equal(scope.date, "2026-10-01");
  assert.equal(scope.as_of_date, "2026-10-21");
  const compiled = new PgDialect().sqlToQuery(dashboardSql(scope).roster);
  const from = compiled.sql.match(/active_from <= \$(\d+)/)!;
  const to = compiled.sql.match(/active_to >= \$(\d+)/)!;
  assert.equal(compiled.params[Number(from[1]) - 1], "2026-10-21");
  assert.equal(compiled.params[Number(to[1]) - 1], "2026-10-21");
  assert.ok(compiled.params.includes("2026-10-01T00:00:00+05:30"));
});
test("zero-activity users remain visible and shared totals use grouped unique counts", () => {
  const scope = dashboardScope({ ...user, role: "central_admin" }, { date: "2026-10-21" });
  const row = (id: string) => ({ ...emptyDashboardMetrics(), user_id: id, username: id, display_name: id, active: true, role: "field_worker", site_id: 4, site_name: "Chennai", assigned_localities: [], completed_localities: [], last_sync_at: null, last_sync_status: null });
  const fact = { user_id: null, site_id: null, locality_code: null, gu: 1, gs: 1, gl: 1, metric: "assigned_households" as const, code: "", count: 1 };
  const result = assembleDashboard(scope, [row("a"), row("b"), row("idle")], [fact,
    { ...fact, user_id: "a", gu: 0, count: 1 }, { ...fact, user_id: "b", gu: 0, count: 1 },
    { ...fact, metric: "forms_completed", code: "HHQ", count: 2 },
    { ...fact, metric: "forms_completed", code: "WQ", count: 3 },
  ], [{ site_id: 4, site_name: "Chennai", locality_code: "01", locality_name: "Village" }], { unattributed_forms: 1, open_data_quality_flags: 0 });
  assert.equal(result.users.length, 3);
  assert.equal(result.users.find(u => u.user_id === "idle")!.forms_completed, 0);
  assert.equal(result.totals.assigned_households, 1);
  assert.equal(result.users.reduce((n, u) => n + u.assigned_households, 0), 2);
  assert.equal(result.totals.forms_completed, 5);
  assert.deepEqual(result.totals.forms_by_code, { HHQ: 2, WQ: 3 });
});
