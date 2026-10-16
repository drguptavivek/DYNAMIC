/**
 * Offline cache for the Ballabgarh household/individual master registry.
 *
 * Registry replacement is intentionally all-or-nothing. The sync service
 * fetches every page before calling replaceBlbRegistry, and this module only
 * swaps the old cache after the complete replacement transaction succeeds.
 */
import { Platform } from "react-native";

import { getOfflineDatabase } from "../storage/offlineDatabase";
import {
  getRegistrySessionGeneration,
  withRegistryCacheLock,
} from "../storage/registryCacheLifecycle.js";

export const REGISTRY_STORAGE_KEY = "dynamic_blb_registry_v1";

function getWebStorage() {
  return Platform.OS === "web" && typeof window !== "undefined" ? window.localStorage : null;
}

function emptyRegistry() {
  return { households: [], individuals: [] };
}

function readWebRegistry() {
  const storage = getWebStorage();
  if (!storage) return emptyRegistry();
  const raw = storage.getItem(REGISTRY_STORAGE_KEY);
  if (!raw) return emptyRegistry();
  try {
    const parsed = JSON.parse(raw);
    return {
      households: Array.isArray(parsed.households) ? parsed.households : [],
      individuals: Array.isArray(parsed.individuals) ? parsed.individuals : [],
    };
  } catch {
    return emptyRegistry();
  }
}

function writeWebRegistry(registry) {
  const storage = getWebStorage();
  if (!storage) throw new Error("Browser storage is unavailable for the BLB registry cache");
  // Do not catch quota/security errors: the previous value remains in place
  // and sync must report the failed replacement rather than false success.
  storage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
}

function text(value) {
  return value === null || value === undefined ? null : String(value);
}

function requiredText(value, field) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`BLB registry row is missing ${field}`);
  return String(value);
}

function normalizeDomicile(value) {
  const raw = text(value);
  return raw === "" ? null : raw;
}

function mapDomicileToStatus(domicile) {
  const value = String(domicile || "").trim().toLowerCase();
  if (value === "dead" || value === "d") return "dead";
  if (value === "emigrated" || value === "e") return "emigrated";
  if (value === "resident" || value === "returned resident" || value === "visitor" || value === "r" || value === "rr" || value === "v") {
    return "alive";
  }
  return value || null;
}

function normalizeIndividual(individual) {
  const domicile = normalizeDomicile(individual?.domicile ?? individual?.status);
  return {
    uid: requiredText(individual?.uid, "uid"),
    village_code: text(individual?.village_code),
    village_name: text(individual?.village_name),
    phc_code: text(individual?.phc_code),
    phc_name: text(individual?.phc_name),
    hh_list_no: text(individual?.hh_list_no) || "",
    family_no: text(individual?.family_no) || "",
    ind_no: text(individual?.ind_no) || "",
    name: text(individual?.name) || "",
    age_years: individual?.age_years === null || individual?.age_years === undefined || individual?.age_years === ""
      ? null
      : Number(individual.age_years),
    sex: text(individual?.sex),
    status: mapDomicileToStatus(domicile),
    domicile,
    curr_status: text(individual?.curr_status),
    death_date: text(individual?.death_date),
    migrated_out_date: text(individual?.migrated_out_date),
    migration_reason: text(individual?.migration_reason),
    source_age_as_of: text(individual?.source_age_as_of),
  };
}

function normalizeHousehold(household) {
  return {
    ...household,
    hh_list_no: text(household?.hh_list_no) || "",
    family_no: text(household?.family_no) || "",
  };
}

function householdKey(hhListNo, familyNo) {
  return `${String(hhListNo ?? "").trim()}|${String(familyNo ?? "").trim()}`;
}

function individualKey(villageCode, hhListNo, familyNo, indNo) {
  return `${String(villageCode ?? "").trim()}|${householdKey(hhListNo, familyNo)}|${String(indNo ?? "").trim()}`;
}

function buildOriginalId(villageCode, hhListNo, familyNo, indNo) {
  return [villageCode, hhListNo, familyNo, indNo].map((value) => String(value ?? "").trim()).join("-");
}

function isAllowedVillage(villageCode, allowedVillageCodes) {
  if (!Array.isArray(allowedVillageCodes) || allowedVillageCodes.length === 0) return false;
  const allowed = new Set(allowedVillageCodes.map((value) => String(value).trim()));
  return allowed.has(String(villageCode ?? "").trim());
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function normalizePage(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(0, Math.floor(number)));
}

