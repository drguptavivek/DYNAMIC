import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { assembleDashboard, assignedHouseholdsSql, dashboardScope, dashboardSql, emptyDashboardMetrics } from "./operationsDashboard";
import type { JwtPayload } from "./jwt";

const user: JwtPayload = { sub: "manager", username: "manager", role: "site_data_manager", site_id: 4, type: "access" };
test("site managers stay in their own site even with a forged site filter", () => {
  assert.equal(dashboardScope(user, { site_id: "2" }).site_id, 4);
  assert.equal(dashboardScope({ ...user, role: "central_admin" }, { site_id: "2" }).site_id, 2);
  assert.throws(() => dashboardScope({ ...user, site_id: null }, {}), /FORBIDDEN/);
  for (const site_id of [undefined, 0, NaN, "4"]) assert.throws(() => dashboardScope({ ...user, site_id } as JwtPayload, {}), /FORBIDDEN/);
  for (const role of ["field_worker", "us_collaborator"] as const) assert.throws(() => dashboardScope({ ...user, role }, {}), /FORBIDDEN/);
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


test("all-time default, legacy date mode and explicit mode validation", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  assert.equal(dashboardScope(user, {}, now).period, "all");
  assert.equal(dashboardScope(user, { date: "2026-10-01" }, now).period, "date");
  const scope = dashboardScope(user, { period: "all", date: "2026-10-01", user_id: "cw", search: "  RAJ%_  ", form_code: "WQ" }, now);
  assert.equal(scope.search, "RAJ%_");
  const queries = dashboardSql(scope);
  const facts = new PgDialect().sqlToQuery(queries.facts);
  assert.ok(facts.params.includes("2026-10-21T18:30:00.000Z"), "all time ends after today IST");
  assert.ok(!facts.params.includes("2026-10-01T00:00:00+05:30"), "all mode ignores stale selected date");
  assert.match(facts.sql, /strpos\(lower\(u.username\)/, "search is literal substring, not wildcard matching");
  assert.ok(facts.params.includes("WQ"));
  const options = new PgDialect().sqlToQuery(queries.staff_options);
  assert.ok(!options.params.includes("cw"), "worker choices are stable when a worker is selected");
  assert.ok(!options.params.includes("RAJ%_"));
  assert.equal(dashboardScope(user, { form_code: "FUTURE_1" }).form_code, "FUTURE_1");
  for (const period of ["week", [], null]) assert.throws(() => dashboardScope(user, { period }), /INVALID_PERIOD/);
  for (const user_id of [[], {}, " ", "a".repeat(201), "bad\nuser"]) assert.throws(() => dashboardScope(user, { user_id }), /INVALID_USER/);
  for (const form_code of ["bad-code", "wrong", [], "WQ' OR true"]) assert.throws(() => dashboardScope(user, { form_code }), /INVALID_FORM/);
  for (const search of [[], {}, "a".repeat(201)]) assert.throws(() => dashboardScope(user, { search }), /INVALID_SEARCH/);
});


test("today and inclusive date ranges validate scalar endpoints and retain IST boundaries", () => {
  const now = new Date("2026-11-12T18:29:59Z");
  const today = dashboardScope(user, { period: "today", date: "2026-01-01" }, now);
  assert.equal(today.date, "2026-11-12");
  assert.equal(today.period, "today");
  const range = dashboardScope(user, { period: "range", date_from: "2026-10-31", date_to: "2026-11-02" }, now);
  assert.equal(range.date_from, "2026-10-31");
  assert.equal(range.date_to, "2026-11-02");
  const facts = new PgDialect().sqlToQuery(dashboardSql(range).facts);
  assert.ok(facts.params.includes("2026-10-31T00:00:00+05:30"));
  assert.ok(facts.params.includes("2026-11-02T18:30:00.000Z"), "end date includes the full IST day");
  assert.equal(dashboardScope(user, { period: "range", date_from: "2024-02-29", date_to: "2024-02-29" }).date_to, "2024-02-29");
  for (const query of [
    { period: "range" }, { period: "range", date_from: "2026-11-12" },
    { period: "range", date_to: "2026-11-12" },
    { period: "range", date_from: "2026-11-13", date_to: "2026-11-12" },
    { period: "range", date_from: "2026-02-30", date_to: "2026-03-01" },
    { period: "range", date_from: ["2026-11-12"], date_to: "2026-11-12" },
    { period: "range", date_from: "2026-11-12", date_to: null },
    { period: "date", date: ["2026-11-12"] },
    { period: "all", date_from: "2026-11-12", date_to: "2026-11-12" },
    { period: "range", date: "2026-11-12", date_from: "2026-11-12", date_to: "2026-11-12" },
  ]) assert.throws(() => dashboardScope(user, query, now), /INVALID_DATE/);
  assert.throws(() => dashboardScope(user, { site_id: ["4"] }), /INVALID_SITE/);
  assert.throws(() => dashboardScope(user, { locality_code: ["04"] }), /INVALID_LOCALITY/);
});

test("village cards keep current staff names, zero counts and selected user's historical villages", () => {
  const staff = { user_id: "worker", username: "worker.login", display_name: "Worker" };
  const row = { ...emptyDashboardMetrics(), ...staff, active: true, role: "field_worker", site_id: 4, site_name: "Chennai", assigned_localities: [{ site_id: 4, locality_code: "04", locality_name: "Assigned" }], completed_localities: [], last_sync_at: null, last_sync_status: null };
  const options = [
    { site_id: 4, site_name: "Chennai", locality_code: "04", locality_name: "Assigned", assigned_users: [staff] },
    { site_id: 4, site_name: "Chennai", locality_code: "05", locality_name: "Historical", assigned_users: [], selected_user_has_forms: true },
    { site_id: 4, site_name: "Chennai", locality_code: "06", locality_name: "Unrelated zero", assigned_users: [] },
    { site_id: 2, site_name: "Ballabhgarh", locality_code: "04", locality_name: "Other site", assigned_users: [staff] },
  ];
  const quality = { unattributed_forms: 0, open_data_quality_flags: 0 };
  const scope = dashboardScope(user, { user_id: staff.user_id, period: "range", date_from: "2026-11-01", date_to: "2026-11-12" });
  const result = assembleDashboard(scope, [row], [], options, quality);
  assert.deepEqual(result.localities_summary.map(l => l.locality_code), ["04", "05"]);
  assert.deepEqual(result.localities_summary[0].assigned_users, [staff]);
  assert.equal(result.localities_summary[1].forms_completed, 0, "historical card stays visible on a zero-activity selected period");
  assert.equal(result.date_from, "2026-11-01");
  const all = assembleDashboard(dashboardScope(user, {}), [row], [
    { user_id: null, site_id: 4, locality_code: "04", gu: 1, gs: 0, gl: 0, metric: "forms_completed", code: "FUTURE_1", count: 2 },
  ], options, quality);
  assert.deepEqual(all.localities_summary.map(l => l.locality_code), ["04", "05", "06"]);
  assert.deepEqual(all.localities_summary[0].forms_by_code, { FUTURE_1: 2 });
});


test("assigned household query requires one user, validates pages and applies selected-user activity dates", () => {
  assert.throws(() => assignedHouseholdsSql(dashboardScope(user, {})), /INVALID_USER/);
  const scope = dashboardScope(user, { user_id: "worker", period: "range", date_from: "2026-11-01", date_to: "2026-11-12", site_id: "2" });
  for (const page of [0, -1, 1.5, NaN, Infinity, 2147483648]) assert.throws(() => assignedHouseholdsSql(scope, page), /INVALID_PAGE/);
  const compiled = new PgDialect().sqlToQuery(assignedHouseholdsSql(scope, 2));
  assert.ok(compiled.params.includes(4));
  assert.ok(compiled.params.includes("worker"));
  assert.ok(compiled.params.includes(50));
  assert.ok(compiled.params.includes("2026-11-01T00:00:00+05:30"));
  assert.ok(compiled.params.includes("2026-11-12T18:30:00.000Z"));
  assert.match(compiled.sql, /coalesce\(d.client_updated_at,d.server_updated_at\)/);
  assert.match(compiled.sql, /u.site_id=households.site_id/);
  assert.match(compiled.sql, /exists\(select 1 from field_worker_household_assignments/);
  assert.match(compiled.sql, /case when "households"\."cohort_status"='excluded'/, "use the shared assignment status classifier");
});


test("supervisor dashboard scope is deny-by-default and cannot widen its current village list", () => {
  const supervisor = { ...user, role: "field_supervisor" } as JwtPayload;
  const now = new Date("2026-11-13T12:00:00Z");
  const denied = dashboardScope(supervisor, {}, now);
  assert.deepEqual(denied.locality_codes, []);
  const scope = dashboardScope(supervisor, { site_id: "2", locality_code: "05", user_id: "foreign" }, now, ["04", "04"]);
  assert.equal(scope.site_id, 4);
  assert.deepEqual(scope.locality_codes, ["04"]);
  for (const query of Object.values(dashboardSql(scope))) {
    const compiled = new PgDialect().sqlToQuery(query);
    assert.ok(compiled.params.includes(4));
    assert.ok(!compiled.params.includes(2), "forged foreign site never enters a query");
    assert.ok(compiled.params.includes("04"), "every query enforces the assigned village");
  }
  assert.throws(() => dashboardScope({ ...supervisor, site_id: null }, {}, now, ["04"]), /FORBIDDEN/);
  const result = assembleDashboard(denied, [], [], [
    { site_id: 4, site_name: "Chennai", locality_code: "04", locality_name: "Not assigned" },
  ], { unattributed_forms: 0, open_data_quality_flags: 0 });
  assert.deepEqual(result.sites, []);
  assert.deepEqual(result.localities, []);
  assert.deepEqual(result.localities_summary, []);
});
