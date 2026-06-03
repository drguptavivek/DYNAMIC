import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.js";
import {
  findStudySite,
  findStudyVillage,
  listStudySites,
  listStudyVillagesForSite
} from "../src/masters/masterService.js";

const tempDir = mkdtempSync(join(tmpdir(), "dynamic-masters-test-"));
process.env.DYNAMIC_MASTERS_FILE = join(tempDir, "studyMasters.json");
process.env.DYNAMIC_HOUSEHOLDS_FILE = join(tempDir, "households.json");

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("masters service", () => {
  it("lists the four current DYNAMIC study sites", () => {
    assert.deepEqual(
      listStudySites().map((site) => site.site_name),
      ["Bareilley", "Ballabgarh", "Belgavi", "Chennai"]
    );
  });

  it("lists Ballabgarh villages currently available in the prototype", () => {
    assert.deepEqual(
      listStudyVillagesForSite(2).map((village) => village.village_name),
      ["Sunped", "Sagarpur", "Pehladpur", "Deegh"]
    );
  });

  it("finds sites and villages by their stable ids", () => {
    assert.equal(findStudySite("2").site_code, "BLB");
    assert.equal(findStudyVillage("2", "204").village_name, "Sagarpur");
  });
});

describe("masters API", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("serves health status", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
  });

  it("serves the masters admin UI", async () => {
    const response = await fetch(`${baseUrl}/admin/masters`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Study Sites/);
    assert.match(html, /DYNAMIC Admin/);
    assert.match(html, /#home/);
    assert.match(html, /Home/);
    assert.match(html, /Households/);
    assert.match(html, /Pregnancies/);
    assert.match(html, /Children/);
    assert.match(html, /Masters/);
    assert.match(html, /Sites/);
    assert.ok(html.includes("Study Villages/Hamlets/Colonies"));
    assert.match(html, /Users/);
    assert.match(html, /src="\/src\/admin-ui\/main.js"/);
    const uiModule = readFileSync(new URL("../src/admin-ui/main.js", import.meta.url), "utf8");
    assert.match(uiModule, /Edit/);
    assert.match(uiModule, /Cancel/);
    assert.match(uiModule, /Delete/);
  });

  it("serves a backend index at the root path", async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.service, "dynamic-masters-backend");
    assert.deepEqual(body.endpoints, [
      "/health",
      "/admin/masters",
      "/api/households",
      "/api/households/:household_id/members",
      "/api/sync/households",
      "/api/masters/study-sites",
      "/api/masters/study-sites/:site_id",
      "/api/masters/study-sites/:site_id/villages",
      "/api/masters/study-villages?site_id=:site_id"
    ]);
  });

  it("serves study sites", async () => {
    const response = await fetch(`${baseUrl}/api/masters/study-sites`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 4);
  });

  it("serves site-scoped study villages", async () => {
    const response = await fetch(`${baseUrl}/api/masters/study-sites/2/villages`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(
      body.data.map((village) => village.village_code),
      ["101", "204", "309", "410"]
    );
  });

  it("saves and updates study sites", async () => {
    const createResponse = await fetch(`${baseUrl}/api/masters/study-sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: 5,
        site_code: "TST",
        site_name: "Test Site"
      })
    });
    assert.equal(createResponse.status, 201);

    const updateResponse = await fetch(`${baseUrl}/api/masters/study-sites/5`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_code: "TS2",
        site_name: "Updated Test Site"
      })
    });
    assert.equal(updateResponse.status, 200);

    const readResponse = await fetch(`${baseUrl}/api/masters/study-sites/5`);
    assert.equal(readResponse.status, 200);
    const body = await readResponse.json();
    assert.equal(body.data.site_code, "TS2");
    assert.equal(body.data.site_name, "Updated Test Site");
  });

  it("saves and updates study villages", async () => {
    const createResponse = await fetch(`${baseUrl}/api/masters/study-villages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: 5,
        village_code: "501",
        village_name: "Test Village",
        village_type: "village"
      })
    });
    assert.equal(createResponse.status, 201);

    const updateResponse = await fetch(`${baseUrl}/api/masters/study-sites/5/villages/501`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        village_name: "Updated Test Village",
        village_type: "colony"
      })
    });
    assert.equal(updateResponse.status, 200);

    const readResponse = await fetch(`${baseUrl}/api/masters/study-sites/5/villages`);
    assert.equal(readResponse.status, 200);
    const body = await readResponse.json();
    assert.equal(body.data[0].village_name, "Updated Test Village");
    assert.equal(body.data[0].village_type, "colony");
  });

  it("deletes study villages and study sites", async () => {
    const villageDeleteResponse = await fetch(`${baseUrl}/api/masters/study-sites/5/villages/501`, {
      method: "DELETE"
    });
    assert.equal(villageDeleteResponse.status, 200);

    const villageReadResponse = await fetch(`${baseUrl}/api/masters/study-sites/5/villages/501`);
    assert.equal(villageReadResponse.status, 404);

    const siteDeleteResponse = await fetch(`${baseUrl}/api/masters/study-sites/5`, {
      method: "DELETE"
    });
    assert.equal(siteDeleteResponse.status, 200);

    const siteReadResponse = await fetch(`${baseUrl}/api/masters/study-sites/5`);
    assert.equal(siteReadResponse.status, 404);
  });

  it("returns 404 for unknown masters", async () => {
    const response = await fetch(`${baseUrl}/api/masters/study-sites/99`);
    assert.equal(response.status, 404);
  });

  it("syncs household records from the Expo app and lists them", async () => {
    const household = {
      household_id: "4-101-0007-01",
      site_id: 4,
      locality_code: "101",
      locality_name: "Aypakkam",
      structure_number: "0007",
      household_number: "01",
      address: "Test street",
      household_head_name: "Test Head",
      consent_status: "Yes",
      interview_date: "2026-09-01",
      result_interview: 1,
      language_questionnaire: 1,
      mobile_number: "9999999999",
      sync_status: "local",
      updated_at: "2026-09-01T00:00:00.000Z",
      members: [
        {
          individual_id: "4-101-0007-01-01",
          household_id: "4-101-0007-01",
          line_number: 1,
          member_name: "Test Head",
          age_years: 35
        }
      ],
      raw_hhq_json: { hhq_site_id: 4 }
    };

    const syncResponse = await fetch(`${baseUrl}/api/sync/households`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ households: [household] })
    });
    assert.equal(syncResponse.status, 200);
    const syncBody = await syncResponse.json();
    assert.equal(syncBody.data.synced_households, 1);
    assert.equal(syncBody.data.synced_members, 1);

    const listResponse = await fetch(`${baseUrl}/api/households`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.equal(listBody.data[0].household_id, "4-101-0007-01");
    assert.equal(listBody.data[0].household_head_name, "Test Head");

    const memberResponse = await fetch(`${baseUrl}/api/households/4-101-0007-01/members`);
    assert.equal(memberResponse.status, 200);
    const memberBody = await memberResponse.json();
    assert.equal(memberBody.data[0].individual_id, "4-101-0007-01-01");
  });
});