async function replaceBlbRegistryLocked({
  households,
  individuals,
  expectedGeneration,
  expectedScopeFingerprint = null,
  getCurrentScopeFingerprint = null,
}) {
  const nextHouseholds = (Array.isArray(households) ? households : []).map(normalizeHousehold);
  const nextIndividuals = (Array.isArray(individuals) ? individuals : []).map(normalizeIndividual);
  const now = new Date().toISOString();

  if (expectedGeneration !== getRegistrySessionGeneration()) {
    throw new Error("BLB registry session changed before cache replacement");
  }
  if (expectedScopeFingerprint !== null && typeof getCurrentScopeFingerprint === "function"
    && getCurrentScopeFingerprint() !== expectedScopeFingerprint) {
    throw new Error("BLB registry assignment scope changed before cache replacement");
  }

  if (Platform.OS !== "web") {
    const db = getOfflineDatabase();
    await db.execAsync("BEGIN TRANSACTION");
    try {
      if (expectedGeneration !== getRegistrySessionGeneration()) {
        throw new Error("BLB registry session changed during cache replacement");
      }
      if (expectedScopeFingerprint !== null && typeof getCurrentScopeFingerprint === "function"
        && getCurrentScopeFingerprint() !== expectedScopeFingerprint) {
        throw new Error("BLB registry assignment scope changed during cache replacement");
      }
      await db.runAsync("DELETE FROM blb_registry_households");
      await db.runAsync("DELETE FROM blb_registry_individuals");
      for (const household of nextHouseholds) {
        await db.runAsync(
          `INSERT INTO blb_registry_households
             (hh_list_no, family_no, head_name, address, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [household.hh_list_no, household.family_no, household.head_name || null, household.address || null, household.updated_at || now],
        );
      }
      for (const individual of nextIndividuals) {
        await db.runAsync(
          `INSERT INTO blb_registry_individuals
             (uid, village_code, village_name, phc_code, phc_name,
              hh_list_no, family_no, ind_no, name, age_years, sex, status,
              domicile, curr_status, death_date, migrated_out_date,
              migration_reason, source_age_as_of)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [individual.uid, individual.village_code, individual.village_name, individual.phc_code,
            individual.phc_name, individual.hh_list_no, individual.family_no, individual.ind_no,
            individual.name, individual.age_years, individual.sex, individual.status,
            individual.domicile, individual.curr_status, individual.death_date,
            individual.migrated_out_date, individual.migration_reason, individual.source_age_as_of],
        );
      }
      if (expectedGeneration !== getRegistrySessionGeneration()) {
        throw new Error("BLB registry session changed before cache commit");
      }
      if (expectedScopeFingerprint !== null && typeof getCurrentScopeFingerprint === "function"
        && getCurrentScopeFingerprint() !== expectedScopeFingerprint) {
        throw new Error("BLB registry assignment scope changed before cache commit");
      }
      await db.execAsync("COMMIT");
    } catch (error) {
      try { await db.execAsync("ROLLBACK"); } catch { /* retain original error */ }
      throw error;
    }
    if (expectedGeneration !== getRegistrySessionGeneration()) {
      throw new Error("BLB registry session changed after cache commit");
    }
    return { households: nextHouseholds.length, individuals: nextIndividuals.length };
  }

  // setItem is one atomic browser-cache replacement. A quota/security error
  // propagates and leaves the old JSON untouched.
  writeWebRegistry({ households: nextHouseholds, individuals: nextIndividuals });
  if (expectedGeneration !== getRegistrySessionGeneration()) {
    throw new Error("BLB registry session changed after cache replacement");
  }
  return { households: nextHouseholds.length, individuals: nextIndividuals.length };
}

export async function replaceBlbRegistry({
  households,
  individuals,
  expectedGeneration = getRegistrySessionGeneration(),
  expectedScopeFingerprint = null,
  getCurrentScopeFingerprint = null,
}) {
  return withRegistryCacheLock(() => replaceBlbRegistryLocked({
    households,
    individuals,
    expectedGeneration,
    expectedScopeFingerprint,
    getCurrentScopeFingerprint,
  }));
}

export async function getBlbRegistryCounts() {
  if (Platform.OS !== "web") {
    const db = getOfflineDatabase();
    const households = await db.getFirstAsync("SELECT COUNT(*) AS count FROM blb_registry_households");
    const individuals = await db.getFirstAsync("SELECT COUNT(*) AS count FROM blb_registry_individuals");
    return { households: Number(households?.count || 0), individuals: Number(individuals?.count || 0) };
  }
  const registry = readWebRegistry();
  return { households: registry.households.length, individuals: registry.individuals.length };
}

