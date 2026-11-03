import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { db, schema } from "../db";
import mastersRouter from "./masters";

test("household CSV preview normalizes structures before duplicate checks and import revalidates", async () => {
  const originalSelect = db.select;
  const originalTransaction = db.transaction;
  const originalMkdir = fs.mkdir;
  const originalWriteFile = fs.writeFile;
  const mappingIds = new Set(["2-10-0002-01"]);
  const householdIds = new Set(["2-10-0003-01"]);
  const writes: { table: unknown; rows: any[] }[] = [];
  const archives = new Map<string, string>();
  (db as any).select = () => ({ from: (table: unknown) => {
    const rows = table === schema.studySites ? [{ site_id: 2 }]
      : table === schema.studyLocalities ? [{ site_id: 2, locality_code: "10" }]
      : table === schema.mappingFrame ? [...mappingIds].map((household_id) => ({ household_id }))
      : table === schema.households ? [...householdIds].map((household_id) => ({ household_id })) : null;
    assert.ok(rows, "preview may read only site/locality masters and household identity sets");
    return Object.assign(Promise.resolve(rows), { where: async () => rows });
  } });
  (db as any).transaction = async (work: (tx: any) => Promise<unknown>) => work({
    insert: (table: unknown) => ({ values: (rows: any[]) => ({ onConflictDoNothing: async () => {
      assert.ok(table === schema.mappingFrame || table === schema.households);
      writes.push({ table, rows });
      // A concurrent insert of one ready household must be ignored by the real conflict path.
      return { rowCount: rows.length - (table === schema.mappingFrame ? 1 : 0) };
    } }) }),
  });
  (fs as any).mkdir = async () => undefined;
  (fs as any).writeFile = async (file: string, content: string) => { archives.set(String(file), content); };
  const csv = [
    "Study Site,Locality Code,Structure Map ID,Household Number,Address,Household Head Name",
    "2,10,1,1,Address,Head",
    "2,10,25,1,Address,Head",
    "2,10,0011a,1,Address,Head",
    "2,10,12345,1,Address,Head",
    "2,10,2,1,Address,Head",
    "2,10,3,1,Address,Head",
    "2,10,0001,1,Address,Head",
    "2,10,0011A,1,Address,Head",
    "2,10,1234567,1,Address,Head",
    "2,10,1.2,1,Address,Head",
    "2,99,4,1,Address,Head",
    "1,10,5,1,Address,Head",
  ].join("\n");
  const run = async (routePath: string, role = "central_admin", accountSite: number | null = 2, selectedSite = "2") => {
    const route = (mastersRouter as any).stack.find((layer: any) => layer.route?.path === routePath && layer.route.methods.post)?.route;
    assert.ok(route);
    let status = 0;
    let body: any;
    const response = { status(code: number) { status = code; return this; }, json(value: any) { body = value; } };
    await route.stack.at(-1).handle({ user: { role, site_id: accountSite }, body: { site_id: selectedSite },
      file: { originalname: "synthetic-households.csv", buffer: Buffer.from(csv) } }, response);
    return { status, body };
  };
  try {
    const preview = await run("/mapping-frame/import-csv/preview");
    assert.equal(preview.status, 200);
    const result = preview.body.data;
    assert.equal(result.total_rows, 12);
    assert.equal(result.ready, 4);
    assert.equal(result.duplicate, 2);
    assert.equal(result.invalid, 6);
    assert.deepEqual(result.rows.slice(0, 4).map((row: any) => [row.structure_map_id, row.household_id]), [
      ["0001", "2-10-0001-01"], ["0025", "2-10-0025-01"],
      ["0011A", "2-10-0011A-01"], ["12345", "2-10-12345-01"],
    ]);
    for (const index of [4, 5]) assert.deepEqual(result.rows[index].errors, ["Household ID already exists"]);
    for (const index of [6, 7]) assert.deepEqual(result.rows[index].errors, ["Duplicate household ID inside this CSV"]);
    assert.match(result.rows[8].errors.join(" "), /1-6 alphanumeric/);
    assert.match(result.rows[9].errors.join(" "), /1-6 alphanumeric/);
    assert.match(result.rows[10].errors.join(" "), /not configured/);
    assert.match(result.rows[11].errors.join(" "), /does not match selected site/);
    assert.equal(writes.length, 0, "preview never inserts households");
    assert.equal(archives.size, 0, "preview does not create upload archives");

    const managerPreview = await run("/mapping-frame/import-csv/preview", "site_data_manager");
    assert.equal(managerPreview.status, 200);
    assert.deepEqual(managerPreview.body, preview.body);
    for (const routePath of ["/mapping-frame/import-csv/preview", "/mapping-frame/import-csv"]) {
      for (const siteId of [1, null, 0]) {
        const denied = await run(routePath, "site_data_manager", siteId);
        assert.equal(denied.status, 403);
      }
      assert.equal((await run(routePath, "site_data_manager", 2, "1")).status, 403);
    }
    assert.equal(writes.length, 0, "foreign-site requests cannot import");
    assert.equal(archives.size, 0, "foreign-site requests cannot archive CSVs");

    mappingIds.add("2-10-0025-01");
    const imported = await run("/mapping-frame/import-csv", "site_data_manager");
    assert.equal(imported.status, 201);
    assert.equal(imported.body.data.inserted, 2);
    assert.equal(imported.body.data.skipped, 4, "fresh duplicate set plus insert race are skipped");
    assert.equal(imported.body.data.invalid, 6);
    assert.equal(writes.length, 2);
    for (const write of writes) {
      assert.deepEqual(write.rows.map((row) => row.household_id), ["2-10-0001-01", "2-10-0011A-01", "2-10-12345-01"]);
      assert.deepEqual(write.rows.map((row) => row.structure_map_id), ["0001", "0011A", "12345"]);
    }
    assert.equal(archives.size, 4);
    const matched = [...archives].find(([file]) => file.endsWith("matched.csv") && !file.endsWith("unmatched.csv"))?.[1];
    assert.ok(matched?.includes("2-10-0001-01"));
    assert.ok(!matched?.includes("2-10-0025-01"), "actual import regenerates validation rather than trusting preview");
  } finally {
    db.select = originalSelect;
    db.transaction = originalTransaction;
    fs.mkdir = originalMkdir;
    fs.writeFile = originalWriteFile;
  }
});

