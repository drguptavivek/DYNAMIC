/**
 * Offline cache for the Ballabgarh household/individual master registry.
 *
 * Download pages are saved to isolated staging tables. Readers retain the
 * previous complete cache until the final replacement transaction succeeds.
 */
import { Platform } from "react-native";

import { getOfflineDatabase } from "../storage/offlineDatabase";
import { getBlbRegistryVillageSearchScope } from "./blbRegistryScope.js";
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
  onProgress = null,
}) {
  const nextHouseholds = Array.isArray(households) ? households : [];
  const nextIndividuals = Array.isArray(individuals) ? individuals : [];
  const now = new Date().toISOString();
  const total = nextHouseholds.length + nextIndividuals.length;
  let processed = 0;
  let lastReported = 0;
  const reportProgress = () => {
    if (typeof onProgress === "function" && (processed === total || processed - lastReported >= 1000)) {
      onProgress({ processed, total });
      lastReported = processed;
    }
  };

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
      // Bound each bridge call below SQLite's legacy 999-variable limit.
      const writeBatches = async (table, columns, rows, normalizeRow, valuesForRow) => {
        const batchSize = Math.floor(900 / columns.length);
        const placeholders = `(${columns.map(() => "?").join(", ")})`;
        for (let offset = 0; offset < rows.length; offset += batchSize) {
          if (expectedGeneration !== getRegistrySessionGeneration()) {
            throw new Error("BLB registry session changed during cache replacement");
          }
          if (expectedScopeFingerprint !== null && typeof getCurrentScopeFingerprint === "function"
            && getCurrentScopeFingerprint() !== expectedScopeFingerprint) {
            throw new Error("BLB registry assignment scope changed during cache replacement");
          }
          // Normalize only this batch so large caches do not create a second full object graph.
          const batch = rows.slice(offset, offset + batchSize).map(normalizeRow);
          await db.runAsync(
            `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${batch.map(() => placeholders).join(", ")}`,
            batch.flatMap(valuesForRow),
          );
          processed += batch.length;
          reportProgress();
        }
      };
      await writeBatches("blb_registry_households",
        ["hh_list_no", "family_no", "head_name", "address", "updated_at"], nextHouseholds, normalizeHousehold,
        (household) => [household.hh_list_no, household.family_no, household.head_name || null, household.address || null, household.updated_at || now]);
      const individualColumns = ["uid", "village_code", "village_name", "phc_code", "phc_name",
        "hh_list_no", "family_no", "ind_no", "name", "age_years", "sex", "status",
        "domicile", "curr_status", "death_date", "migrated_out_date", "migration_reason", "source_age_as_of"];
      await writeBatches("blb_registry_individuals", individualColumns, nextIndividuals, normalizeIndividual,
        (individual) => individualColumns.map((column) => individual[column]));
      if (total === 0) reportProgress();
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
  writeWebRegistry({ households: nextHouseholds.map(normalizeHousehold), individuals: nextIndividuals.map(normalizeIndividual) });
  if (expectedGeneration !== getRegistrySessionGeneration()) {
    throw new Error("BLB registry session changed after cache replacement");
  }
  processed = total;
  reportProgress();
  return { households: nextHouseholds.length, individuals: nextIndividuals.length };
}

export async function replaceBlbRegistry({
  households,
  individuals,
  expectedGeneration = getRegistrySessionGeneration(),
  expectedScopeFingerprint = null,
  getCurrentScopeFingerprint = null,
  onProgress = null,
}) {
  return withRegistryCacheLock(() => replaceBlbRegistryLocked({
    households,
    individuals,
    expectedGeneration,
    expectedScopeFingerprint,
    getCurrentScopeFingerprint,
    onProgress,
  }));
}

