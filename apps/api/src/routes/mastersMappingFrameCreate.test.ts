import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import router from "./masters";

test("single household creation validates scope, normalizes IDs and atomically preserves duplicates", async () => {
  const original = { select: db.select, transaction: db.transaction };
  const dialect = new PgDialect();
  let mapping: any[] = [], households: any[] = [];
  let failHousehold: any, transactionCount = 0;
  const tables = (table: unknown) => table === schema.mappingFrame ? mapping : table === schema.households ? households
    : table === schema.studySites ? [{ site_id: 2 }, { site_id: 3 }]
    : table === schema.studyLocalities ? [{ site_id: 2, locality_code: "10" }, { site_id: 3, locality_code: "11" }]
    : table === schema.userAreaAssignments ? [{ user_id: "manager", site_id: 2, locality_code: "10", active_from: null, active_to: null }] : assert.fail("Unexpected read");
  const select: any = () => ({ from(table: unknown) { return { where(condition: any) {
    const query = dialect.sqlToQuery(condition);
    const result = tables(table).filter(row => [...query.sql.matchAll(/"[^"]+"\."([^"]+)" (=|ilike) \$(\d+)/g)].every(match => match[2] === "ilike" ? String(row[match[1]]).toLowerCase() === String(query.params[Number(match[3]) - 1]).toLowerCase() : row[match[1]] === query.params[Number(match[3]) - 1]));
    return Object.assign(Promise.resolve(result), { limit: async () => result.slice(0, 1) });
  } }; } });
  (db as any).select = select;
  (db as any).transaction = async (work: any) => {
    transactionCount++;
    const before = structuredClone({ mapping, households });
    try { return await work({ select, insert(table: unknown) { return { values: async (row: any) => {
      assert.ok(table === schema.mappingFrame || table === schema.households, "No tasks, users or assignments may be written");
      if (table === schema.households && failHousehold) throw failHousehold;
      (table === schema.mappingFrame ? mapping : households).push(structuredClone(row));
    } }; } }); }
    catch (error) { mapping = before.mapping; households = before.households; throw error; }
  };
  const route = (router as any).stack.find((layer: any) => layer.route?.path === "/mapping-frame" && layer.route.methods.post).route;
  const initial = { site_id: 2, locality_code: "10", structure_map_id: " 25 ", household_number: " 1 ", address: " Address ", household_head_name: " Head ", comments: " Note " };
  const availabilityRoute = (router as any).stack.find((layer: any) => layer.route?.path === "/mapping-frame/availability").route;
  assert.ok((router as any).stack.findIndex((layer: any) => layer.route === availabilityRoute) <
    (router as any).stack.findIndex((layer: any) => layer.route?.path === "/mapping-frame/:household_id" && layer.route.methods.get), "Static availability route must precede household lookup");
  async function availability(query: any = { site_id: "2", locality_code: "10", structure_map_id: "25", household_number: "1" }, role = "central_admin", site_id: number | null = 2) {
    let status = 0, output: any, permitted = false;
    const req = { user: { sub: "manager", role, site_id }, query };
    const res = { status(value: number) { status = value; return this; }, json(value: any) { output = value; } };
    availabilityRoute.stack[0].handle(req, res, () => { permitted = true; });
    if (permitted) await availabilityRoute.stack.at(-1).handle(req, res);
    return { status, output };
  }

  async function create(body: any = initial, role = "central_admin", site_id: number | null = 2) {
    let status = 0, output: any, permitted = false;
    const req = { user: { sub: "manager", role, site_id }, body };
    const res = { status(value: number) { status = value; return this; }, json(value: any) { output = value; } };
    route.stack[0].handle(req, res, () => { permitted = true; });
    if (permitted) await route.stack.at(-1).handle(req, res);
    return { status, output };
  }
  try {
    for (const role of ["field_worker", "field_supervisor", "site_investigator", "central_data_manager", "us_collaborator"]) assert.equal((await create(initial, role)).status, 403, role);
    assert.equal(transactionCount, 0);
    for (const role of ["site_data_manager", "site_research_scientist"]) assert.equal((await create({ ...initial, site_id: 3 }, role)).status, 403);
    assert.equal((await create({ ...initial, locality_code: "11" }, "site_data_manager")).status, 403);
    assert.equal((await create(initial, "site_data_manager", null)).status, 403);
    assert.equal((await create({ ...initial, site_id: 99 })).status, 400);
    assert.equal((await create({ ...initial, locality_code: "11" })).status, 400, "Locality must belong to selected site");
    for (const patch of [{ structure_map_id: "1.2" }, { structure_map_id: "1234567" }, { household_number: "1A" }, { locality_code: "100" }, { household_number: "100" }, { household_head_name: 12 }]) assert.equal((await create({ ...initial, ...patch })).status, 400);
    assert.equal(transactionCount, 0);
    const availabilityIdentity = { site_id: "2", locality_code: "10", structure_map_id: " 25 ", household_number: " 1 " };
    const emptyCheck = await availability(availabilityIdentity, "site_data_manager");
    assert.equal(emptyCheck.status, 200); assert.deepEqual(emptyCheck.output.data, { household_id: "2-10-0025-01", exists: false });
    assert.equal(transactionCount, 0, "Checking availability never starts a write transaction");
    for (const role of ["field_worker", "field_supervisor", "site_investigator", "central_data_manager", "us_collaborator"]) assert.equal((await availability(availabilityIdentity, role)).status, 403);
    for (const role of ["site_data_manager", "site_research_scientist"]) assert.equal((await availability({ ...availabilityIdentity, site_id: "3" }, role)).status, 403);
    assert.equal((await availability({ ...availabilityIdentity, locality_code: "11" }, "site_data_manager")).status, 403);
    assert.equal((await availability(availabilityIdentity, "site_data_manager", null)).status, 403);
    for (const patch of [{ site_id: ["2", "3"] }, { site_id: "2x" }, { site_id: "0" }, { site_id: "99" }, { locality_code: "11" }, { locality_code: ["10"] }, { structure_map_id: "1.2" }, { household_number: "1A" }]) assert.equal((await availability({ ...availabilityIdentity, ...patch })).status, 400);
    assert.equal(mapping.length, 0); assert.equal(households.length, 0);
    const result = await create(initial, "site_data_manager");
    assert.equal(result.status, 201);
    assert.equal(result.output.data.household_id, "2-10-0025-01");
    assert.equal(result.output.data.structure_id, "2-10-0025");
    assert.equal(result.output.data.household_head_name, "Head");
    assert.equal(result.output.data.consent_status, null); assert.equal(result.output.data.can_delete, false);
    assert.equal(mapping.length, 1); assert.equal(households.length, 1);
    assert.equal(households[0].address, "Address");
    assert.deepEqual(households[0].household_characteristics, { mapping_frame_comments: "Note", mapping_frame_source: "manual_entry" });
    assert.equal(households[0].baseline_enrollment_status, "pending"); assert.equal(households[0].cohort_status, "listed");
    assert.equal(households[0].sync_status, "synced"); assert.equal(households[0].consent_status, undefined);
    const saved = structuredClone({ mapping, households });
    assert.deepEqual((await availability()).output.data, { household_id: "2-10-0025-01", exists: true });
    assert.deepEqual({ mapping, households }, saved, "Availability does not change existing household details");
    assert.equal((await create({ ...initial, structure_map_id: "0025", address: "Overwrite" })).status, 409);
    assert.deepEqual({ mapping, households }, saved);
    mapping = []; assert.equal((await availability()).output.data.exists, true, "Household-only duplicate is found"); assert.equal((await create()).status, 409, "Existing household alone blocks duplicate");
    mapping = saved.mapping; households = []; assert.equal((await availability()).output.data.exists, true, "Mapping-only duplicate is found"); assert.equal((await create()).status, 409, "Existing mapping alone blocks duplicate");
    mapping = []; households = [];
    const alpha = await create({ ...initial, structure_map_id: " 001a ", locality_code: "10", household_number: "02" }, "site_research_scientist");
    assert.equal(alpha.status, 201); assert.equal(alpha.output.data.household_id, "2-10-001A-02");
    mapping[0].household_id = "2-10-001a-02"; households[0].household_id = "2-10-001a-02";
    const alphaCheck = await availability({ ...availabilityIdentity, structure_map_id: "001a", household_number: "2" }, "site_research_scientist");
    assert.equal(alphaCheck.status, 200); assert.deepEqual(alphaCheck.output.data, { household_id: "2-10-001A-02", exists: true });
    assert.equal((await create({ ...initial, structure_map_id: "001A", household_number: "02" })).status, 409, "Legacy lowercase IDs cannot create a second household");
    assert.equal((await create({ ...initial, structure_map_id: "001B", household_number: "02" })).status, 201, "Different normalized household remains insertable");
    for (const failure of [new Error("Synthetic second insert failure"), { cause: { code: "23505" } }]) {
      mapping = []; households = []; failHousehold = failure;
      assert.equal((await create()).status, failure instanceof Error ? 500 : 409);
      assert.deepEqual(mapping, [], "First insert rolls back if household insertion fails"); assert.deepEqual(households, []);
    }
    failHousehold = null;
    const centralCreated = await create({ ...initial, site_id: 3, locality_code: "11", address: undefined, household_head_name: undefined, comments: undefined });
    assert.equal(centralCreated.status, 201); assert.equal(centralCreated.output.data.can_delete, true);
    assert.equal(centralCreated.output.data.consent_status, null);
    assert.equal(households[0].household_head_name, "");
  } finally { Object.assign(db, original); }
});
