import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { PgDialect } from "drizzle-orm/pg-core";
import { assembleSiteFormTotals, siteFormTotalsSql } from "./siteFormTotals";
import dashboardRouter from "../routes/dashboard";
import { db } from "../db";

test("site totals count all-time primary field-worker forms at their recorded site without writes", async (t) => {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE") {
      t.skip("Isolated SQLite verification requires Node 22+");
      return;
    }
    throw error;
  }
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`create table study_sites(site_id integer,site_name text);
    create table users(user_id text,role text,site_id integer,active integer);
    create table form_responses(form_response_id text,submitted_by_user_id text,site_id integer,form_code text,response_status text,created_offline_at text);
    insert into study_sites values(1,'Bareilly'),(2,'Ballabhgarh'),(9,'New site');
    insert into users values('worker','field_worker',2,1),('inactive','field_worker',2,0),('admin','central_admin',1,1),('manager','site_data_manager',2,1);
    insert into form_responses values
      ('old','worker',1,'HHQ','primary','2020-01-01'),
      ('later','worker',2,'WQ','primary','2030-01-01'),
      ('legacy','inactive',2,'PEF',null,'2026-10-30'),
      ('unknown-code','worker',2,'NEW_FORM','primary','2026-10-30'),
      ('duplicate','worker',1,'HHQ','duplicate','2026-10-30'),
      ('quarantined','worker',1,'HHQ','quarantined','2026-10-30'),
      ('admin-entry','admin',1,'HHQ','primary','2026-10-30'),
      ('manager-entry','manager',2,'PEF','primary','2026-10-30'),
      ('missing-attribution',null,1,'HHQ','primary','2026-10-30');`);
  try {
    const before = JSON.stringify(sqlite.prepare("select * from form_responses order by form_response_id").all());
    const compiled = new PgDialect().sqlToQuery(siteFormTotalsSql());
    assert.match(compiled.sql, /^select /);
    const runQuery = (query: ReturnType<typeof siteFormTotalsSql>) => {
      const compiledQuery = new PgDialect().sqlToQuery(query);
      return sqlite.prepare(compiledQuery.sql.replace(/::integer/g, "").replace(/\$\d+/g, "?"))
        .all(...compiledQuery.params) as any[];
    };
    const rows = runQuery(siteFormTotalsSql());
    const result = assembleSiteFormTotals(rows, new Date("2026-10-30T10:00:00Z"));
    assert.deepEqual(result, { generated_at: "2026-10-30T10:00:00.000Z", sites: [
      { site_id: 1, site_name: "Bareilly", total: 1, forms_by_code: { HHQ: 1 } },
      { site_id: 2, site_name: "Ballabhgarh", total: 3, forms_by_code: { NEW_FORM: 1, PEF: 1, WQ: 1 } },
      { site_id: 9, site_name: "New site", total: 0, forms_by_code: {} },
    ] });
    assert.equal(JSON.stringify(sqlite.prepare("select * from form_responses order by form_response_id").all()), before);

    const route = (dashboardRouter as any).stack.find((layer: any) => layer.route?.path === "/site-form-totals").route;
    const originalExecute = db.execute;
    (db as any).execute = async (query: any) => {
      return { rows: runQuery(query) };
    };
    try {
      let body: any;
      const response = { status() { return this; }, json(value: any) { body = value; } };
      await route.stack.at(-1).handle({ user: { role: "central_admin" } }, response);
      assert.deepEqual(body.data.sites, result.sites);
      for (const siteId of [1, 2, 9]) {
        await route.stack.at(-1).handle({ user: { role: "site_data_manager", site_id: siteId }, query: { site_id: 1 } }, response);
        assert.deepEqual(body.data.sites, result.sites.filter((site) => site.site_id === siteId));
      }
      for (const siteId of [null, undefined, 0, -1]) {
        await route.stack.at(-1).handle({ user: { role: "site_data_manager", site_id: siteId } }, response);
        assert.equal(body.error.code, "FORBIDDEN");
      }
    } finally {
      db.execute = originalExecute;
    }
  } finally {
    sqlite.close();
  }
});

test("site totals route requires authentication, an allowed manager role and aggregate-data capability", async () => {
  const route = (dashboardRouter as any).stack.find((layer: any) => layer.route?.path === "/site-form-totals").route;
  assert.ok(route.methods.get);
  const response = () => {
    const result = { status: 0, body: null as any };
    return { result, status(code: number) { result.status = code; return this; }, json(value: any) { result.body = value; } };
  };
  const unauthenticated = response();
  route.stack[0].handle({ headers: {} }, unauthenticated, () => assert.fail("Anonymous request passed authentication"));
  assert.equal(unauthenticated.result.status, 401);
  for (const role of ["site_research_scientist", "central_data_manager", "field_worker"]) {
    const denied = response();
    route.stack[1].handle({ user: { role } }, denied, () => assert.fail(`${role} passed central-only guard`));
    assert.equal(denied.result.status, 403);
  }
  for (const role of ["central_admin", "site_data_manager"]) {
    let permitted = false;
    route.stack[1].handle({ user: { role } }, response(), () => { permitted = true; });
    assert.equal(permitted, true);
  }
  const deniedCapability = response();
  await new Promise<void>((resolve) => {
    route.stack[2].handle({ user: { role: "central_admin" }, dataAccessProfile: { can_access_aggregate_dashboards: false } }, {
      status(code: number) { deniedCapability.result.status = code; return this; },
      json(value: any) { deniedCapability.result.body = value; resolve(); },
    }, () => assert.fail("Missing aggregate-data permission passed the guard"));
  });
  assert.equal(deniedCapability.result.status, 403);
  assert.equal(deniedCapability.result.body.error.code, "INSUFFICIENT_DATA_ACCESS");
});
