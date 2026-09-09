/** Guards the household startup/search hot paths and their paging contract. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(testRoot, relativePath), "utf8");
const repository = read("../modules/households/householdRepository.js");
const householdModule = read("../modules/households/HouseholdModule.js");
const dedicatedMembersModule = read("../modules/households/HouseholdMembersModule.js");
const taskRepository = read("../modules/tasks/taskRepository.js");

assert.match(repository, /let initPromise = null/);
assert.match(repository, /initPromise = null;[\s\S]*initializedDatabase = null/);
assert.match(repository, /CREATE TABLE IF NOT EXISTS local_schema_migrations/);
assert.match(repository, /households\.locality_type\.v1/);
assert.match(repository, /household_members\.woman_questionnaire_eligible\.v1/);
assert.match(repository, /PRAGMA table_info\(households\)/);
assert.doesNotMatch(repository, /PRAGMA user_version/);
assert.match(repository, /BEGIN TRANSACTION/);
assert.match(repository, /await db\.execAsync\("COMMIT"\)/);

assert.match(taskRepository, /export async function listOpenHhqHouseholdIds/);
assert.match(taskRepository, /SELECT DISTINCT household_id/);
assert.match(taskRepository, /status = \?\s+AND task_type = \?/);
const openHhqQuery = taskRepository.match(
  /export async function listOpenHhqHouseholdIds[\s\S]*?\n}\n/
)?.[0] || "";
assert.doesNotMatch(openHhqQuery, /SELECT \*/);

for (const source of [repository, householdModule, dedicatedMembersModule]) {
  assert.match(source, /NOCASE|FREE_TEXT_SEARCH_MIN_LENGTH/);
}
assert.match(repository, /LIKE \? COLLATE NOCASE/);
assert.match(repository, /household_id IN \(SELECT value FROM json_each\(\?\)\)/);
assert.match(repository, /m\.household_id IN \(SELECT value FROM json_each\(\?\)\)/);
assert.doesNotMatch(repository, /LOWER\([^)]*(?:\|\||LIKE)/);
assert.doesNotMatch(repository, /LIKE \?[^\n]*%\$\{/);

assert.match(householdModule, /const SEARCH_DEBOUNCE_MS = 300/);
assert.match(householdModule, /trimmed\.length < FREE_TEXT_SEARCH_MIN_LENGTH/);
assert.match(householdModule, /setTimeout\([^\n]*SEARCH_DEBOUNCE_MS/);
assert.match(householdModule, /listOpenHhqHouseholdIds\(\)/);
assert.match(householdModule, /openHhqIdsLoading/);
assert.match(householdModule, /householdRequestRef/);
assert.match(householdModule, /limit: PAGE_SIZE \+ 1/);
assert.match(householdModule, /limit: MEMBER_SEARCH_PAGE_SIZE \+ 1/);

assert.match(dedicatedMembersModule, /const SEARCH_DEBOUNCE_MS = 300/);
assert.match(dedicatedMembersModule, /setTimeout\([^\n]*SEARCH_DEBOUNCE_MS/);
assert.match(dedicatedMembersModule, /const PAGE_SIZE = 50/);
assert.match(dedicatedMembersModule, /limit: PAGE_SIZE \+ 1/);

console.log("Validated household search startup guard, indexing, debounce, and paging.");
