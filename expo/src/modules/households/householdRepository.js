/**
 * Persists household registry and member cache records in shared offline storage.
 */
import { Platform } from "react-native";

import { getOfflineDatabase } from "../storage/offlineDatabase";
import {
  assertUniqueMembers,
  buildHouseholdIdFromHhqData,
  extractHouseholdRegistryFields,
  normalizeWomanQuestionnaireEligible
} from "./householdIds.js";
import {
  STUDY_SITES,
  STUDY_VILLAGES,
  getStudySiteName
} from "../../../../shared/studyMasters.js";

export { extractHouseholdRegistryFields };

export async function findExistingHouseholdForHhqData(hhqData) {
  const householdId = buildHouseholdIdFromHhqData(hhqData);
  if (!householdId) {
    return null;
  }
  return getHousehold(householdId);
}

const HOUSEHOLD_STORAGE_KEY = "dynamic_households_v4";
const MEMBER_STORAGE_KEY = "dynamic_household_members_v4";
const WEB_HOUSEHOLD_CACHE_LIMIT = 500;
const WEB_MEMBER_CACHE_LIMIT = 2000;
const OBSOLETE_STORAGE_KEYS = [
  "dynamic_households_v1",
  "dynamic_households_v2",
  "dynamic_households_v3",
  "dynamic_household_members_v1",
  "dynamic_household_members_v2",
  "dynamic_household_members_v3",
  "dynamic_web_sqlite_v1"
];

export function getHouseholdCacheInfo() {
  const isWebStorage =
    Platform.OS === "web" && typeof window !== "undefined" && Boolean(window.localStorage);
  return {
    isWebStorage,
    householdLimit: isWebStorage ? WEB_HOUSEHOLD_CACHE_LIMIT : null,
    memberLimit: isWebStorage ? WEB_MEMBER_CACHE_LIMIT : null
  };
}

export function clearHouseholdCacheForSync() {
  const storage = getStorage();
  if (!storage) return;
  cleanupObsoleteWebStorage(storage);
  storage.removeItem(HOUSEHOLD_STORAGE_KEY);
  storage.removeItem(MEMBER_STORAGE_KEY);
}