/** Save each downloaded page without exposing an incomplete registry to readers. */
export async function withBlbRegistryDownload({
  download,
  expectedGeneration = getRegistrySessionGeneration(),
  expectedScopeFingerprint = null,
  getCurrentScopeFingerprint = null,
  beforeCommit = null,
}) {
  return withRegistryCacheLock(async () => {
    const guard = () => {
      if (expectedGeneration !== getRegistrySessionGeneration()) {
        throw new Error("BLB registry session changed during download");
      }
      if (expectedScopeFingerprint !== null && typeof getCurrentScopeFingerprint === "function"
        && getCurrentScopeFingerprint() !== expectedScopeFingerprint) {
        throw new Error("BLB registry assignment scope changed during download");
      }
    };
    guard();
    if (Platform.OS === "web") {
      // Browser localStorage has no staging transaction; retain its atomic single-value replacement.
      let next = null;
      const result = await download(async (page) => {
        guard();
        next ||= emptyRegistry();
        next.households.push(...(Array.isArray(page?.households) ? page.households : []));
        next.individuals.push(...(Array.isArray(page?.individuals) ? page.individuals : []));
      });
      guard();
      if (!next) return result;
      if (typeof beforeCommit === "function") beforeCommit();
      guard();
      const counts = await replaceBlbRegistryLocked({ ...next, expectedGeneration,
        expectedScopeFingerprint, getCurrentScopeFingerprint });
      return { ...result, ...counts };
    }

    const db = getOfflineDatabase();
    const tables = ["blb_registry_households", "blb_registry_individuals"];
    const dropStages = tables.map((table) => `DROP TABLE IF EXISTS ${table}_download;`).join("\n");
    let started = false;
    let households = 0;
    let individuals = 0;
    const now = new Date().toISOString();
    const writeRows = async (table, columns, rows, normalizeRow, valuesForRow) => {
      for (let offset = 0; offset < rows.length; offset += 1000) {
        guard();
        const batch = rows.slice(offset, offset + 1000).map(normalizeRow).map(valuesForRow);
        // Each statement autocommits without enclosing concurrent form writes in our transaction.
        await db.runAsync(
          `INSERT INTO ${table}_download (${columns.join(", ")})
           SELECT ${columns.map((_, index) => `json_extract(value, '$[${index}]')`).join(", ")}
           FROM json_each(?)`,
          [JSON.stringify(batch)],
        );
        guard();
      }
    };
    try {
      const result = await download(async (page) => {
        guard();
        if (!started) {
          started = true;
          await db.execAsync(dropStages + tables.map((table) =>
            `CREATE TABLE ${table}_download AS SELECT * FROM ${table} WHERE 0;`).join("\n"));
          guard();
        }
        const pageHouseholds = Array.isArray(page?.households) ? page.households : [];
        const pageIndividuals = Array.isArray(page?.individuals) ? page.individuals : [];
        await writeRows(tables[0], ["hh_list_no", "family_no", "head_name", "address", "updated_at"],
          pageHouseholds, normalizeHousehold, (row) => [row.hh_list_no, row.family_no,
            row.head_name || null, row.address || null, row.updated_at || now]);
        const columns = ["uid", "village_code", "village_name", "phc_code", "phc_name", "hh_list_no",
          "family_no", "ind_no", "name", "age_years", "sex", "status", "domicile", "curr_status",
          "death_date", "migrated_out_date", "migration_reason", "source_age_as_of"];
        await writeRows(tables[1], columns, pageIndividuals, normalizeIndividual,
          (row) => columns.map((column) => row[column]));
        households += pageHouseholds.length;
        individuals += pageIndividuals.length;
      });
      guard();
      if (!started) return result;
      if (typeof beforeCommit === "function") beforeCommit();
      guard();
      // Keep the complete promotion in one native call without blocking the JavaScript thread.
      try {
        await db.execAsync(`BEGIN TRANSACTION;
          ${tables.map((table) => `DELETE FROM ${table}; INSERT INTO ${table} SELECT * FROM ${table}_download;`).join("\n")}
          ${dropStages}
          COMMIT;`);
      } catch (error) {
        try { await db.execAsync("ROLLBACK"); } catch { /* retain original error */ }
        throw error;
      }
      guard();
      return { ...result, households, individuals };
    } catch (error) {
      if (started) {
        try { await db.execAsync(dropStages); } catch { /* retain original error; logout also clears staging */ }
      }
      throw error;
    }
  });
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

/** Search within the exact permitted village, before applying result paging. */
export async function searchBlbRegistryPeople({
  villageCode,
  houseNo = "",
  search = "",
  offset = 0,
  limit = 50,
} = {}, allowedVillageCodes = []) {
  const villages = getBlbRegistryVillageSearchScope(villageCode, allowedVillageCodes);
  const house = String(houseNo ?? "").trim();
  const searchTerms = String(search ?? "").split(",").map(normalizeSearchValue).filter(Boolean);
  if (!villages.length || (!house && !searchTerms.length)) return [];
  const pageOffset = normalizePage(offset, 0);
  const pageLimit = normalizePage(limit, 50, 50) || 50;

  if (Platform.OS !== "web") {
    const values = [villages[0]];
    let scope = "trim(village_code) = ?";
    if (house) {
      scope += " AND trim(hh_list_no) = ?";
      values.push(house);
    }
    let sql;
    if (searchTerms.length > 1) {
      // Each name can belong to a different person, but all must share one complete household key.
      sql = `WITH matching_households AS (
        SELECT trim(village_code) AS village_code, trim(hh_list_no) AS hh_list_no,
          trim(family_no) AS family_no
        FROM blb_registry_individuals WHERE ${scope}
          AND trim(COALESCE(hh_list_no, '')) <> '' AND trim(COALESCE(family_no, '')) <> ''
        GROUP BY trim(village_code), trim(hh_list_no), trim(family_no)
        HAVING ${searchTerms.map(() => "MAX(lower(COALESCE(name, '')) LIKE ? ESCAPE '\\') = 1").join(" AND ")}
      ) SELECT person.* FROM matching_households AS household
      JOIN blb_registry_individuals AS person
        ON trim(person.village_code) = household.village_code
        AND trim(person.hh_list_no) = household.hh_list_no
        AND trim(person.family_no) = household.family_no`;
      values.push(...searchTerms.map((term) => `%${escapeLikePattern(term)}%`));
    } else {
      sql = `SELECT * FROM blb_registry_individuals WHERE ${scope}`;
      if (searchTerms.length) {
        const pattern = `%${escapeLikePattern(searchTerms[0])}%`;
        sql += ` AND (
          lower(COALESCE(name, '')) LIKE ? ESCAPE '\\'
          OR lower(trim(village_code) || '-' || trim(COALESCE(hh_list_no, '')) || '-' ||
            trim(COALESCE(family_no, '')) || '-' || trim(COALESCE(ind_no, ''))) LIKE ? ESCAPE '\\'
        )`;
        values.push(pattern, pattern);
      }
    }
    sql += " ORDER BY family_no COLLATE BINARY, ind_no COLLATE BINARY, uid COLLATE BINARY LIMIT ? OFFSET ?";
    values.push(pageLimit, pageOffset);
    return getOfflineDatabase().getAllAsync(sql, values);
  }

  const scopedRows = readWebRegistry().individuals.filter((individual) =>
    villages.includes(String(individual.village_code ?? "").trim())
      && (!house || String(individual.hh_list_no ?? "").trim() === house));
  let matches;
  if (searchTerms.length > 1) {
    const groups = new Map();
    for (const row of scopedRows) {
      const houseKey = String(row.hh_list_no ?? "").trim();
      const familyKey = String(row.family_no ?? "").trim();
      if (!houseKey || !familyKey) continue;
      const key = JSON.stringify([String(row.village_code ?? "").trim(), houseKey, familyKey]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    matches = [...groups.values()].filter((members) =>
      searchTerms.every((term) => members.some((row) => normalizeSearchValue(row.name).includes(term)))).flat();
  } else {
    matches = scopedRows.filter((individual) => {
      if (!searchTerms.length) return true;
      return normalizeSearchValue(individual.name).includes(searchTerms[0])
        || normalizeSearchValue(buildOriginalId(individual.village_code, individual.hh_list_no,
          individual.family_no, individual.ind_no)).includes(searchTerms[0]);
    });
  }
  matches.sort((left, right) => {
    for (const field of ["family_no", "ind_no", "uid"]) {
      const a = String(left[field] ?? "");
      const b = String(right[field] ?? "");
      const comparison = a < b ? -1 : a > b ? 1 : 0;
      if (comparison !== 0) return comparison;
    }
    return 0;
  });
  return matches.slice(pageOffset, pageOffset + pageLimit);
}

/** Browse reference households without changing study enrollment or task assignments. */
export async function listBlbRegistryHouseholds({ search = "", offset = 0, limit = 50, villageCode = "" } = {}, allowedVillageCodes = []) {
  const villages = Array.isArray(allowedVillageCodes)
    ? [...new Set(allowedVillageCodes.map((value) => String(value ?? "").trim()).filter(Boolean))]
    : [];
  const village = String(villageCode ?? "").trim();
  if (!villages.length || (village && !villages.includes(village))) return { households: [], hasMore: false };
  const scope = village ? [village] : villages;
  const searchTerms = String(search ?? "").split(",").map(normalizeSearchValue).filter(Boolean);
  const pageOffset = normalizePage(offset, 0);
  const pageLimit = normalizePage(limit, 50, 50) || 50;
  let households;

  if (Platform.OS !== "web") {
    const values = [...scope];
    // Page address keys first; aggregate names only for the displayed households and lookahead.
    let sql = `WITH page AS (
      SELECT trim(village_code) AS village_code, trim(hh_list_no) AS hh_list_no,
        trim(family_no) AS family_no
      FROM blb_registry_individuals
      WHERE trim(village_code) IN (${scope.map(() => "?").join(",")})
        AND trim(COALESCE(hh_list_no, '')) <> '' AND trim(COALESCE(family_no, '')) <> ''
      GROUP BY trim(village_code), trim(hh_list_no), trim(family_no)`;
    if (searchTerms.length) {
      // Each name may match a different member; substring matching scans SQLite rows, not JS objects.
      sql += " HAVING " + searchTerms.map(() => "MAX(lower(COALESCE(name, '')) LIKE ? ESCAPE '\\') = 1").join(" AND ");
      values.push(...searchTerms.map((term) => `%${escapeLikePattern(term)}%`));
    }
    sql += ` ORDER BY trim(village_code), trim(hh_list_no),
        trim(family_no) LIMIT ? OFFSET ?)
      SELECT page.village_code, page.hh_list_no, page.family_no,
        MIN(person.village_name) AS village_name, COUNT(*) AS member_count,
        json_group_array(person.name) AS member_names
      FROM page JOIN blb_registry_individuals AS person
        ON trim(person.village_code) = page.village_code
        AND trim(person.hh_list_no) = page.hh_list_no AND trim(person.family_no) = page.family_no
      GROUP BY page.village_code, page.hh_list_no, page.family_no
      ORDER BY page.village_code COLLATE BINARY, page.hh_list_no COLLATE BINARY, page.family_no COLLATE BINARY`;
    values.push(pageLimit + 1, pageOffset);
    households = (await getOfflineDatabase().getAllAsync(sql, values)).map((row) => ({
      ...row,
      member_names: JSON.parse(row.member_names).map((name) => String(name ?? "").trim()).filter(Boolean).sort(),
    }));
  } else {
    const groups = new Map();
    for (const individual of readWebRegistry().individuals) {
      const village_code = String(individual.village_code ?? "").trim();
      const hh_list_no = String(individual.hh_list_no ?? "").trim();
      const family_no = String(individual.family_no ?? "").trim();
      if (!scope.includes(village_code) || !hh_list_no || !family_no) continue;
      const key = JSON.stringify([village_code, hh_list_no, family_no]);
      if (!groups.has(key)) groups.set(key, {
        village_code, village_name: individual.village_name ?? null,
        hh_list_no, family_no, member_count: 0, member_names: [],
      });
      const household = groups.get(key);
      household.member_count += 1;
      const name = String(individual.name ?? "").trim();
      if (name) household.member_names.push(name);
    }
    households = [...groups.values()]
      .filter((row) => searchTerms.every((term) => row.member_names.some((name) => normalizeSearchValue(name).includes(term))))
      .sort((left, right) => {
        for (const field of ["village_code", "hh_list_no", "family_no"]) {
          if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
        }
        return 0;
      })
      .slice(pageOffset, pageOffset + pageLimit + 1);
    households.forEach((household) => household.member_names.sort());
  }
  return { households: households.slice(0, pageLimit), hasMore: households.length > pageLimit };
}

/** Count matching address groups without transferring the full registry to JavaScript. */
export async function countBlbRegistryHouseholds({ search = "", villageCode = "" } = {}, allowedVillageCodes = []) {
  const villages = Array.isArray(allowedVillageCodes)
    ? [...new Set(allowedVillageCodes.map((value) => String(value ?? "").trim()).filter(Boolean))]
    : [];
  const village = String(villageCode ?? "").trim();
  if (!villages.length || (village && !villages.includes(village))) return 0;
  const scope = village ? [village] : villages;
  const terms = String(search ?? "").split(",").map(normalizeSearchValue).filter(Boolean);
  if (Platform.OS !== "web") {
    const values = [...scope];
    let sql = `SELECT COUNT(*) AS total FROM (
      SELECT 1 FROM blb_registry_individuals
      WHERE trim(village_code) IN (${scope.map(() => "?").join(",")})
        AND trim(COALESCE(hh_list_no, '')) <> '' AND trim(COALESCE(family_no, '')) <> ''
      GROUP BY trim(village_code), trim(hh_list_no), trim(family_no)`;
    if (terms.length) {
      sql += " HAVING " + terms.map(() => "MAX(lower(COALESCE(name, '')) LIKE ? ESCAPE '\\') = 1").join(" AND ");
      values.push(...terms.map((term) => `%${escapeLikePattern(term)}%`));
    }
    const row = await getOfflineDatabase().getFirstAsync(sql + ")", values);
    return Number(row?.total || 0);
  }
  const groups = new Map();
  for (const person of readWebRegistry().individuals) {
    const address = [person.village_code, person.hh_list_no, person.family_no].map((value) => String(value ?? "").trim());
    if (!scope.includes(address[0]) || !address[1] || !address[2]) continue;
    const key = JSON.stringify(address);
    if (!groups.has(key)) groups.set(key, new Set());
    const matched = groups.get(key);
    terms.forEach((term, index) => { if (normalizeSearchValue(person.name).includes(term)) matched.add(index); });
  }
  return [...groups.values()].filter((matched) => matched.size === terms.length).length;
}

/** Keep all UID rows, including people sharing an address tuple. */
export async function listBlbRegistryHouseholdMembers({ villageCode, houseNo, familyNo } = {}, allowedVillageCodes = []) {
  const values = [villageCode, houseNo, familyNo].map((value) => String(value ?? "").trim());
  if (values.some((value) => !value) || !isAllowedVillage(values[0], allowedVillageCodes)) return [];
  if (Platform.OS !== "web") {
    return getOfflineDatabase().getAllAsync(
      `SELECT * FROM blb_registry_individuals
       WHERE trim(village_code) = ? AND trim(hh_list_no) = ? AND trim(family_no) = ?
       ORDER BY ind_no COLLATE BINARY, uid COLLATE BINARY`, values,
    );
  }
  return readWebRegistry().individuals
    .filter((row) => [row.village_code, row.hh_list_no, row.family_no]
      .every((value, index) => String(value ?? "").trim() === values[index]))
    .sort((left, right) => {
      for (const field of ["ind_no", "uid"]) {
        const a = String(left[field] ?? "");
        const b = String(right[field] ?? "");
        if (a !== b) return a < b ? -1 : 1;
      }
      return 0;
    });
}
