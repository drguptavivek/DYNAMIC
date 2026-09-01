/** Verifies household identity extraction and the single-owner native database boundary. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const householdRepositorySource = fs.readFileSync(
  path.resolve(testRoot, "../modules/households/householdRepository.js"),
  "utf8"
);
const householdModuleSource = fs.readFileSync(
  path.resolve(testRoot, "../modules/households/HouseholdModule.js"),
  "utf8"
);
const taskSchemaSource = fs.readFileSync(
  path.resolve(testRoot, "../modules/tasks/taskSchema.js"),
  "utf8"
);
const offlineDatabaseNativeSource = fs.readFileSync(
  path.resolve(testRoot, "../modules/storage/offlineDatabase.native.js"),
  "utf8"
);
const offlineDatabaseWebSource = fs.readFileSync(
  path.resolve(testRoot, "../modules/storage/offlineDatabase.web.js"),
  "utf8"
);

assert.doesNotMatch(householdRepositorySource, /openDatabase(?:Async|Sync)/);
assert.doesNotMatch(taskSchemaSource, /openDatabase(?:Async|Sync)/);
assert.match(householdRepositorySource, /from "\.\.\/storage\/offlineDatabase"/);
assert.match(taskSchemaSource, /from "\.\.\/storage\/offlineDatabase"/);
assert.match(taskSchemaSource, /CREATE TABLE IF NOT EXISTS domain_events_outbox[\s\S]*updated_at TEXT/);
assert.match(taskSchemaSource, /ALTER TABLE domain_events_outbox ADD COLUMN updated_at TEXT/);
assert.match(taskSchemaSource, /ALTER TABLE form_responses ADD COLUMN updated_at TEXT/);
assert.match(householdRepositorySource, /householdIds/);
assert.match(householdModuleSource, /listTasks/);
assert.match(householdModuleSource, /status: "open", task_type: HHQ_CODE/);
assert.match(householdModuleSource, /householdIds: scopedHouseholdIds/);
assert.doesNotMatch(householdRepositorySource, /from "\.\.\/storage\/offlineDatabase\.js"/);
assert.doesNotMatch(taskSchemaSource, /from "\.\.\/storage\/offlineDatabase\.js"/);
assert.match(offlineDatabaseNativeSource, /import \* as SQLite from "expo-sqlite"/);
assert.doesNotMatch(offlineDatabaseNativeSource, /require\("expo-sqlite"\)/);
assert.match(offlineDatabaseNativeSource, /SQLite\.openDatabaseSync\(DATABASE_NAME\)/);
assert.match(offlineDatabaseWebSource, /expo-sqlite\.web\.js/);
assert.doesNotMatch(offlineDatabaseWebSource, /expo-sqlite";/);
assert.match(
  householdRepositorySource,
  /CREATE TABLE IF NOT EXISTS households[\s\S]*?locality_type TEXT/,
  "local households table must store the admin-managed locality type",
);
assert.match(
  householdRepositorySource,
  /ALTER TABLE households ADD COLUMN locality_type TEXT/,
  "existing device databases must be migrated to carry locality_type",
);
assert.match(
  householdRepositorySource,
  /INSERT INTO households \(\s*household_id, site_id, locality_code, locality_name, locality_type,/,
  "synced household upserts must persist locality_type",
);
assert.match(householdRepositorySource, /locality_type = excluded\.locality_type/);
assert.match(householdRepositorySource, /locality_type: household\.locality_type \|\| null/);
assert.match(
  householdRepositorySource,
  /SELECT household_id, site_id, locality_code, locality_name, locality_type,/,
  "getHousehold must expose locality_type for the HHQ prefill",
);

const {
  extractHouseholdRegistryFields,
  assertUniqueMembers,
  buildHouseholdIdFromHhqData
} = await import("../modules/households/householdIds.js");

const sample = {
  hhq_site_id: 1,
  hhq_locality_code: 2,
  hhq_structure_map_id: "0042",
  hhq_household_number: "03",
  hhq_household_address: "Test address",
  hhq_household_head_name: "Head Name",
  hhq_consent_study_provide_pis_explain_study_adult_member: 1,
  hhq_interview_date: "2026-09-01",
  hhq_result_interview: 1,
  hhq_language_questionnaire: 1,
  hhq_contact_mobile: "9999999999",
  hhq_household_members: [
    {
      member_line_number: 1,
      member_name: "Head Name",
      member_relationship_to_head: 1,
      member_sex: 1,
      member_age_years: 40,
      member_marital_status: 1
    },
    {
      member_line_number: 2,
      member_name: "Member Two",
      member_relationship_to_head: 2,
      member_sex: 2,
      member_age_years: 35,
      member_marital_status: 1,
      member_woman_questionnaire_eligible: 1
    }
  ]
};

const record = extractHouseholdRegistryFields(sample);
assert.equal(record.household_id, "1-02-0042-03");
assert.equal(record.members.length, 2);
assert.equal(record.members[0].individual_id, "1-02-0042-03-01");
assert.equal(record.members[1].individual_id, "1-02-0042-03-02");
assert.equal(record.mobile_number, "9999999999");
assert.equal(buildHouseholdIdFromHhqData(sample), "1-02-0042-03");
assert.equal(
  buildHouseholdIdFromHhqData({ ...sample, hhq_structure_map_id: "42" }),
  "1-02-0042-03"
);
assert.equal(
  buildHouseholdIdFromHhqData({ ...sample, hhq_structure_map_id: "A12B3" }),
  "1-02-A12B3-03"
);
assert.equal(
  buildHouseholdIdFromHhqData({ ...sample, hhq_household_number: "3" }),
  ""
);

assert.doesNotThrow(() => assertUniqueMembers(record));

const duplicate = extractHouseholdRegistryFields({
  ...sample,
  hhq_household_members: [
    { member_line_number: 1, member_name: "A" },
    { member_line_number: 1, member_name: "B" }
  ]
});

assert.throws(() => assertUniqueMembers(duplicate), /Duplicate/);

const multipleMobileRecord = extractHouseholdRegistryFields({
  ...sample,
  hhq_contact_mobile: "",
  hhq_contact_mobile_numbers: [
    { mobile_number: "9999999999" },
    { mobile_number: "8888888888" },
    { mobile_number: "" }
  ]
});

assert.equal(multipleMobileRecord.mobile_number, "9999999999, 8888888888");

console.log("Validated household and individual ID extraction.");
