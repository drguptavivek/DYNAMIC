import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { and, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import router, { syncLogFilterConditions } from "./sync-logs";
import { db, schema } from "../db";

test("every sync filter matches stored rows, literal searches and inclusive IST dates", async (t) => {
  let DatabaseSync;
  try { ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite")); }
  catch { t.skip("Isolated SQLite check needs Node 22+"); return; }
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`create table users(user_id text,username text,display_name text);
    create table sync_logs(sync_log_id text,user_id text,device_id text,direction text,status text,started_at text);
    insert into users values('id-a','accountAlpha','Shown Name'),('id-b','other','Other');
    insert into sync_logs values
    ('before','id-a','Android-ABC','push','success','2026-11-01T18:29:59.999Z'),
    ('first','id-a','Android-ABC','push','success','2026-11-01T18:30:00.000Z'),
    ('last','id-a','Android-ABC','pull','partial_success','2026-11-02T18:29:59.999Z'),
    ('after','id-a','Android-ABC','push','failed','2026-11-02T18:30:00.000Z'),
    ('literal','id-b','Android-100%_x','pull','completed','2026-11-02T10:00:00.000Z');`);
  const match = (query: Record<string, unknown>) => {
    const conditions = syncLogFilterConditions(query);
    const compiled = new PgDialect().sqlToQuery(sql`select sync_log_id from sync_logs left join users on users.user_id=sync_logs.user_id ${conditions.length ? sql`where ${and(...conditions)}` : sql``} order by sync_log_id`);
    return sqlite.prepare(compiled.sql.replace(/\bilike\b/g, "like").replace(/\$\d+/g, "?"))
      .all(...compiled.params).map((row: any) => row.sync_log_id);
  };
  try {
    assert.deepEqual(match({ user_name: " ACCOUNTalpha " }), ["after", "before", "first", "last"]);
    assert.deepEqual(match({ user_name: "shown name", from: "2026-11-02", to: "2026-11-02" }), ["first", "last"]);
    assert.deepEqual(match({ device_id: " abc ", direction: "pull" }), ["last"]);
    assert.deepEqual(match({ device_id: "100%_" }), ["literal"]);
    assert.deepEqual(match({ user_id: "id-a", status: "partial_success" }), ["last"]);
    assert.deepEqual(match({ status: "success", from: "2026-11-02", to: "2026-11-02", direction: "push", user_name: "ALPHA", device_id: "android" }), ["first"]);
    assert.deepEqual(match({ status: "failed", to: "2026-11-02" }), []);
    assert.deepEqual(match({ status: "completed" }), ["literal"]);
    assert.deepEqual(match({ user_name: "nonexistent" }), []);
  } finally { sqlite.close(); }
});

test("sync filters reject malformed input before database queries", async () => {
  for (const query of [{ from: "2026-02-30" }, { to: "bad" }, { from: "2026-11-03", to: "2026-11-02" }, { direction: "invalid" }, { status: "unknown" }, { user_name: ["a", "b"] }]) {
    assert.throws(() => syncLogFilterConditions(query), /INVALID_SYNC_FILTER/);
  }
  const handler = (router as any).stack.find((layer: any) => layer.route?.path === "/").route.stack.at(-1).handle;
  let status = 0;
  await handler({ query: { from: "invalid" }, user: { role: "central_admin" } }, {
    status(value: number) { status = value; return this; }, json(value: any) { assert.equal(value.error.code, "INVALID_SYNC_FILTER"); },
  });
  assert.equal(status, 400);
});

test("list and count share filters and site restrictions before pagination", async () => {
  const original = db.select;
  const predicates: any[] = [];
  (db as any).select = (fields: any) => ({ from: (table: any) => {
    const builder: any = {
      leftJoin() { return this; },
      where(condition: any) {
        if (table === schema.userAreaAssignments) return Promise.resolve([]);
        if (table === schema.users) return Promise.resolve([{ user_id: "site-worker" }]);
        const compiled = new PgDialect().sqlToQuery(condition);
        predicates.push(compiled);
        if (fields.count) return Promise.resolve([{ count: 101 }]);
        return this;
      },
      orderBy(...order: any[]) { assert.equal(order.length, 2); return this; },
      limit(n: number) { assert.equal(n, 100); return this; },
      offset(n: number) { assert.equal(n, 100); return Promise.resolve([{ sync_log_id: "older-match" }]); },
    }; return builder;
  } });
  try {
    const handler = (router as any).stack.find((layer: any) => layer.route?.path === "/").route.stack.at(-1).handle;
    let body: any;
    await handler({ user: { role: "site_data_manager", sub: "manager", site_id: 2 }, query: { user_name: "Alpha", direction: "push", status: "success", from: "2026-11-02", to: "2026-11-02", page: "2", per_page: "100" } }, {
      status() { return this; }, json(value: any) { body = value; },
    });
    assert.deepEqual(predicates[0], predicates[1]);
    assert.ok(predicates[0].params.includes("site-worker"));
    assert.ok(predicates[0].params.includes("%Alpha%"));
    assert.ok(predicates[0].params.includes("push"));
    assert.deepEqual(body.meta, { total: 101, page: 2, per_page: 100 });
    assert.equal(body.data[0].sync_log_id, "older-match");
  } finally { db.select = original; }
});
