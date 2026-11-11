import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { exportDateCondition } from "./form-responses";
import { schema } from "../db";

test("export date is optional and rejects malformed, nonscalar and impossible dates", () => {
  assert.equal(exportDateCondition(undefined), undefined);
  for (const value of ["", "2026-02-30", "2025-02-29", "0000-01-01", "11-11-2026", "2026-11-11T00:00:00Z", " 2026-11-11 ", ["2026-11-11"], {}, 20261111, null]) {
    assert.throws(() => exportDateCondition(value), /INVALID_EXPORT_DATE/);
  }
  assert.ok(exportDateCondition("2024-02-29"));
});

test("date-wise exports use inclusive IST start and exclusive next midnight, preserving form/user/site filters", t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite")); }
  catch { t.skip("Isolated SQLite date check requires Node 22+"); return; }
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`create table form_responses(form_response_id text,form_code text,site_id integer,submitted_by_user_id text,created_offline_at text,synced_at text,created_at text);
    insert into form_responses values
    ('before','HHQ',2,'worker','2026-11-10T18:29:59.999Z','2026-11-12T00:00:00.000Z',null),
    ('first','HHQ',2,'worker','2026-11-10T18:30:00.000Z','2026-11-12T00:00:00.000Z',null),
    ('last','HHQ',2,'worker','2026-11-11T18:29:59.999Z',null,null),
    ('after','HHQ',2,'worker','2026-11-11T18:30:00.000Z',null,null),
    ('sync-fallback','HHQ',2,'worker',null,'2026-11-11T04:00:00.000Z',null),
    ('created-fallback','HHQ',2,'worker',null,null,'2026-11-11T04:00:00.000Z'),
    ('other-site','HHQ',3,'worker','2026-11-11T04:00:00.000Z',null,null),
    ('other-user','HHQ',2,'other','2026-11-11T04:00:00.000Z',null,null),
    ('other-form','WQ',2,'worker','2026-11-11T04:00:00.000Z',null,null);`);
  const match = (date?: string, code = "HHQ") => {
    const compiled = new PgDialect().sqlToQuery(sql`select form_response_id from ${schema.formResponses} where ${and(eq(schema.formResponses.form_code,code),eq(schema.formResponses.site_id,2),eq(schema.formResponses.submitted_by_user_id,"worker"),exportDateCondition(date))} order by form_response_id`);
    const query = compiled.sql.replace(/::timestamptz/g, "").replace(/\$\d+/g, "?");
    return sqlite.prepare(query).all(...compiled.params).map((row: any) => row.form_response_id);
  };
  try {
    assert.deepEqual(match("2026-11-11"), ["created-fallback", "first", "last", "sync-fallback"]);
    assert.deepEqual(match(), ["after", "before", "created-fallback", "first", "last", "sync-fallback"]);
    assert.deepEqual(match("2026-11-11", "WQ"), ["other-form"]);
  } finally { sqlite.close(); }
});
