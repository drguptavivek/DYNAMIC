import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import express from "express";
import { db, schema } from "../db";
import syncRouter from "../routes/sync";

test("member batch pull intersects requested households with field-worker assignments", async () => {
  const originalSelect = db.select;
  const householdIds = ["2-02-0001-01", "2-02-0001-02", "2-02-0001-03"];
  let assignedIds: string[] = [];
  const dialect = new PgDialect();
  let memberQuery: ReturnType<PgDialect["sqlToQuery"]> | undefined;
  (db as any).select = () => ({ from: (table: unknown) => ({ where: async (condition: SQL) => {
    if (table === schema.fieldWorkerHouseholdAssignments) {
      return assignedIds.map((household_id) => ({ household_id }));
    }
    assert.equal(table, schema.householdMembers);
    memberQuery = dialect.sqlToQuery(condition);
    // Interpret the real SQL's IN predicates against synthetic member rows.
    if (/\bfalse\b/.test(memberQuery.sql)) return [];
    const allowedGroups = [...memberQuery.sql.matchAll(/\bin \(([^)]+)\)/g)].map((match) =>
      [...match[1].matchAll(/\$(\d+)/g)].map((parameter) => memberQuery!.params[Number(parameter[1]) - 1]));
    assert.ok(allowedGroups.length > 0);
    return householdIds.filter((id) => allowedGroups.every((group) => group.includes(id)))
      .map((household_id) => ({ household_id, member_number: "01" }));
  } }) });

  // User/session fixtures are synthetic; Express request parsing and the route handler are real.
  const route = (syncRouter as any).stack.find((layer: any) => layer.route?.path === "/pull/members").route;
  const app = express();
  app.use(express.json());
  app.post("/api/v1/sync/pull/members", (req, res, next) => {
    req.user = { sub: "worker-1", username: "worker", role: "field_worker", site_id: 2, type: "access" };
    route.stack.at(-1).handle(req, res, next);
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const pull = async (ids: string[]) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/sync/pull/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household_ids: ids }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).data.household_members;
  };
  try {
    assert.deepEqual(await pull(householdIds), []);
    assert.match(memberQuery!.sql, /\bfalse\b/);
    assignedIds = householdIds.slice(0, 2);
    assert.deepEqual((await pull(householdIds)).map((member: any) => member.household_id), assignedIds);
    assert.equal([...memberQuery!.sql.matchAll(/\bin \(/g)].length, 2);
    assert.deepEqual(memberQuery!.params, [...householdIds, ...assignedIds]);
    assert.deepEqual(await pull([householdIds[2]]), []);
    assert.deepEqual(await pull([]), []);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.select = originalSelect;
  }
});
