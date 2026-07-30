import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test";

test("central admin can manage masters and mapping-frame records", async () => {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

  const { createApp } = await import("./app");
  const { db, schema } = await import("./db");
  const { adminUser, upsertDevSeed } = await import("./dev/dev-seed");

  await upsertDevSeed();

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const uniqueSuffix = randomInt(100000, 999999);
  const siteId = 1000000000 + uniqueSuffix;
  const localityCode = "01";
  const renamedLocalityCode = "02";

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    const login = await fetchData(`${baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: adminUser.username, password: adminUser.password }),
    });
    const authorization = `Bearer ${login.access_token}`;
    const siteCode = `T${uniqueSuffix}`;

    const site = await fetchData(`${baseUrl}/masters/sites`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        site_id: siteId,
        site_code: siteCode,
        site_name: "API Integration Site",
      }),
    });
    assert.equal(site.site_id, siteId);

    const updatedSite = await fetchData(`${baseUrl}/masters/sites/${siteId}`, {
      method: "PATCH",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        site_code: `${siteCode}U`,
        site_name: "Updated API Integration Site",
      }),
    });
    assert.equal(updatedSite.site_id, siteId);
    assert.equal(updatedSite.site_code, `${siteCode}U`);
    assert.equal(updatedSite.site_name, "Updated API Integration Site");

    const duplicateSite = await fetchJson(`${baseUrl}/masters/sites`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        site_id: siteId,
        site_code: siteCode,
        site_name: "Duplicate API Integration Site",
      }),
    });
    assert.equal(duplicateSite.status, 409);
    assert.equal(duplicateSite.body.error.code, "SITE_ID_EXISTS");

    const locality = await fetchData(`${baseUrl}/masters/localities`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        site_id: siteId,
        locality_code: localityCode,
        locality_name: "API Integration Locality",
        locality_type: "urban",
      }),
    });
    assert.equal(locality.locality_code, localityCode);

    const updatedLocality = await fetchData(
      `${baseUrl}/masters/localities/${siteId}/${encodeURIComponent(localityCode)}`,
      {
        method: "PATCH",
        headers: { Authorization: authorization },
        body: JSON.stringify({
          locality_code: renamedLocalityCode,
          locality_name: "Updated API Integration Locality",
          locality_type: "rural",
        }),
      },
    );
    assert.equal(updatedLocality.locality_code, renamedLocalityCode);
    assert.equal(updatedLocality.locality_name, "Updated API Integration Locality");
    assert.equal(updatedLocality.locality_type, "rural");

    const listedLocalities = await fetchData(
      `${baseUrl}/masters/localities?site_id=${siteId}`,
      { headers: { Authorization: authorization } },
    );
    assert.equal(listedLocalities.length, 1);
    assert.equal(listedLocalities[0].locality_code, renamedLocalityCode);

    const mappingRecord = {
      site_id: siteId,
      locality_code: renamedLocalityCode,
      structure_map_id: "0201",
      household_number: "01",
    };
    const householdId = `${siteId}-${renamedLocalityCode}-0201-01`;

    const mappingFrame = await fetchData(`${baseUrl}/masters/mapping-frame`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify(mappingRecord),
    });
    assert.equal(mappingFrame.household_id, householdId);
    assert.equal(mappingFrame.structure_id, `${siteId}-${renamedLocalityCode}-0201`);
    assert.equal(mappingFrame.mapping_status, "listed");
    assert.equal(mappingFrame.baseline_enrollment_status, "pending");

    const duplicateMappingFrame = await fetchJson(`${baseUrl}/masters/mapping-frame`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify(mappingRecord),
    });
    assert.equal(duplicateMappingFrame.status, 409);
    assert.equal(duplicateMappingFrame.body.error.code, "HOUSEHOLD_ID_EXISTS");

    const fetchedMappingFrame = await fetchData(
      `${baseUrl}/masters/mapping-frame/${encodeURIComponent(householdId)}`,
      { headers: { Authorization: authorization } },
    );
    assert.equal(fetchedMappingFrame.household_id, householdId);

    const patchedMappingFrame = await fetchData(
      `${baseUrl}/masters/mapping-frame/${encodeURIComponent(householdId)}`,
      {
        method: "PATCH",
        headers: { Authorization: authorization },
        body: JSON.stringify({
          mapping_status: "enrolled",
          baseline_enrollment_status: "completed",
        }),
      },
    );
    assert.equal(patchedMappingFrame.mapping_status, "enrolled");
    assert.equal(patchedMappingFrame.baseline_enrollment_status, "completed");

    const bulk = await fetchData(`${baseUrl}/masters/mapping-frame/bulk`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        records: [
          {
            site_id: siteId,
            locality_code: renamedLocalityCode,
            structure_map_id: "0202",
            household_number: "01",
          },
          {
            site_id: siteId,
            locality_code: renamedLocalityCode,
            structure_map_id: "0202",
            household_number: "02",
          },
        ],
      }),
    });
    assert.equal(bulk.inserted, 2);
    assert.equal(bulk.skipped, 0);

    const listedMappingFrame = await fetchData(
      `${baseUrl}/masters/mapping-frame?site_id=${siteId}&locality_code=${renamedLocalityCode}&per_page=10`,
      { headers: { Authorization: authorization } },
    );
    assert.equal(listedMappingFrame.length, 3);
    assert.ok(listedMappingFrame.some((entry: any) => entry.household_id === householdId));

    const importCsv = [
      [
        "Study Site",
        "Colony / Village Code",
        "Structure Serial No (same as on map) - Only Residential ones",
        "Address/ Location / description of structure",
        "Serial number of household in the structure",
        "Name of Head of Household",
        "Comments (if any)",
      ].join(","),
      [
        `${siteId}`,
        renamedLocalityCode,
        "303",
        "CSV imported address",
        "7",
        "CSV Head",
        "CSV comment",
      ].join(","),
    ].join("\n");

    const previewFormData = new FormData();
    previewFormData.append("site_id", String(siteId));
    previewFormData.append("file", new Blob([importCsv], { type: "text/csv" }), "mapping.csv");
    const preview = await fetchData(`${baseUrl}/masters/mapping-frame/import-csv/preview`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: previewFormData,
    });
    assert.equal(preview.ready, 1);
    assert.equal(preview.rows[0].household_id, `${siteId}-${renamedLocalityCode}-0303-07`);

    const importFormData = new FormData();
    importFormData.append("site_id", String(siteId));
    importFormData.append("file", new Blob([importCsv], { type: "text/csv" }), "mapping.csv");
    const imported = await fetchData(`${baseUrl}/masters/mapping-frame/import-csv`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: importFormData,
    });
    assert.equal(imported.inserted, 1);
    assert.equal(imported.invalid, 0);
    assert.ok(imported.upload.matched_csv_path.endsWith("matched.csv"));
    assert.ok(imported.upload.unmatched_csv_path.endsWith("unmatched.csv"));

    const importedHouseholds = await fetchData(`${baseUrl}/households?site_id=${siteId}`, {
      headers: { Authorization: authorization },
    });
    const importedHousehold = importedHouseholds.find(
      (entry: any) => entry.household_id === `${siteId}-${renamedLocalityCode}-0303-07`,
    );
    assert.ok(importedHousehold);
    assert.equal(importedHousehold.address, "CSV imported address");
    assert.equal(importedHousehold.household_head_name, "CSV Head");
    assert.equal(importedHousehold.household_characteristics.mapping_frame_comments, "CSV comment");
  } finally {
    await db.delete(schema.households).where(eq(schema.households.site_id, siteId));
    await db.delete(schema.mappingFrame).where(eq(schema.mappingFrame.site_id, siteId));
    await db.delete(schema.studyLocalities).where(eq(schema.studyLocalities.site_id, siteId));
    await db.delete(schema.studySites).where(eq(schema.studySites.site_id, siteId));
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

async function fetchData(url: string, options: RequestInit = {}) {
  const response = await fetchJson(url, options);

  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.data;
}

async function fetchJson(url: string, options: RequestInit = {}) {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await response.json(),
  };
}
