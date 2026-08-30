import assert from "node:assert/strict";
import test from "node:test";
import {
  getAllFormMetadata,
  getFormJson,
  getFormVersionManifest,
  getLatestFormMetadata,
  getRequestedFormsWithJson,
} from "./formCatalog";

test("returns checksum and json URL for a bundled form", () => {
  const metadata = getLatestFormMetadata("hhq");

  assert.ok(metadata);
  assert.equal(metadata.form_code, "HHQ");
  assert.equal(metadata.version, "2026.05.09");
  assert.equal(metadata.file_name, "baseline_household_questionnaire_v2026.05.09.json");
  assert.match(metadata.checksum, /^[a-f0-9]{64}$/);
  assert.equal(metadata.json_url, "/api/v1/protocol/forms/HHQ");
});

test("lists all bundled form metadata with checksums", () => {
  const forms = getAllFormMetadata();

  assert.equal(forms.length, 12);
  assert.deepEqual(
    forms.map((form) => form.form_code),
    ["HHQ", "WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "PSF"],
  );
  assert.ok(forms.every((form) => /^[a-f0-9]{64}$/.test(form.checksum)));
});

test("returns slim form version manifest for sync pull", () => {
  const manifest = getFormVersionManifest();

  assert.equal(manifest.length, 12);
  assert.deepEqual(Object.keys(manifest[0]).sort(), ["checksum", "form_code", "version"]);
  assert.equal(manifest[0].form_code, "HHQ");
  assert.equal(manifest[0].version, "2026.05.09");
  assert.match(manifest[0].checksum, /^[a-f0-9]{64}$/);
});

test("returns full SurveyJS JSON for a bundled form", () => {
  const formJson = getFormJson("WQ");

  assert.ok(formJson);
  assert.equal(formJson.form_code, "WQ");
  assert.equal(formJson.version, "28 JULY 2026");
  assert.ok(Array.isArray(formJson.pages));
});

test("returns the Pregnancy Surveillance form converted from the workbook", () => {
  const formJson = getFormJson("PSF");

  assert.ok(formJson);
  assert.equal(formJson.form_code, "PSF");
  assert.equal(formJson.version, "28 JUNE 2026");
  assert.ok(Array.isArray(formJson.pages));
});

test("returns requested forms with JSON and skips unknown codes", () => {
  const forms = getRequestedFormsWithJson(["HHQ", "VA", "PEF"]);

  assert.deepEqual(
    forms.map((form) => form.form_code),
    ["HHQ", "PEF"],
  );
  assert.equal(forms[0].json.form_code, "HHQ");
  assert.equal(forms[1].json.form_code, "PEF");
});

test("returns null for an unknown form code", () => {
  assert.equal(getLatestFormMetadata("VA"), null);
});
