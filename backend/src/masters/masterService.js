import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDY_SITES,
  STUDY_VILLAGES,
} from "../../../shared/studyMasters.js";

const backendRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const defaultStorePath = join(backendRoot, "data", "studyMasters.json");

function getStorePath() {
  return process.env.DYNAMIC_MASTERS_FILE || defaultStorePath;
}

function seedMasters() {
  return {
    study_sites: STUDY_SITES,
    study_villages: STUDY_VILLAGES
  };
}

function readMasters() {
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    return seedMasters();
  }

  const data = JSON.parse(readFileSync(storePath, "utf8"));
  return {
    study_sites: Array.isArray(data.study_sites) ? data.study_sites : STUDY_SITES,
    study_villages: Array.isArray(data.study_villages) ? data.study_villages : STUDY_VILLAGES
  };
}

function writeMasters(masters) {
  const storePath = getStorePath();
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(`${storePath}.tmp`, `${JSON.stringify(masters, null, 2)}\n`);
  renameSync(`${storePath}.tmp`, storePath);
}

function normalizeSite(input, existing = {}) {
  return {
    site_id: Number(input.site_id ?? existing.site_id),
    site_code: String(input.site_code ?? existing.site_code ?? "").trim().toUpperCase(),
    site_name: String(input.site_name ?? existing.site_name ?? "").trim()
  };
}

function normalizeVillage(input, existing = {}) {
  return {
    site_id: Number(input.site_id ?? existing.site_id),
    village_code: String(input.village_code ?? existing.village_code ?? "").trim(),
    village_name: String(input.village_name ?? existing.village_name ?? "").trim(),
    village_type: String(input.village_type ?? existing.village_type ?? "village").trim()
  };
}

function validateSite(site) {
  if (!Number.isInteger(site.site_id) || site.site_id < 1) return "Site ID must be a positive integer.";
  if (!site.site_code) return "Site code is required.";
  if (!site.site_name) return "Site name is required.";
  return null;
}

function validateVillage(village) {
  if (!Number.isInteger(village.site_id) || village.site_id < 1) {
    return "Site ID must be a positive integer.";
  }
  if (!village.village_code) return "Village code is required.";
  if (!village.village_name) return "Village name is required.";
  if (!village.village_type) return "Village type is required.";
  return null;
}

export function listStudySites() {
  return readMasters().study_sites;
}

export function findStudySite(siteId) {
  return listStudySites().find((site) => Number(site.site_id) === Number(siteId));
}

export function listStudyVillagesForSite(siteId) {
  const villages = readMasters().study_villages;
  if (siteId === undefined || siteId === null || siteId === "") {
    return villages;
  }
  return villages.filter((village) => Number(village.site_id) === Number(siteId));
}

export function findStudyVillage(siteId, villageCode) {
  return readMasters().study_villages.find(
    (village) =>
      Number(village.site_id) === Number(siteId) &&
      String(village.village_code) === String(villageCode)
  );
}

export function saveStudySite(input) {
  const masters = readMasters();
  const site = normalizeSite(input);
  const validationError = validateSite(site);
  if (validationError) return { status: 400, error: validationError };

  if (masters.study_sites.some((existing) => Number(existing.site_id) === Number(site.site_id))) {
    return { status: 409, error: "Study site already exists." };
  }

  masters.study_sites = [...masters.study_sites, site].sort((a, b) => Number(a.site_id) - Number(b.site_id));
  writeMasters(masters);
  return { status: 201, data: site };
}

export function updateStudySite(siteId, input) {
  const masters = readMasters();
  const index = masters.study_sites.findIndex((site) => Number(site.site_id) === Number(siteId));
  if (index === -1) return { status: 404, error: "Study site not found" };

  const site = normalizeSite({ ...input, site_id: siteId }, masters.study_sites[index]);
  const validationError = validateSite(site);
  if (validationError) return { status: 400, error: validationError };

  masters.study_sites[index] = site;
  writeMasters(masters);
  return { status: 200, data: site };
}

export function deleteStudySite(siteId) {
  const masters = readMasters();
  const index = masters.study_sites.findIndex((site) => Number(site.site_id) === Number(siteId));
  if (index === -1) return { status: 404, error: "Study site not found" };

  const hasVillages = masters.study_villages.some((village) => Number(village.site_id) === Number(siteId));
  if (hasVillages) {
    return { status: 409, error: "Delete study villages for this site before deleting the site." };
  }

  const [deleted] = masters.study_sites.splice(index, 1);
  writeMasters(masters);
  return { status: 200, data: deleted };
}

export function saveStudyVillage(input) {
  const masters = readMasters();
  const village = normalizeVillage(input);
  const validationError = validateVillage(village);
  if (validationError) return { status: 400, error: validationError };
  if (!masters.study_sites.some((site) => Number(site.site_id) === Number(village.site_id))) {
    return { status: 400, error: "Study site must exist before adding a village." };
  }

  const exists = masters.study_villages.some(
    (existing) =>
      Number(existing.site_id) === Number(village.site_id) &&
      String(existing.village_code) === String(village.village_code)
  );
  if (exists) return { status: 409, error: "Study village already exists for this site." };

  masters.study_villages = [...masters.study_villages, village].sort(
    (a, b) => Number(a.site_id) - Number(b.site_id) || String(a.village_code).localeCompare(String(b.village_code))
  );
  writeMasters(masters);
  return { status: 201, data: village };
}

export function updateStudyVillage(siteId, villageCode, input) {
  const masters = readMasters();
  const index = masters.study_villages.findIndex(
    (village) =>
      Number(village.site_id) === Number(siteId) &&
      String(village.village_code) === String(villageCode)
  );
  if (index === -1) return { status: 404, error: "Study village not found" };

  const village = normalizeVillage({ ...input, site_id: siteId, village_code: villageCode }, masters.study_villages[index]);
  const validationError = validateVillage(village);
  if (validationError) return { status: 400, error: validationError };

  masters.study_villages[index] = village;
  writeMasters(masters);
  return { status: 200, data: village };
}

export function deleteStudyVillage(siteId, villageCode) {
  const masters = readMasters();
  const index = masters.study_villages.findIndex(
    (village) =>
      Number(village.site_id) === Number(siteId) &&
      String(village.village_code) === String(villageCode)
  );
  if (index === -1) return { status: 404, error: "Study village not found" };

  const [deleted] = masters.study_villages.splice(index, 1);
  writeMasters(masters);
  return { status: 200, data: deleted };
}
