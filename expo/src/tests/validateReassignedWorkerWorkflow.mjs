/** Site transfers must hide old work without losing evidence or breaking offline follow-up. */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { stubOfflineDatabase } from "./helpers/stubOfflineDatabase.mjs";

const sqlite = new DatabaseSync(":memory:");
const db = {
  runSync(sql, params = []) { return sqlite.prepare(sql).run(...params.map((v) => v ?? null)); },
  getAllSync(sql, params = []) { return sqlite.prepare(sql).all(...params.map((v) => v ?? null)); },
  getFirstSync(sql, params = []) { return sqlite.prepare(sql).get(...params.map((v) => v ?? null)); },
  execSync(sql) { sqlite.exec(sql); },
  async runAsync(sql, ...args) { return this.runSync(sql, Array.isArray(args[0]) ? args[0] : args); },
  async getAllAsync(sql, ...args) { return this.getAllSync(sql, Array.isArray(args[0]) ? args[0] : args); },
  async getFirstAsync(sql, ...args) { return this.getFirstSync(sql, Array.isArray(args[0]) ? args[0] : args); },
  async execAsync(sql) { sqlite.exec(sql); },
};
const require = stubOfflineDatabase(db, import.meta.url);
const Module = require("module");
const rnPath = require.resolve("react-native");
const rn = new Module(rnPath);
rn.filename = rnPath; rn.loaded = true; rn.exports = { Platform: { OS: "android" } };
Module._cache[rnPath] = rn;
const tasks = require("../modules/tasks/taskRepository.js");
require("../modules/tasks/taskSchema.js").initTaskDb();
const households = require("../modules/households/householdRepository.js");
await households.initializeHouseholdRepository();
const { getAssignedHouseholdIds, saveAssignedHouseholdIds } = require("../modules/sync/householdAssignmentScope.js");
const { createSurveyModel } = require("../polyfills/surveyCoreNative.js");
const { getPreparedSurveyJson } = require("../modules/questionnaires/questionnaireSurveyJsonTransforms.js");
const { applyHouseholdMasterChoices } = require("../lib/householdMasterChoices.js");
const { applyHhqTaskHouseholdPrefill } = require("../modules/households/hhqTaskPrefill.js");
const { attachHouseholdSurveyBehaviors, refreshHouseholdSurveyBehaviors } = require("../lib/householdSurveyBehaviors.js");
const { getNativeQuestionChoices, getNativeQuestionValue } = require("../components/forms/nativeSurveyModel.js");
// Resolve native dynamic imports as Metro does, rather than Node's CJS namespace fallback.
const submissionUrl = new URL("../modules/questionnaires/questionnaireSubmissionRepository.js", import.meta.url);
const submissionContext = { module: { exports: {} }, require: createRequire(submissionUrl), console, Date, setTimeout, clearTimeout };
vm.runInNewContext(transformSync(readFileSync(submissionUrl, "utf8"), {
  format: "cjs", platform: "node", supported: { "dynamic-import": false },
}).code, submissionContext);
const { saveQuestionnaireSubmission } = submissionContext.module.exports;

let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw Error("Local finalization must not require sync"); };
const oldId = "1-01-0004-04", currentId = "2-39-0002-01", otherId = "2-39-0002-02";
const originalUser = { user_id: "transfer-worker", role: "field_worker", site_id: 1 };
const user = { ...originalUser, site_id: 2, area_assignments: [{ site_id: 2, locality_code: "39" }] };
db.runSync("INSERT OR REPLACE INTO sync_meta (key,value) VALUES (?,?)", ["auth_user", JSON.stringify(originalUser)]);
saveAssignedHouseholdIds(originalUser, [oldId, currentId, otherId]);
tasks.saveTask({ id: "old-task", task_key: "old-task", household_id: oldId, subject_id: oldId,
  subject_type: "household", task_type: "HHQ", status: "open", lifecycle_status: "open", sync_status: "synced" });
tasks.saveFormResponse({ id: "old-response", household_id: oldId, form_code: "HHQ", form_version: "test",
  answers_json: { original_site: 1, preserve: true }, sync_status: "pending", submitted_at: "2026-10-28T18:00:00Z" });
const oldEvidence = JSON.stringify(tasks.getFormResponseById("old-response"));
db.runSync("INSERT OR REPLACE INTO sync_meta (key,value) VALUES (?,?)", ["auth_user", JSON.stringify(user)]);
assert.deepEqual(getAssignedHouseholdIds(), [currentId, otherId], "Same user's old-site snapshot must not grant old-site work");
assert.equal((await tasks.listTasksPage({})).total, 0, "Old-site task must disappear before the next successful pull");
saveAssignedHouseholdIds(user, [currentId, otherId]);

