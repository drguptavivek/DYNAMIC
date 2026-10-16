import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import mastersRouter from "./masters";

test("HDSS first page counts its exact access scope once, without counting continuations or unchanged downloads", async () => {
  const originalSelect = db.select;
  const originalTransaction = db.transaction;
  const dialect = new PgDialect();
  let assigned = true;
  let countQueries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  let pageQueries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const rows = ["001", "002", "003"].map((uid) => ({ uid, village_code: "10", name: `Person ${uid}` }));
  // Area assignments and transaction results are synthetic; request parsing,
  // real scope SQL, cursor/version logic, and the route handler execute normally.
  (db as any).select = () => ({ from: (table: unknown) => ({ where: async () => {
    if (table === schema.fieldWorkerHouseholdAssignments) return [];
    assert.equal(table, schema.userAreaAssignments);
    return assigned ? [{ site_id: 2, locality_code: "02", active_from: null, active_to: null }] : [];
  } }) });
  (db as any).transaction = async (callback: (tx: any) => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "repeatable read" });
    const tx = { select: (selection?: { count?: SQL }) => ({ from: (table: unknown) => ({ where: (condition?: SQL) => {
      if (table === schema.blbRegistrySnapshot) {
        return { limit: async () => [{ generation: "snapshot-1" }] };
      }
      assert.equal(table, schema.blbRegistryIndividuals);
      const query = condition ? dialect.sqlToQuery(condition) : { sql: "", params: [] };
      const scopedRows = /\bfalse\b/.test(query.sql) ? [] : rows;
      if (selection?.count) {
        assert.match(dialect.sqlToQuery(selection.count).sql, /count\(\*\)/);
        countQueries.push(query);
        return Promise.resolve([{ count: scopedRows.length }]);
      }
      pageQueries.push(query);
      const cursorParameter = query.sql.match(/"uid" > \$(\d+)/);
      const after = cursorParameter ? String(query.params[Number(cursorParameter[1]) - 1]) : "";
      return { orderBy: () => ({ limit: async (limit: number) => scopedRows.filter((row) => row.uid > after).slice(0, limit) }) };
    } }) }) };
    return callback(tx);
  };

  const route = (mastersRouter as any).stack.find((layer: any) => layer.route?.path === "/blb-registry" && layer.route.methods.get).route;
  const app = express();
  app.get("/registry", (req, res, next) => {
    req.user = { sub: "worker-1", username: "worker", role: "field_worker", site_id: 2, type: "access" };
    route.stack.at(-1).handle(req, res, next);
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const pull = async (query: Record<string, string> = {}) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/registry?${new URLSearchParams({ limit: "1", ...query })}`);
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  try {
    const first = await pull();
    assert.equal(first.total_individuals, 3);
    assert.equal(first.individuals.length, 1);
    assert.ok(first.next_cursor);
    assert.equal(countQueries.length, 1);
    assert.deepEqual(countQueries[0], pageQueries[0], "count uses the whole page access scope, without a cursor");
    assert.ok(countQueries[0].params.includes("02"), "count retains assigned locality restrictions");
    assert.match(countQueries[0].sql, /"village_code"/);

    const next = await pull({ cursor: first.next_cursor });
    assert.equal(next.individuals[0].uid, "002");
    assert.equal("total_individuals" in next, false);
    assert.equal(countQueries.length, 1, "continuation performs no aggregate");
    assert.match(pageQueries[1].sql, /"uid" >/);

    const unchanged = await pull({ known_registry_version: first.registry_version });
    assert.equal(unchanged.not_modified, true);
    assert.deepEqual(unchanged.individuals, []);
    assert.equal("total_individuals" in unchanged, false);
    assert.equal(countQueries.length, 1);
    assert.equal(pageQueries.length, 2, "unchanged cache performs neither aggregate nor person query");

    assigned = false;
    countQueries = [];
    pageQueries = [];
    const empty = await pull();
    assert.equal(empty.total_individuals, 0);
    assert.deepEqual(empty.individuals, []);
    assert.equal(empty.next_cursor, null);
    assert.deepEqual(countQueries[0], pageQueries[0]);
    assert.match(countQueries[0].sql, /\bfalse\b/, "no assignment cannot expose the global registry count");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.select = originalSelect;
    db.transaction = originalTransaction;
  }
});