/** Return every tuple match; callers must not select an arbitrary first row. */
export async function findBlbRegistryIndividuals(villageCode, hhListNo, familyNo, indNo, allowedVillageCodes = []) {
  if ([villageCode, hhListNo, familyNo, indNo].some((value) => !String(value ?? "").trim())) return [];
  if (!isAllowedVillage(villageCode, allowedVillageCodes)) return [];
  const values = [String(villageCode).trim(), String(hhListNo).trim(), String(familyNo).trim(), String(indNo).trim()];
  if (Platform.OS !== "web") {
    return getOfflineDatabase().getAllAsync(
      `SELECT * FROM blb_registry_individuals
       WHERE village_code = ? AND hh_list_no = ? AND family_no = ? AND ind_no = ?
       ORDER BY uid`, values,
    );
  }
  const key = individualKey(...values);
  return readWebRegistry().individuals.filter((individual) => individualKey(
    individual.village_code, individual.hh_list_no, individual.family_no, individual.ind_no,
  ) === key);
}

/** Return a tuple match only when it is unambiguous. */
export async function findBlbRegistryIndividual(villageCode, hhListNo, familyNo, indNo, allowedVillageCodes = []) {
  const matches = await findBlbRegistryIndividuals(villageCode, hhListNo, familyNo, indNo, allowedVillageCodes);
  return matches.length === 1 ? matches[0] : null;
}

export async function findBlbRegistryIndividualByUid(uid, allowedVillageCodes = []) {
  const value = String(uid ?? "").trim();
  if (!value) return null;
  if (!Array.isArray(allowedVillageCodes) || allowedVillageCodes.length === 0) return null;
  if (Platform.OS !== "web") {
    const rows = await getOfflineDatabase().getAllAsync(
      "SELECT * FROM blb_registry_individuals WHERE uid = ?", [value],
    );
    return (rows || []).find((row) => isAllowedVillage(row.village_code, allowedVillageCodes)) || null;
  }
  return readWebRegistry().individuals.find((individual) =>
    String(individual.uid ?? "").trim() === value && isAllowedVillage(individual.village_code, allowedVillageCodes),
  ) || null;
}

/**
 * Search the local HDSS cache for the BHQ member picker.
 * Village is mandatory; house is optional so a village-wide search can be
 * narrowed by name or the four-part original ID. Tuple duplicates remain rows.
 */
export async function searchBlbRegistryPeople({
  villageCode,
  houseNo = "",
  search = "",
  offset = 0,
  limit = 50,
} = {}, allowedVillageCodes = []) {
  const village = String(villageCode ?? "").trim();
  if (!village || !isAllowedVillage(village, allowedVillageCodes)) return [];
  const house = String(houseNo ?? "").trim();
  const normalizedSearch = normalizeSearchValue(search);
  const pageOffset = normalizePage(offset, 0);
  const pageLimit = normalizePage(limit, 50, 50) || 50;

  if (Platform.OS !== "web") {
    const values = [village];
    let sql = `SELECT * FROM blb_registry_individuals
      WHERE village_code = ?`;
    if (house) {
      sql += " AND trim(hh_list_no) = ?";
      values.push(house);
    }
    if (normalizedSearch) {
      const pattern = `%${escapeLikePattern(normalizedSearch)}%`;
      sql += ` AND (
        lower(COALESCE(name, '')) LIKE ? ESCAPE '\\'
        OR lower(trim(village_code) || '-' || trim(COALESCE(hh_list_no, '')) || '-' ||
          trim(COALESCE(family_no, '')) || '-' || trim(COALESCE(ind_no, ''))) LIKE ? ESCAPE '\\'
      )`;
      values.push(pattern, pattern);
    }
    sql += " ORDER BY family_no COLLATE BINARY, ind_no COLLATE BINARY, uid COLLATE BINARY LIMIT ? OFFSET ?";
    values.push(pageLimit, pageOffset);
    return getOfflineDatabase().getAllAsync(sql, values);
  }

  const rows = readWebRegistry().individuals
    .filter((individual) => String(individual.village_code ?? "").trim() === village)
    .filter((individual) => !house || String(individual.hh_list_no ?? "").trim() === house)
    .filter((individual) => {
      if (!normalizedSearch) return true;
      const originalId = buildOriginalId(
        individual.village_code,
        individual.hh_list_no,
        individual.family_no,
        individual.ind_no,
      );
      return normalizeSearchValue(individual.name).includes(normalizedSearch)
        || normalizeSearchValue(originalId).includes(normalizedSearch);
    })
    .sort((left, right) => {
      for (const field of ["family_no", "ind_no", "uid"]) {
        const a = String(left[field] ?? "");
        const b = String(right[field] ?? "");
        const comparison = a < b ? -1 : a > b ? 1 : 0;
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
  return rows.slice(pageOffset, pageOffset + pageLimit);
}
