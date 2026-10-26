import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

test("BHQ exports stored GPS coordinates without changing answers, scope or other forms", async () => {
  let formCode = "HHQ";
  const formJson = { pages: [{ elements: [
    { type: "text", name: "head_name" },
    { type: "text", name: "hhq_contact_mobile" },
  ] }] };
  const responses = [
    { form_response_id: "with-gps", household_id: "2-10-0001-01", submitted_by_user_id: "worker", answers_json: {
      head_name: "Head", hhq_gps_latitude: 0, hhq_gps_longitude: 77.123456,
      hhq_contact_mobile_numbers: [{ mobile_number: "9876543210" }],
    } },
    { form_response_id: "legacy", household_id: "2-10-0002-01", answers_json: { head_name: "Legacy" } },
  ];
  const originalAnswers = JSON.stringify(responses);
  const tables = {
    formResponses: { form_code: "form_code", created_at: "created_at" },
    users: { user_id: "user_id", username: "username", display_name: "display_name" },
  };
  let scopeCalls = 0;
  const capabilities: string[] = [];
  const modules: Record<string, unknown> = {
    express: { Router: require("express").Router },
    "drizzle-orm": {
      eq: (field: string, value: unknown) => ({ field, value }),
      and: (...conditions: unknown[]) => conditions,
      desc: (field: string) => field,
      inArray: (field: string, values: unknown[]) => ({ field, values }),
    },
    "../db": { schema: tables, db: {
      select() { return { from(table: unknown) { return { where(conditions: any) {
        if (table === tables.users) return Promise.resolve([{ user_id: "worker", username: "staff", display_name: "Field worker" }]);
        assert.equal(table, tables.formResponses);
        assert.deepEqual(JSON.parse(JSON.stringify(conditions)), [{ field: "form_code", value: formCode }, { site_id: 2 }]);
        return { orderBy: async () => responses };
      } }; } }; },
    } },
    "../lib/errors": { sendError: () => assert.fail("Export unexpectedly failed") },
    "../lib/pagination": {},
    "../lib/areaScope": { appendAreaScopeCondition: async (user: any, table: unknown, conditions: unknown[]) => {
      assert.equal(user.site_id, 2); assert.equal(table, tables.formResponses);
      scopeCalls++; conditions.push({ site_id: user.site_id });
    } },
    "../lib/dataAccess": { requireDataAccess: (capability: string) => {
      capabilities.push(capability); return (_req: unknown, _res: unknown, next: () => void) => next();
    } },
    "../lib/formLanguage": { getEffectiveFormJson: async (code: string, siteId: number) => {
      assert.equal(code, formCode); assert.equal(siteId, 2); return formJson;
    } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./form-responses.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  runInNewContext(compiled, { exports, console, require(name: string) {
    assert.ok(name in modules, `Unexpected dependency ${name}`); return modules[name];
  } });
  const route = exports.default.stack.find((layer: any) => layer.route?.path === "/export").route;
  assert.equal(route.stack.length, 2, "Raw-CRF access middleware remains registered before the handler");
  assert.ok(capabilities.includes("can_access_raw_crfs"));
  async function download() {
    let status = 0, body = "", headers: Record<string, string> = {};
    const res = {
      status(value: number) { status = value; return this; },
      set(value: Record<string, string>) { headers = value; return this; },
      send(value: string) { body = value; },
    };
    await route.stack.at(-1).handle({ query: { form_code: ` ${formCode.toLowerCase()} ` }, user: { site_id: 2 } }, res);
    assert.equal(status, 200);
    assert.equal(headers["Content-Type"], "text/csv; charset=utf-8");
    assert.ok(body.startsWith("\uFEFF"));
    const rows = body.slice(1).trimEnd().split("\r\n").map(row => row.split(","));
    return { names: rows[0], rows: rows.slice(1) };
  }
  const gps = await download();
  const latitude = gps.names.indexOf("hhq_gps_latitude"), longitude = gps.names.indexOf("hhq_gps_longitude");
  assert.ok(latitude >= 0 && longitude >= 0, "Client-injected GPS fields must be included even when absent from the raw definition");
  assert.equal(gps.rows[0][latitude], "0", "Zero latitude is a coordinate, not a missing answer");
  assert.equal(gps.rows[0][longitude], "77.123456");
  assert.equal(gps.rows[1][latitude], "", "Legacy rows without GPS stay blank");
  assert.equal(gps.rows[1][longitude], "");
  assert.equal(gps.rows[0][gps.names.indexOf("submitted_by_username")], "staff");
  assert.equal(gps.rows[0][gps.names.indexOf("hhq_contact_mobile")], "9876543210");
  formJson.pages[0].elements.push({ type: "text", name: "hhq_gps_latitude" }, { type: "text", name: "hhq_gps_longitude" });
  const deduplicated = await download();
  assert.equal(deduplicated.names.filter(key => key === "hhq_gps_latitude").length, 1);
  assert.equal(deduplicated.names.filter(key => key === "hhq_gps_longitude").length, 1);
  formJson.pages[0].elements.splice(2);
  formCode = "WQ";
  const other = await download();
  assert.deepEqual(other.names, gps.names.filter(key => !key.startsWith("hhq_gps_")), "Other form exports do not gain BHQ GPS columns");
  assert.equal(scopeCalls, 3);
  assert.equal(JSON.stringify(responses), originalAnswers, "Export never changes stored answers");
});