const SEED_HOUSEHOLDS = [
  {
    household_id: "1-01-0234-01",
    site_id: 1,
    locality_code: "01",
    locality_name: "Sunped",
    structure_number: "0234",
    household_number: "01",
    address: "Near primary school",
    household_head_name: "Ramesh Kumar",
    consent_status: "Yes",
    interview_date: "2026-09-01",
    result_interview: 1,
    language_questionnaire: 1,
    mobile_number: "",
    sync_status: "local",
    updated_at: "2026-09-01T00:00:00.000Z",
    members: [
      {
        individual_id: "1-01-0234-01-01",
        household_id: "1-01-0234-01",
        line_number: 1,
        member_name: "Ramesh Kumar",
        relationship_to_head: 1,
        sex: 1,
        age_years: 42,
        marital_status: 1,
        woman_questionnaire_eligible: 0,
        sync_status: "local",
        updated_at: "2026-09-01T00:00:00.000Z"
      },
      {
        individual_id: "1-01-0234-01-02",
        household_id: "1-01-0234-01",
        line_number: 2,
        member_name: "Sita Devi",
        relationship_to_head: 2,
        sex: 2,
        age_years: 35,
        marital_status: 1,
        woman_questionnaire_eligible: 1,
        sync_status: "local",
        updated_at: "2026-09-01T00:00:00.000Z"
      },
      {
        individual_id: "1-01-0234-01-03",
        household_id: "1-01-0234-01",
        line_number: 3,
        member_name: "Amit Kumar",
        relationship_to_head: 4,
        sex: 1,
        age_years: 15,
        marital_status: 2,
        woman_questionnaire_eligible: 0,
        sync_status: "local",
        updated_at: "2026-09-01T00:00:00.000Z"
      }
    ]
  },
  {
    household_id: "2-02-1180-01",
    site_id: 2,
    locality_code: "02",
    locality_name: "Sagarpur",
    structure_number: "1180",
    household_number: "01",
    address: "Main road",
    household_head_name: "Sunita Devi",
    consent_status: "Yes",
    interview_date: "2026-09-01",
    result_interview: 1,
    language_questionnaire: 1,
    mobile_number: "",
    sync_status: "local",
    updated_at: "2026-09-01T00:00:00.000Z",
    members: [
      {
        individual_id: "2-02-1180-01-01",
        household_id: "2-02-1180-01",
        line_number: 1,
        member_name: "Sunita Devi",
        relationship_to_head: 1,
        sex: 2,
        age_years: 38,
        marital_status: 1,
        woman_questionnaire_eligible: 1,
        sync_status: "local",
        updated_at: "2026-09-01T00:00:00.000Z"
      },
      {
        individual_id: "2-02-1180-01-02",
        household_id: "2-02-1180-01",
        line_number: 2,
        member_name: "Mohan Lal",
        relationship_to_head: 2,
        sex: 1,
        age_years: 41,
        marital_status: 1,
        woman_questionnaire_eligible: 0,
        sync_status: "local",
        updated_at: "2026-09-01T00:00:00.000Z"
      },
      {
        individual_id: "2-02-1180-01-03",
        household_id: "2-02-1180-01",
        line_number: 3,
        member_name: "Pooja",
        relationship_to_head: 4,
        sex: 2,
        age_years: 19,
        marital_status: 2,
        woman_questionnaire_eligible: 0,
        sync_status: "local",
        updated_at: "2026-09-01T00:00:00.000Z"
      }
    ]
  },
  {
    household_id: "1-02-0310-01",
    site_id: 1,
    locality_code: "02",
    locality_name: "Chhainsa",
    structure_number: "0310",
    household_number: "01",
    address: "Behind anganwadi centre",
    household_head_name: "Kavita Sharma",
    consent_status: "Yes",
    interview_date: "2026-09-02",
    result_interview: 1,
    language_questionnaire: 1,
    mobile_number: "",
    sync_status: "local",
    updated_at: "2026-09-02T00:00:00.000Z",
    members: [
      {
        individual_id: "1-02-0310-01-01",
        household_id: "1-02-0310-01",
        line_number: 1,
        member_name: "Kavita Sharma",
        relationship_to_head: 1,
        sex: 2,
        age_years: 34,
        marital_status: 1,
        woman_questionnaire_eligible: 1,
        sync_status: "local",
        updated_at: "2026-09-02T00:00:00.000Z"
      },
      {
        individual_id: "1-02-0310-01-02",
        household_id: "1-02-0310-01",
        line_number: 2,
        member_name: "Deepak Sharma",
        relationship_to_head: 2,
        sex: 1,
        age_years: 37,
        marital_status: 1,
        woman_questionnaire_eligible: 0,
        sync_status: "local",
        updated_at: "2026-09-02T00:00:00.000Z"
      },
      {
        individual_id: "1-02-0310-01-03",
        household_id: "1-02-0310-01",
        line_number: 3,
        member_name: "Neha Sharma",
        relationship_to_head: 4,
        sex: 2,
        age_years: 16,
        marital_status: 2,
        woman_questionnaire_eligible: 0,
        sync_status: "local",
        updated_at: "2026-09-02T00:00:00.000Z"
      }
    ]
  },
  {
    household_id: "2-05-1245-02",
    site_id: 2,
    locality_code: "05",
    locality_name: "Ajronda",
    structure_number: "1245",
    household_number: "02",
    address: "Near bus stand",
    household_head_name: "Farida Begum",
    consent_status: "Yes",
    interview_date: "2026-09-02",
    result_interview: 1,
    language_questionnaire: 1,
    mobile_number: "",
    sync_status: "local",
    updated_at: "2026-09-02T00:00:00.000Z",
    members: [
      {
        individual_id: "2-05-1245-02-01",
        household_id: "2-05-1245-02",
        line_number: 1,
        member_name: "Farida Begum",
        relationship_to_head: 1,
        sex: 2,
        age_years: 44,
        marital_status: 1,
        woman_questionnaire_eligible: 1,
        sync_status: "local",
        updated_at: "2026-09-02T00:00:00.000Z"
      },
      {
        individual_id: "2-05-1245-02-02",
        household_id: "2-05-1245-02",
        line_number: 2,
        member_name: "Imran Khan",
        relationship_to_head: 2,
        sex: 1,
        age_years: 46,
        marital_status: 1,
        woman_questionnaire_eligible: 0,
        sync_status: "local",
        updated_at: "2026-09-02T00:00:00.000Z"
      },
      {
        individual_id: "2-05-1245-02-03",
        household_id: "2-05-1245-02",
        line_number: 3,
        member_name: "Saba Khan",
        relationship_to_head: 4,
        sex: 2,
        age_years: 18,
        marital_status: 2,
        woman_questionnaire_eligible: 0,
        sync_status: "local",
        updated_at: "2026-09-02T00:00:00.000Z"
      }
    ]
  }
];

