import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";

import {
  assertUniqueMembers,
  extractHouseholdRegistryFields
} from "./householdIds.js";
import {
  STUDY_SITES,
  STUDY_VILLAGES,
  getStudySiteName
} from "../studyMasters/studyMasters.js";

export { extractHouseholdRegistryFields };

const HOUSEHOLD_STORAGE_KEY = "dynamic_households_v1";
const MEMBER_STORAGE_KEY = "dynamic_household_members_v1";
const DATABASE_NAME = "dynamic_offline.db";

const SEED_HOUSEHOLDS = [
  {
    household_id: "1-101-0234-01",
    site_id: 1,
    locality_code: "101",
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
    updated_at: "2026-09-01T00:00:00.000Z"
  },
  {
    household_id: "2-204-1180-01",
    site_id: 2,
    locality_code: "204",
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
    updated_at: "2026-09-01T00:00:00.000Z"
  }
];

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

async function getDatabase() {
  if (Platform.OS === "web") return null;
  return SQLite.openDatabaseAsync(DATABASE_NAME);
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
  `);
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
    const rows = await db.getAllAsync("SELECT household_id FROM households LIMIT 1");
    if (!rows.length) {
      for (const household of SEED_HOUSEHOLDS) {
        await saveHousehold(household);
      }
    }
    return;
  }

  const storage = getStorage();
  if (!storage) return;
  if (!storage.getItem(HOUSEHOLD_STORAGE_KEY)) {
    storage.setItem(HOUSEHOLD_STORAGE_KEY, JSON.stringify(SEED_HOUSEHOLDS));
  }
  if (!storage.getItem(MEMBER_STORAGE_KEY)) {
    storage.setItem(MEMBER_STORAGE_KEY, JSON.stringify([]));
  }
}

export async function listHouseholds() {
  const db = await getDatabase();
  if (db) {
    await initializeSqlite(db);
    return db.getAllAsync(
      `SELECT household_id, site_id, locality_code, locality_name,
              structure_number, household_number, address,
              household_head_name, consent_status, interview_date,
              result_interview, language_questionnaire, mobile_number,
              sync_status, updated_at
         FROM households
        ORDER BY updated_at DESC, household_id ASC`
    );
  }

  const storage = getStorage();
  if (!storage) return SEED_HOUSEHOLDS;
  return JSON.parse(storage.getItem(HOUSEHOLD_STORAGE_KEY) || "[]");
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
  return JSON.parse(storage.getItem(MEMBER_STORAGE_KEY) || "[]")
    .filter((row) => row.household_id === householdId)
    .sort((a, b) => Number(a.line_number) - Number(b.line_number));
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
          member.woman_questionnaire_eligible,
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
  const rows = await listHouseholds();
  const { raw_hhq_json: _raw, members: _members, ...householdOnly } = record;
  storage.setItem(
    HOUSEHOLD_STORAGE_KEY,
    JSON.stringify([
      householdOnly,
      ...rows.filter((row) => row.household_id !== record.household_id)
    ])
  );

  const currentMembers = JSON.parse(storage.getItem(MEMBER_STORAGE_KEY) || "[]");
  storage.setItem(
    MEMBER_STORAGE_KEY,
    JSON.stringify([
      ...(record.members || []),
      ...currentMembers.filter((row) => row.household_id !== record.household_id)
    ])
  );
  return record;
}

export function formatSite(siteId) {
  return getStudySiteName(siteId);
}