test("import permissions include site managers without granting master administration or cross-site archives", async () => {
  const routes = (mastersRouter as any).stack;
  const find = (path: string, method: string) => routes.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const result = () => ({ code: 0, body: null as any, file: "", status(code: number) { this.code = code; return this; }, json(body: any) { this.body = body; }, download(file: string) { this.file = file; } });
  for (const [path, method] of [["/mapping-frame/import-csv/preview", "post"], ["/mapping-frame/import-csv", "post"], ["/mapping-frame/import-uploads", "get"], ["/mapping-frame/import-uploads/:upload_id/:kind", "get"]]) {
    for (const role of ["central_admin", "site_data_manager", "field_worker", "site_research_scientist"]) {
      const response = result(); let allowed = false;
      find(path, method).stack[0].handle({ user: { role } }, response, () => { allowed = true; });
      assert.equal(allowed, ["central_admin", "site_data_manager"].includes(role));
      if (!allowed) assert.equal(response.code, 403);
    }
  }
  for (const [path, method] of [["/sites", "post"], ["/localities", "post"], ["/mapping-frame/:household_id", "delete"]]) {
    const response = result();
    find(path, method).stack[0].handle({ user: { role: "site_data_manager" } }, response, () => assert.fail("Master administration granted"));
    assert.equal(response.code, 403);
  }
  const original = { readdir: fs.readdir, readFile: fs.readFile, access: fs.access };
  const metadata = [{ upload_id: "own", site_id: 2, uploaded_at: "2026-11-03" }, { upload_id: "other", site_id: 1, uploaded_at: "2026-11-02" }];
  let fileReads = 0;
  (fs as any).readdir = async () => metadata.map((item) => ({ name: item.upload_id, isDirectory: () => true }));
  (fs as any).readFile = async (file: string) => {
    const item = metadata.find((item) => file.replace(/\\/g, "/").endsWith(`/${item.upload_id}/metadata.json`));
    if (!item) throw new Error("Missing metadata");
    return JSON.stringify(item);
  };
  (fs as any).access = async () => { fileReads++; };
  try {
    const list = find("/mapping-frame/import-uploads", "get").stack.at(-1).handle;
    const download = find("/mapping-frame/import-uploads/:upload_id/:kind", "get").stack.at(-1).handle;
    for (const siteId of [1, 2, null]) {
      const user = { role: "site_data_manager", site_id: siteId };
      const response = result(); await list({ user }, response);
      assert.deepEqual(response.body.data, metadata.filter((item) => item.site_id === siteId));
      for (const item of metadata) {
        for (const kind of ["original", "matched", "unmatched"]) {
          const response = result(); const before = fileReads;
          await download({ user, params: { upload_id: item.upload_id, kind } }, response);
          if (item.site_id === siteId) assert.ok(response.file.endsWith(`${kind}.csv`));
          else { assert.equal(response.code, 403); assert.equal(fileReads, before, "Denied archive must not be downloaded"); }
        }
      }
    }
    const central = result(); await list({ user: { role: "central_admin" } }, central);
    assert.equal(central.body.data.length, 2);
  } finally { Object.assign(fs, original); }
});