const SEED_HOUSEHOLD_MEMBERS = SEED_HOUSEHOLDS.flatMap((household) => household.members || []);

function stripMembers(household) {
  const { members: _members, ...householdOnly } = household;
  return householdOnly;
}

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

function cleanupObsoleteWebStorage(storage) {
  for (const key of OBSOLETE_STORAGE_KEYS) {
    storage.removeItem(key);
  }
}

function readStorageArray(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Error reading ${key}:`, error);
    return [];
  }
}

function mergeRowsById(newRows, existingRows, idKey, limit) {
  const seen = new Set();
  const merged = [];
  for (const row of [...newRows, ...existingRows]) {
    const id = row?.[idKey];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged;
}

function setStorageArray(storage, key, rows, retryRows = rows) {
  cleanupObsoleteWebStorage(storage);
  try {
    storage.setItem(key, JSON.stringify(rows));
  } catch (error) {
    cleanupObsoleteWebStorage(storage);
    storage.setItem(key, JSON.stringify(retryRows));
  }
}

async function getDatabase() {
  if (Platform.OS === "web") return null;
  return getOfflineDatabase();
}

async function initializeSqlite(db) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS study_sites (
      site_id INTEGER PRIMARY KEY NOT NULL,
      site_code TEXT NOT NULL,
      site_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS study_villages (
      site_id INTEGER NOT NULL,
      village_code TEXT NOT NULL,
      village_name TEXT NOT NULL,
      village_type TEXT,
      PRIMARY KEY(site_id, village_code)
    );
    CREATE TABLE IF NOT EXISTS households (
      household_id TEXT PRIMARY KEY NOT NULL,
      site_id INTEGER,
      locality_code TEXT,
      locality_name TEXT,
      locality_type TEXT,
      structure_number TEXT,
      household_number TEXT,
      address TEXT,
      household_head_name TEXT,
      consent_status TEXT,
      interview_date TEXT,
      result_interview INTEGER,
      language_questionnaire INTEGER,
      mobile_number TEXT,
      sync_status TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS household_members (
      individual_id TEXT PRIMARY KEY NOT NULL,
      household_id TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      member_name TEXT,
      relationship_to_head INTEGER,
      sex INTEGER,
      last_residence_place INTEGER,
      residence_months INTEGER,
      residence_years INTEGER,
      age_years INTEGER,
      marital_status INTEGER,
      woman_questionnaire_eligible INTEGER,
      birth_registration_status INTEGER,
      ever_attended_school INTEGER,
      highest_grade_completed INTEGER,
      sync_status TEXT,
      updated_at TEXT,
      UNIQUE(household_id, line_number)
    );
    CREATE TABLE IF NOT EXISTS form_submissions (
      submission_id TEXT PRIMARY KEY NOT NULL,
      form_code TEXT NOT NULL,
      form_version TEXT,
      household_id TEXT,
      person_id TEXT,
      pregnancy_event_id TEXT,
      outcome_event_id TEXT,
      json_payload TEXT NOT NULL,
      sync_status TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_households_locality
      ON households(site_id, locality_code);
    CREATE INDEX IF NOT EXISTS idx_households_locality_hh_number
      ON households(site_id, locality_code, household_number);
    CREATE INDEX IF NOT EXISTS idx_household_members_household
      ON household_members(household_id);
    CREATE INDEX IF NOT EXISTS idx_household_members_sex
      ON household_members(sex);
    CREATE INDEX IF NOT EXISTS idx_household_members_name
      ON household_members(member_name);
  `);
  try {
    await db.execAsync("ALTER TABLE households ADD COLUMN locality_type TEXT");
  } catch {
    // Column already exists on databases created after the locality-type sync.
  }
  try {
    await db.execAsync(
      "UPDATE household_members SET woman_questionnaire_eligible = 0 WHERE woman_questionnaire_eligible = 2"
    );
  } catch {
    // Best-effort cleanup of legacy rows that stored the raw HHQ code (2 = no).
  }
  for (const site of STUDY_SITES) {
    await db.runAsync(
      `INSERT INTO study_sites (site_id, site_code, site_name)
       VALUES (?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         site_code = excluded.site_code,
         site_name = excluded.site_name`,
      [site.site_id, site.site_code, site.site_name]
    );
  }
  for (const village of STUDY_VILLAGES) {
    await db.runAsync(
      `INSERT INTO study_villages (site_id, village_code, village_name, village_type)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(site_id, village_code) DO UPDATE SET
         village_name = excluded.village_name,
         village_type = excluded.village_type`,
      [
        village.site_id,
        village.village_code,
        village.village_name,
        village.village_type
      ]
    );
  }
}

