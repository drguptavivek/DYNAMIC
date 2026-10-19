import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { getPagination } from "../lib/pagination";
import { sendError, sendSuccess } from "../lib/errors";

const source = ts.transpileModule(
  readFileSync(new URL("./pregnant-women.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Execute the real route with real Drizzle predicates, without opening a database.
async function list(query: Record<string, string>, includePii = true) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const paging: number[] = [];
  let handler: (req: unknown, res: unknown) => Promise<void>;
  const row = { member_name: "Anita", date_of_birth: "1995-01-01", household_id: "2-11-0010-01" };
  const db = {
    select(selection: Record<string, unknown>) {
      const builder = {
        from() { return builder; },
        leftJoin() { return builder; },
        where(condition: orm.SQL) {
          queries.push(new PgDialect().sqlToQuery(condition));
          return builder;
        },
        orderBy() { return builder; },
        limit(value: number) { paging.push(value); return builder; },
        offset(value: number) { paging.push(value); return builder; },
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(resolve("count" in selection ? [{ count: 3 }] : [row]));
        },
      };
      return builder;
    },
  };
  const modules: Record<string, unknown> = {
    express: { Router: () => ({ get(path: string, ...handlers: unknown[]) {
      if (path === "/") handler = handlers.at(-1) as typeof handler;
    } }) },
    "drizzle-orm": orm,
    "../db": { db, schema },
    "../middleware/auth": { requireAuth() {} },
    "../lib/errors": { sendError, sendSuccess },
    "../lib/pagination": { getPagination },
    "../lib/areaScope": { async appendAreaScopeCondition(_user: unknown, table: typeof schema.pregnancies, conditions: unknown[]) {
      conditions.push(orm.eq(table.site_id, 2));
    } },
    "../lib/dataAccess": {
      canAccessPii: async () => includePii,
      redactFields: (value: Record<string, unknown>, fields: string[]) =>
        Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fields.includes(key) ? null : entry])),
    },
  };
  runInNewContext(source, { exports: {}, require(name: string) {
    assert.ok(name in modules, `Unexpected dependency ${name}`);
    return modules[name];
  }, console });
  let body: any;
  const response = { status(code: number) { assert.equal(code, 200); return response; }, json(value: unknown) { body = value; } };
  await handler!({ query, user: {} }, response);
  return { queries, paging, body };
}

test("pregnant registry includes active and enrolled pregnancies with area scope and pagination", async () => {
  const result = await list({ page: "2", per_page: "2" });
  assert.equal(result.queries.length, 2);
  for (const query of result.queries) {
    assert.match(query.sql, /"pregnancy_status" in \(\$1, \$2\)/);
    assert.deepEqual(query.params, ["active", "enrolled", 2]);
    assert.match(query.sql, /"site_id" = \$3/);
  }
  assert.deepEqual(result.paging, [2, 2]);
  assert.deepEqual({ ...result.body.meta }, { total: 3, page: 2, per_page: 2 });
});

test("trimmed case-insensitive search covers household ID, woman ID and name in rows and count", async () => {
  const result = await list({ search: "  2-11-0010-01  ", locality_code: "11" });
  const searched = result.queries.filter((query) => query.sql.includes("ilike"));
  assert.equal(searched.length, 2);
  for (const query of searched) {
    assert.match(query.sql, /"woman_id" ilike/);
    assert.match(query.sql, /"household_id" ilike/);
    assert.match(query.sql, /"name" ilike/);
    assert.deepEqual(query.params, ["active", "enrolled", "11", 2, ...Array(3).fill("%2-11-0010-01%")]);
  }
});

test("whitespace-only search uses the unfiltered list and keeps PII redaction", async () => {
  const result = await list({ search: "   " }, false);
  assert.equal(result.queries.length, 2);
  assert.ok(result.queries.every((query) => !query.sql.includes("ilike")));
  assert.equal(result.body.data[0].member_name, null);
  assert.equal(result.body.data[0].date_of_birth, null);
  assert.equal(result.body.data[0].household_id, "2-11-0010-01");
});
