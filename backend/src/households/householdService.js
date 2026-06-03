import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const defaultStorePath = join(backendRoot, "data", "households.json");

function getStorePath() {
  return process.env.DYNAMIC_HOUSEHOLDS_FILE || defaultStorePath;
}

function seedStore() {
  return {
    households: [],
    household_members: [],
    form_submissions: []
  };
}

function readStore() {
  const storePath = getStorePath();
  if (!existsSync(storePath)) return seedStore();
  const data = JSON.parse(readFileSync(storePath, "utf8"));
  return {
    households: Array.isArray(data.households) ? data.households : [],
    household_members: Array.isArray(data.household_members) ? data.household_members : [],
    form_submissions: Array.isArray(data.form_submissions) ? data.form_submissions : []
  };
}

function writeStore(store) {
  const storePath = getStorePath();
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(`${storePath}.tmp`, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(`${storePath}.tmp`, storePath);
}

function normalizeHousehold(input) {
  return {
    household_id: String(input.household_id || "").trim(),
    site_id: Number(input.site_id || 0),
    locality_code: String(input.locality_code || "").trim(),
    locality_name: String(input.locality_name || "").trim(),
    structure_number: String(input.structure_number || "").trim(),
    household_number: String(input.household_number || "").trim(),
    address: String(input.address || "").trim(),
    household_head_name: String(input.household_head_name || "").trim(),
    consent_status: String(input.consent_status || "").trim(),
    interview_date: String(input.interview_date || "").trim(),
    result_interview: input.result_interview ?? "",
    language_questionnaire: input.language_questionnaire ?? "",
    mobile_number: String(input.mobile_number || "").trim(),
    sync_status: "synced",
    updated_at: input.updated_at || new Date().toISOString()
  };
}

function normalizeMember(input, householdId) {
  return {
    individual_id: String(input.individual_id || "").trim(),
    household_id: String(input.household_id || householdId || "").trim(),
    line_number: Number(input.line_number || 0),
    member_name: String(input.member_name || "").trim(),
    relationship_to_head: input.relationship_to_head ?? "",
    sex: input.sex ?? "",
    last_residence_place: input.last_residence_place ?? "",
    residence_months: input.residence_months ?? "",
    residence_years: input.residence_years ?? "",
    age_years: input.age_years ?? "",
    marital_status: input.marital_status ?? "",
    woman_questionnaire_eligible: input.woman_questionnaire_eligible ?? "",
    birth_registration_status: input.birth_registration_status ?? "",
    ever_attended_school: input.ever_attended_school ?? "",
    highest_grade_completed: input.highest_grade_completed ?? "",
    sync_status: "synced",
    updated_at: input.updated_at || new Date().toISOString()
  };
}

function validateHousehold(household) {
  if (!household.household_id) return "household_id is required.";
  if (!Number.isInteger(household.site_id) || household.site_id < 1) return "site_id must be a positive integer.";
  if (!household.locality_code) return "locality_code is required.";
  if (!household.structure_number) return "structure_number is required.";
  if (!household.household_number) return "household_number is required.";
  return null;
}

function validateMembers(members) {
  const individualIds = new Set();
  const lineNumbers = new Set();
  for (const member of members) {
    if (!member.individual_id) return "member individual_id is required.";
    if (individualIds.has(member.individual_id)) return `Duplicate individual_id: ${member.individual_id}`;
    if (lineNumbers.has(member.line_number)) return `Duplicate member line_number: ${member.line_number}`;
    individualIds.add(member.individual_id);
    lineNumbers.add(member.line_number);
  }
  return null;
}

export function listHouseholds() {
  return readStore().households.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export function listHouseholdMembers(householdId) {
  return readStore().household_members
    .filter((member) => member.household_id === householdId)
    .sort((a, b) => Number(a.line_number) - Number(b.line_number));
}

export function syncHouseholds(payload) {
  const incoming = Array.isArray(payload?.households) ? payload.households : [payload].filter(Boolean);
  if (!incoming.length) return { status: 400, error: "At least one household is required." };

  const store = readStore();
  let syncedMembers = 0;
  const syncedHouseholds = [];

  for (const item of incoming) {
    const household = normalizeHousehold(item);
    const validationError = validateHousehold(household);
    if (validationError) return { status: 400, error: validationError };

    const members = (item.members || []).map((member) => normalizeMember(member, household.household_id));
    const memberValidationError = validateMembers(members);
    if (memberValidationError) return { status: 400, error: memberValidationError };

    store.households = [
      household,
      ...store.households.filter((row) => row.household_id !== household.household_id)
    ];
    store.household_members = [
      ...members,
      ...store.household_members.filter((row) => row.household_id !== household.household_id)
    ];
    if (item.raw_hhq_json) {
      const now = new Date().toISOString();
      store.form_submissions = [
        {
          submission_id: `${household.household_id}-HHQ-${now}`,
          form_code: "HHQ",
          form_version: "9 MAY 2026",
          household_id: household.household_id,
          json_payload: item.raw_hhq_json,
          sync_status: "synced",
          created_at: now,
          updated_at: now
        },
        ...store.form_submissions
      ];
    }
    syncedHouseholds.push(household);
    syncedMembers += members.length;
  }

  writeStore(store);
  return {
    status: 200,
    data: {
      synced_households: syncedHouseholds.length,
      synced_members: syncedMembers,
      households: syncedHouseholds
    }
  };
}