export async function initializeHouseholdRepository() {
  const db = await getDatabase();
  if (db) {
    await initializeSqlite(db);
    return;
  }

  const storage = getStorage();
  if (!storage) return;
  cleanupObsoleteWebStorage(storage);
}

export async function listHouseholds(filters = {}) {
  const {
    localityCode,
    localityCodes,
    search,
    localitySearch,
    householdIds,
    householdNumber,
    address,
    limit = 50,
    offset = 0
  } = filters;
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const normalizedLocalitySearch = String(localitySearch || "").trim().toLowerCase();
  const normalizedHouseholdNumber = String(householdNumber || "").trim().toLowerCase();
  const normalizedAddress = String(address || "").trim().toLowerCase();
  const normalizedLocalityCodes = Array.isArray(localityCodes)
    ? localityCodes.map((code) => String(code)).filter(Boolean)
    : [];
  const hasHouseholdIdFilter = Array.isArray(householdIds);
  const normalizedHouseholdIds = hasHouseholdIdFilter
    ? householdIds.map((id) => String(id)).filter(Boolean)
    : [];
  if (hasHouseholdIdFilter && normalizedHouseholdIds.length === 0) return [];
  const db = await getDatabase();
  if (db) {
    await initializeSqlite(db);
    const params = [];
    const conditions = [];
    if (localityCode) {
      conditions.push("locality_code = ?");
      params.push(localityCode);
    }
    if (normalizedLocalityCodes.length) {
      conditions.push(`locality_code IN (${normalizedLocalityCodes.map(() => "?").join(", ")})`);
      params.push(...normalizedLocalityCodes);
    }
    if (hasHouseholdIdFilter) {
      conditions.push(`household_id IN (${normalizedHouseholdIds.map(() => "?").join(", ")})`);
      params.push(...normalizedHouseholdIds);
    }
    if (normalizedLocalitySearch) {
      conditions.push("LOWER(COALESCE(locality_code, '') || ' ' || COALESCE(locality_name, '')) LIKE ?");
      params.push(`%${normalizedLocalitySearch}%`);
    }
    if (normalizedHouseholdNumber) {
      conditions.push("LOWER(COALESCE(household_number, '')) LIKE ?");
      params.push(`%${normalizedHouseholdNumber}%`);
    }
    if (normalizedAddress) {
      conditions.push("LOWER(COALESCE(address, '')) LIKE ?");
      params.push(`%${normalizedAddress}%`);
    }
    if (normalizedSearch) {
      conditions.push(`LOWER(
        household_id || ' ' ||
        COALESCE(locality_code, '') || ' ' ||
        COALESCE(locality_name, '') || ' ' ||
        COALESCE(structure_number, '') || ' ' ||
        COALESCE(household_number, '') || ' ' ||
        COALESCE(address, '') || ' ' ||
        COALESCE(household_head_name, '') || ' ' ||
        COALESCE(consent_status, '') || ' ' ||
        COALESCE(mobile_number, '') || ' ' ||
        COALESCE(interview_date, '')
      ) LIKE ?`);
      params.push(`%${normalizedSearch}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return db.getAllAsync(
      `SELECT household_id, site_id, locality_code, locality_name,
              structure_number, household_number, address,
              household_head_name, consent_status, interview_date,
              result_interview, language_questionnaire, mobile_number,
              sync_status, updated_at
         FROM households
        ${where}
        ORDER BY updated_at DESC, household_id ASC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
  }

  const storage = getStorage();
  if (!storage) return [];
  return readStorageArray(storage, HOUSEHOLD_STORAGE_KEY)
    .filter((row) => !localityCode || row.locality_code === localityCode)
    .filter((row) => !normalizedLocalityCodes.length || normalizedLocalityCodes.includes(String(row.locality_code)))
    .filter((row) => !hasHouseholdIdFilter || normalizedHouseholdIds.includes(String(row.household_id)))
    .filter((household) => {
      if (!normalizedLocalitySearch) return true;
      return [household.locality_code, household.locality_name]
        .join(" ")
        .toLowerCase()
        .includes(normalizedLocalitySearch);
    })
    .filter((household) => {
      if (!normalizedHouseholdNumber) return true;
      return String(household.household_number || "").toLowerCase().includes(normalizedHouseholdNumber);
    })
    .filter((household) => {
      if (!normalizedAddress) return true;
      return String(household.address || "").toLowerCase().includes(normalizedAddress);
    })
    .filter((household) => {
      if (!normalizedSearch) return true;
      return [
        household.household_id,
        household.locality_code,
        household.locality_name,
        household.structure_number,
        household.household_number,
        household.address,
        household.household_head_name,
        household.consent_status,
        household.mobile_number,
        household.interview_date
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .slice(offset, offset + limit);
}

export async function listHouseholdMembers(householdId) {
  const db = await getDatabase();
  if (db) {
    await initializeSqlite(db);
    return db.getAllAsync(
      `SELECT individual_id, household_id, line_number, member_name,
              relationship_to_head, sex, last_residence_place,
              residence_months, residence_years, age_years, marital_status,
              woman_questionnaire_eligible, birth_registration_status,
              ever_attended_school, highest_grade_completed, sync_status, updated_at
         FROM household_members
        WHERE household_id = ?
        ORDER BY line_number ASC`,
      [householdId]
    );
  }

  const storage = getStorage();
  if (!storage) return [];
  return readStorageArray(storage, MEMBER_STORAGE_KEY)
    .filter((row) => row.household_id === householdId)
    .sort((a, b) => Number(a.line_number) - Number(b.line_number));
}

export async function getHousehold(householdId) {
  const db = await getDatabase();
  if (db) {
    await initializeSqlite(db);
    return db.getFirstAsync(
      `SELECT household_id, site_id, locality_code, locality_name, locality_type,
              structure_number, household_number, address,
              household_head_name, consent_status, interview_date,
              result_interview, language_questionnaire, mobile_number,
              sync_status, updated_at
         FROM households
        WHERE household_id = ?`,
      [householdId]
    );
  }

  const households = await listHouseholds();
  return households.find((row) => row.household_id === householdId) || null;
}

export async function listLocalities() {
  const db = await getDatabase();
  if (db) {
    await initializeSqlite(db);
    return db.getAllAsync(
      `SELECT locality_code, COALESCE(locality_name, locality_code) AS locality_name,
              MIN(site_id) AS site_id, COUNT(*) AS household_count
         FROM households
        WHERE locality_code IS NOT NULL AND locality_code != ''
        GROUP BY locality_code, locality_name
        ORDER BY locality_name ASC, locality_code ASC`
    );
  }

  const households = await listHouseholds();
  const byCode = new Map();
  for (const household of households) {
    if (!household.locality_code) continue;
    const current = byCode.get(household.locality_code);
    byCode.set(household.locality_code, {
      locality_code: household.locality_code,
      locality_name: household.locality_name || household.locality_code,
      site_id: household.site_id,
      household_count: (current?.household_count || 0) + 1
    });
  }
  return [...byCode.values()].sort((a, b) =>
    String(a.locality_name).localeCompare(String(b.locality_name))
  );
}

export async function searchHouseholdMembers(filters = {}) {
  const {
    localityCode,
    localityCodes,
    householdIds,
    name,
    householdNumber,
    address,
    sex,
    limit = 50,
    offset = 0
  } = filters;
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedHouseholdNumber = String(householdNumber || "").trim();
  const normalizedAddress = String(address || "").trim().toLowerCase();
  const normalizedSex = sex === undefined || sex === null || sex === "" ? "" : String(sex);
  const normalizedLocalityCodes = Array.isArray(localityCodes)
    ? localityCodes.map((code) => String(code)).filter(Boolean)
    : [];
  const hasHouseholdIdFilter = Array.isArray(householdIds);
  const normalizedHouseholdIds = hasHouseholdIdFilter
    ? householdIds.map((id) => String(id)).filter(Boolean)
    : [];
  if (hasHouseholdIdFilter && normalizedHouseholdIds.length === 0) return [];

  const db = await getDatabase();
  if (db) {
    await initializeSqlite(db);
    const params = [];
    let sql = `
      SELECT m.individual_id, m.household_id, m.line_number, m.member_name,
             m.relationship_to_head, m.sex, m.age_years, m.marital_status,
             m.woman_questionnaire_eligible, m.sync_status, m.updated_at,
             h.site_id, h.locality_code, h.locality_name, h.structure_number,
             h.household_number, h.address, h.household_head_name
        FROM household_members m
        JOIN households h ON h.household_id = m.household_id
       WHERE 1=1`;

    if (localityCode) {
      sql += " AND h.locality_code = ?";
      params.push(localityCode);
    }
    if (normalizedLocalityCodes.length) {
      sql += ` AND h.locality_code IN (${normalizedLocalityCodes.map(() => "?").join(", ")})`;
      params.push(...normalizedLocalityCodes);
    }
    if (hasHouseholdIdFilter) {
      sql += ` AND m.household_id IN (${normalizedHouseholdIds.map(() => "?").join(", ")})`;
      params.push(...normalizedHouseholdIds);
    }
    if (normalizedHouseholdNumber) {
      sql += " AND h.household_number = ?";
      params.push(normalizedHouseholdNumber);
    }
    if (normalizedAddress) {
      sql += " AND LOWER(COALESCE(h.address, '')) LIKE ?";
      params.push(`%${normalizedAddress}%`);
    }
    if (normalizedSex === "other") {
      sql += " AND (m.sex IS NULL OR CAST(m.sex AS TEXT) NOT IN ('1', '2'))";
    } else if (normalizedSex) {
      sql += " AND CAST(m.sex AS TEXT) = ?";
      params.push(normalizedSex);
    }
    if (normalizedName) {
      sql += " AND LOWER(COALESCE(m.member_name, '')) LIKE ?";
      params.push(`%${normalizedName}%`);
    }

    sql += " ORDER BY h.locality_code ASC, h.household_number ASC, m.line_number ASC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    return db.getAllAsync(sql, params);
  }

  const storage = getStorage();
  const households = await listHouseholds({
    localityCode,
    localityCodes: normalizedLocalityCodes,
    householdIds: hasHouseholdIdFilter ? normalizedHouseholdIds : undefined,
    householdNumber: normalizedHouseholdNumber,
    address: normalizedAddress,
    limit: hasHouseholdIdFilter ? Math.max(normalizedHouseholdIds.length, limit) : limit
  });
  const householdById = new Map(households.map((household) => [household.household_id, household]));
  const members = storage ? readStorageArray(storage, MEMBER_STORAGE_KEY) : [];

  return members
    .map((member) => ({ ...member, household: householdById.get(member.household_id) }))
    .filter((row) => {
      const household = row.household;
      if (!household) return false;
      if (normalizedHouseholdNumber && household.household_number !== normalizedHouseholdNumber) return false;
      if (normalizedAddress && !String(household.address || "").toLowerCase().includes(normalizedAddress)) return false;
      if (normalizedSex === "other" && ["1", "2"].includes(String(row.sex))) return false;
      if (normalizedSex && normalizedSex !== "other" && String(row.sex) !== normalizedSex) return false;
      if (normalizedName && !String(row.member_name || "").toLowerCase().includes(normalizedName)) return false;
      return true;
    })
    .slice(offset, offset + limit)
    .map(({ household, ...member }) => ({
      ...member,
      site_id: household.site_id,
      locality_code: household.locality_code,
      locality_name: household.locality_name,
      structure_number: household.structure_number,
      household_number: household.household_number,
      address: household.address,
      household_head_name: household.household_head_name
    }));
}

export async function saveSyncedHouseholdsAndMembers(households = [], members = []) {
  const db = await getDatabase();
  const mappedHouseholds = households.map((household) => ({
    household_id: household.household_id,
    site_id: household.site_id,
    locality_code: household.locality_code,
    locality_name: household.locality_name || household.locality_code,
    locality_type: household.locality_type || null,
    structure_number: household.structure_map_id,
    household_number: household.household_number,
    address: household.address,
    household_head_name: household.household_head_name,
    consent_status: household.consent_status || "",
    interview_date: household.baseline_completed_date,
    result_interview: household.result_interview,
    language_questionnaire: household.language_questionnaire,
    mobile_number: household.contact_mobile,
    sync_status: household.sync_status || "synced",
    updated_at: household.updated_at
  }));
  const mappedMembers = members.map((member) => ({
    individual_id: member.household_member_id,
    household_id: member.household_id,
    line_number: member.member_number,
    member_name: member.name,
    relationship_to_head: member.relationship_to_head,
    sex: member.sex,
    last_residence_place: member.last_residence_place,
    residence_months: member.residence_months,
    residence_years: member.residence_years,
    age_years: member.reported_age_years,
    marital_status: member.marital_status,
    woman_questionnaire_eligible: normalizeWomanQuestionnaireEligible(
      member.woman_questionnaire_eligible
    ),
    birth_registration_status: member.birth_registration_status,
    ever_attended_school: member.ever_attended_school,
    highest_grade_completed: member.highest_grade_completed,
    sync_status: member.sync_status || "synced",
    updated_at: member.updated_at
  }));

  if (db) {
    await initializeSqlite(db);
    try {
      await db.execAsync("BEGIN TRANSACTION");
      await saveHouseholdsAndMembersInTransaction(db, mappedHouseholds, mappedMembers);
      await db.execAsync("COMMIT");
    } catch (error) {
      await db.execAsync("ROLLBACK");
      console.error("Error saving synced households and members:", error);
      throw error;
    }
    return;
  }

  const storage = getStorage();
  if (!storage) return;
  cleanupObsoleteWebStorage(storage);

  const existingHouseholds = readStorageArray(storage, HOUSEHOLD_STORAGE_KEY);
  setStorageArray(
    storage,
    HOUSEHOLD_STORAGE_KEY,
    mergeRowsById(
      mappedHouseholds,
      existingHouseholds,
      "household_id",
      WEB_HOUSEHOLD_CACHE_LIMIT
    ),
    mappedHouseholds.slice(0, WEB_HOUSEHOLD_CACHE_LIMIT)
  );

  const existingMembers = readStorageArray(storage, MEMBER_STORAGE_KEY);
  setStorageArray(
    storage,
    MEMBER_STORAGE_KEY,
    mergeRowsById(
      mappedMembers,
      existingMembers,
      "individual_id",
      WEB_MEMBER_CACHE_LIMIT
    ),
    mappedMembers.slice(0, WEB_MEMBER_CACHE_LIMIT)
  );
}

async function saveHouseholdsAndMembersInTransaction(db, mappedHouseholds, mappedMembers) {
  for (const household of mappedHouseholds) {
      await db.runAsync(
        `INSERT INTO households (
           household_id, site_id, locality_code, locality_name, locality_type,
           structure_number, household_number, address, household_head_name,
           consent_status, interview_date, result_interview, language_questionnaire,
           mobile_number, sync_status, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(household_id) DO UPDATE SET
           site_id = excluded.site_id,
           locality_code = excluded.locality_code,
           locality_name = excluded.locality_name,
           locality_type = excluded.locality_type,
           structure_number = excluded.structure_number,
           household_number = excluded.household_number,
           address = excluded.address,
           household_head_name = excluded.household_head_name,
           consent_status = excluded.consent_status,
           interview_date = excluded.interview_date,
           result_interview = excluded.result_interview,
           language_questionnaire = excluded.language_questionnaire,
           mobile_number = excluded.mobile_number,
           sync_status = excluded.sync_status,
           updated_at = excluded.updated_at`,
        [
          household.household_id,
          household.site_id,
          household.locality_code,
          household.locality_name,
          household.locality_type,
          household.structure_number,
          household.household_number,
          household.address,
          household.household_head_name,
          household.consent_status,
          household.interview_date,
          household.result_interview,
          household.language_questionnaire,
          household.mobile_number,
          household.sync_status,
          household.updated_at
        ]
      );
    }
    for (const member of mappedMembers) {
      await db.runAsync(
        `INSERT INTO household_members (
           individual_id, household_id, line_number, member_name,
           relationship_to_head, sex, last_residence_place,
           residence_months, residence_years, age_years, marital_status,
           woman_questionnaire_eligible, birth_registration_status,
           ever_attended_school, highest_grade_completed, sync_status, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(individual_id) DO UPDATE SET
           household_id = excluded.household_id,
           line_number = excluded.line_number,
           member_name = excluded.member_name,
           relationship_to_head = excluded.relationship_to_head,
           sex = excluded.sex,
           last_residence_place = excluded.last_residence_place,
           residence_months = excluded.residence_months,
           residence_years = excluded.residence_years,
           age_years = excluded.age_years,
           marital_status = excluded.marital_status,
           woman_questionnaire_eligible = excluded.woman_questionnaire_eligible,
           birth_registration_status = excluded.birth_registration_status,
           ever_attended_school = excluded.ever_attended_school,
           highest_grade_completed = excluded.highest_grade_completed,
           sync_status = excluded.sync_status,
           updated_at = excluded.updated_at`,
        [
          member.individual_id,
          member.household_id,
          member.line_number,
          member.member_name,
          member.relationship_to_head,
          member.sex,
          member.last_residence_place,
          member.residence_months,
          member.residence_years,
          member.age_years,
          member.marital_status,
          member.woman_questionnaire_eligible,
          member.birth_registration_status,
          member.ever_attended_school,
          member.highest_grade_completed,
          member.sync_status,
          member.updated_at
        ]
      );
    }
}

export async function saveHousehold(record) {
  assertUniqueMembers(record);
  const db = await getDatabase();
  if (db) {
    await initializeSqlite(db);
    await db.runAsync(
      `INSERT INTO households (
         household_id, site_id, locality_code, locality_name, structure_number,
         household_number, address, household_head_name, consent_status,
         interview_date, result_interview, language_questionnaire, mobile_number,
         sync_status, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(household_id) DO UPDATE SET
         site_id = excluded.site_id,
         locality_code = excluded.locality_code,
         locality_name = excluded.locality_name,
         structure_number = excluded.structure_number,
         household_number = excluded.household_number,
         address = excluded.address,
         household_head_name = excluded.household_head_name,
         consent_status = excluded.consent_status,
         interview_date = excluded.interview_date,
         result_interview = excluded.result_interview,
         language_questionnaire = excluded.language_questionnaire,
         mobile_number = excluded.mobile_number,
         sync_status = excluded.sync_status,
         updated_at = excluded.updated_at`,
      [
        record.household_id,
        record.site_id,
        record.locality_code,
        record.locality_name,
        record.structure_number,
        record.household_number,
        record.address,
        record.household_head_name,
        record.consent_status,
        record.interview_date,
        record.result_interview,
        record.language_questionnaire,
        record.mobile_number,
        record.sync_status,
        record.updated_at
      ]
    );

    await db.runAsync("DELETE FROM household_members WHERE household_id = ?", [
      record.household_id
    ]);
    for (const member of record.members || []) {
      await db.runAsync(
        `INSERT INTO household_members (
           individual_id, household_id, line_number, member_name,
           relationship_to_head, sex, last_residence_place,
           residence_months, residence_years, age_years, marital_status,
           woman_questionnaire_eligible, birth_registration_status,
           ever_attended_school, highest_grade_completed, sync_status, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          member.individual_id,
          member.household_id,
          member.line_number,
          member.member_name,
          member.relationship_to_head,
          member.sex,
          member.last_residence_place,
          member.residence_months,
          member.residence_years,
          member.age_years,
          member.marital_status,
          normalizeWomanQuestionnaireEligible(member.woman_questionnaire_eligible),
          member.birth_registration_status,
          member.ever_attended_school,
          member.highest_grade_completed,
          member.sync_status,
          member.updated_at
        ]
      );
    }

    if (record.raw_hhq_json) {
      const now = new Date().toISOString();
      const submissionId = `${record.household_id}-HHQ-${now}`;
      await db.runAsync(
        `INSERT INTO form_submissions (
           submission_id, form_code, form_version, household_id, json_payload,
           sync_status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          submissionId,
          "HHQ",
          "9 MAY 2026",
          record.household_id,
          JSON.stringify(record.raw_hhq_json),
          "local",
          now,
          now
        ]
      );
    }
    return record;
  }

  const storage = getStorage();
  if (!storage) return record;
  cleanupObsoleteWebStorage(storage);
  const rows = await listHouseholds();
  const { raw_hhq_json: _raw, members: _members, ...householdOnly } = record;
  setStorageArray(
    storage,
    HOUSEHOLD_STORAGE_KEY,
    mergeRowsById(
      [householdOnly],
      rows.filter((row) => row.household_id !== record.household_id),
      "household_id",
      WEB_HOUSEHOLD_CACHE_LIMIT
    ),
    [householdOnly]
  );

  const normalizedMembers = (record.members || []).map((member) => ({
    ...member,
    woman_questionnaire_eligible: normalizeWomanQuestionnaireEligible(
      member.woman_questionnaire_eligible
    )
  }));
  const currentMembers = readStorageArray(storage, MEMBER_STORAGE_KEY);
  setStorageArray(
    storage,
    MEMBER_STORAGE_KEY,
    mergeRowsById(
      normalizedMembers,
      currentMembers.filter((row) => row.household_id !== record.household_id),
      "individual_id",
      WEB_MEMBER_CACHE_LIMIT
    ),
    normalizedMembers
  );
  return record;
}

export function formatSite(siteId) {
  return getStudySiteName(siteId);
}