const raw = JSON.parse(readFileSync(new URL("../data/forms/baseline_household_questionnaire_v2026.05.09.json", import.meta.url)));
const model = createSurveyModel(applyHouseholdMasterChoices(getPreparedSurveyJson(raw), {
  user, localities: [{ site_id: 2, locality_code: "39", locality_name: "Fatehpur Billoch 1" }],
}));
applyHhqTaskHouseholdPrefill(model, { household_id: currentId });
for (const [field, value] of [["hhq_site_id", 2], ["hhq_locality_code", "39"]]) {
  const question = model.getQuestionByName(field);
  assert.equal(getNativeQuestionValue(question), value);
  assert.equal(getNativeQuestionChoices(question, "default").filter((choice) => String(choice.value) === String(getNativeQuestionValue(question))).length, 1,
    "The locked BHQ radio must have one selected visible choice");
}
attachHouseholdSurveyBehaviors(model, raw, undefined, { findExistingHousehold: null });
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
const upcomingDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
const interviewDate = require("../lib/localDate.js").getLocalCalendarDate();
for (const [key, value] of Object.entries({
  hhq_interview_date: interviewDate, hhq_household_head_name: "Test head", hhq_competent_respondent_available: 1,
  hhq_consent_study_provide_pis_explain_study_adult_member: 1, hhq_result_interview: 1,
  hhq_household_members: [["Test head", 50, 1], ["Woman 44", 44, 2], ["Woman 22", 22, 2], ["Woman 19", 19, 2], ["Girl 6", 6, 2]].map(([name, age, sex], i) => ({
    member_name: name, member_age_years: age, member_sex: sex, member_marital_status: 1, member_relationship_to_head: i ? 4 : 1,
  })),
})) model.setValue(key, value);
refreshHouseholdSurveyBehaviors(model, raw);
assert.equal(model.getValue("hhq_total_eligible_women"), 3);
tasks.saveTask({ id: "upcoming-bhq", task_key: "upcoming-bhq", household_id: currentId, subject_id: currentId,
  subject_type: "household", task_type: "HHQ", target_date: upcomingDate, status: "open", lifecycle_status: "open" });
const bhq = await saveQuestionnaireSubmission({ formCode: "HHQ", formVersion: raw.version,
  payload: model.data, taskId: "upcoming-bhq", taskContext: tasks.getTask("upcoming-bhq"), deviceId: "test-device", userId: user.user_id });
assert.notEqual(bhq.server_response_status, "duplicate");
let visible = (await tasks.listTasksPage({})).tasks;
const wqTasks = visible.filter((task) => task.task_type === "WQ" && task.household_id === currentId);
assert.equal(wqTasks.length, 3, "Upcoming BHQ must create one local BWQ per eligible woman");
assert.equal(new Set(wqTasks.map((task) => task.subject_id)).size, 3);
const selected = wqTasks[0];
await saveQuestionnaireSubmission({ formCode: "WQ", formVersion: "test", taskId: selected.id, taskContext: selected,
  deviceId: "test-device", userId: user.user_id, payload: { wq_enter_structure_id_woman: selected.subject_id,
    wq_pregnant: 1, wq_pregnancy_tracking_eligible: 1, wq_result_interview: 1, wq_interview_date: interviewDate } });
visible = (await tasks.listTasksPage({})).tasks;
assert.equal(visible.filter((task) => task.task_type === "PEF" && task.subject_id === selected.subject_id).length, 1,
  "Pregnant BWQ must create its woman's local PEF task without sync");
assert.equal(visible.filter((task) => task.task_type === "WQ" && task.household_id === currentId && task.subject_id !== selected.subject_id).length, 2,
  "Completing one woman must leave the other women's BWQ tasks active");
assert.equal(JSON.stringify(tasks.getFormResponseById("old-response")), oldEvidence);
assert.ok(tasks.getTask("old-task"), "Hide stale work without deleting historical task rows");
assert.equal(tasks.getFormResponseById(bhq.id).sync_status, "pending");
assert.equal(fetchCalls, 0);
sqlite.close();
console.log("Native SQLite site transfer, current BHQ radio selection, upcoming BHQ -> distinct BWQs -> pregnant BWQ -> PEF passed; old evidence preserved.");
