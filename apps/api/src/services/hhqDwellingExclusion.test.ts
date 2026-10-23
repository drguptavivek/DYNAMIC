import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { buildHhqHouseholdPromotionValues, buildHhqMemberPromotionValues } from "./hhqPromotion";
import { buildHhqBaselinePayload, toHhqProjectionEvent } from "./promotionEventBridge";
import { reduceHouseholdProjectionEvents } from "@dynamic/event-core";
const require = createRequire(import.meta.url);

type Row = Record<string, any>;
function fixture(prior: Row[] = []) {
  const tables = ["formResponses", "households", "followUpTasks", "domainEvents", "dataQualityFlags", "householdMembers", "eligibleWomen"];
  const schema = Object.fromEntries(tables.map(name => [name, new Proxy({ name }, { get: (obj, key) => key === "name" ? obj.name : String(key) })]));
  const rows: Record<string, Row[]> = Object.fromEntries(tables.map(name => [name, []]));
  rows.formResponses = [...prior, { form_response_id: "current", household_id: "2-11-0001-01", form_code: "HHQ", response_status: "primary" }];
  rows.households = [{ household_id: "2-11-0001-01", baseline_enrollment_status: "pending" }];
  rows.followUpTasks = ["current-task", "pending-task", "completed-task"].map((id, index) => ({ task_id: id, household_id: "2-11-0001-01", status: index === 2 ? "completed" : "open" }));
  const eq = (key: string, value: unknown) => (row: Row) => row[key] === value;
  const and = (...predicates: any[]) => (row: Row) => predicates.filter(Boolean).every(predicate => predicate(row));
  const inArray = (key: string, values: unknown[]) => (row: Row) => values.includes(row[key]);
  const db = {
    select() { return { from(table: Row) { return { where(predicate: (row: Row) => boolean) {
      const result = rows[table.name].filter(predicate);
      return Object.assign(Promise.resolve(result), { limit: (count: number) => Promise.resolve(result.slice(0, count)) });
    } }; } }; },
    update(table: Row) { return { set(values: Row) { return { async where(predicate: (row: Row) => boolean) {
      rows[table.name].filter(predicate).forEach(row => Object.assign(row, values));
    } }; } }; },
    insert(table: Row) { return { values(values: Row) {
      return { then(resolve: any, reject: any) { rows[table.name].push(values); return Promise.resolve().then(resolve, reject); },
        async onConflictDoUpdate(options: Row) {
          const existing = rows[table.name].find(row => row.household_id === values.household_id);
          if (existing) Object.assign(existing, options.set); else rows[table.name].push(values);
        } };
    } }; },
  };
  let taskWrites = 0;
  const modules: Record<string, any> = {
    "@dynamic/event-core": { promoteFormSubmission() { throw new Error("Terminal response must not generate workflow"); } },
    "drizzle-orm": { eq, and, inArray, ne: (key: string, value: unknown) => (row: Row) => row[key] !== value },
    "crypto": { randomUUID: () => "event-id" }, "../db": { schema }, "../lib/dbContext": { getDb: () => db },
    "./hhqPromotion": { buildHhqHouseholdPromotionValues, buildHhqMemberPromotionValues },
    "./taskWriter": { checkGeneratedTaskKey() {}, writeTasksFromDescriptors() { taskWrites++; } },
    "../../../../shared/householdDwellingOutcome.cjs": require("../../../../shared/householdDwellingOutcome.cjs"),
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./hhqFormPromotion.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Row = {};
  runInNewContext(compiled, { exports, require: (id: string) => {
    assert.ok(modules[id], `Unexpected module ${id}`); return modules[id];
  } });
  return { rows, modules, taskWrites: () => taskWrites, promote: exports.promoteHhq };
}

for (const outcome of [7, 8, 9]) test(`terminal dwelling outcome ${outcome} excludes without downstream workflow`, async () => {
  const { rows, promote, taskWrites } = fixture();
  const answers = { hhq_competent_respondent_available: outcome, hhq_result_interview: 1,
    hhq_consent_study_provide_pis_explain_study_adult_member: 1, hhq_household_members: [{ member_age_years: 25, member_sex: 2 }] };
  await promote({ form_response_id: "current", task_id: "current-task", household_id: "2-11-0001-01" }, answers);
  assert.equal(rows.formResponses.at(-1)!.response_status, "household_excluded");
  assert.equal(rows.households[0].baseline_enrollment_status, "not_enrolled");
  assert.equal(rows.households[0].cohort_status, "excluded");
  assert.equal(rows.households[0].consent_status, "No");
  assert.equal(rows.households[0].result_interview, outcome);
  assert.equal(rows.followUpTasks[0].status, "open", "sync handler completes submitted task later");
  assert.equal(rows.followUpTasks[1].status, "cancelled");
  assert.equal(rows.followUpTasks[2].status, "completed");
  assert.equal(taskWrites(), 0);
  assert.equal(rows.householdMembers.length, 0);
  assert.equal(rows.eligibleWomen.length, 0);
  const projection = buildHhqBaselinePayload(buildHhqHouseholdPromotionValues("2-11-0001-01", answers));
  assert.equal(projection.enrollment_status, "not_enrolled", "replay retains exclusion");
  assert.equal(projection.occupancy_status, outcome === 7 ? "vacant" : "not_occupied");
});

test("terminal duplicate preserves prior accepted household and task history", async () => {
  const { rows, promote } = fixture([{ form_response_id: "first", household_id: "2-11-0001-01", form_code: "HHQ", response_status: "primary" }]);
  rows.households[0] = { household_id: "2-11-0001-01", baseline_enrollment_status: "enrolled", consent_status: "Yes" };
  await promote({ form_response_id: "current", task_id: "current-task", household_id: "2-11-0001-01" }, { hhq_competent_respondent_available: 8 });
  assert.equal(rows.formResponses.at(-1)!.response_status, "duplicate");
  assert.equal(rows.households[0].baseline_enrollment_status, "enrolled");
  assert.equal(rows.households[0].consent_status, "Yes");
  assert.equal(rows.followUpTasks[1].status, "open");
  assert.equal(rows.domainEvents[0].apply_status, "held_duplicate");
});


test("shared task writer suppresses every task descriptor for excluded household", async () => {
  const { rows, modules } = fixture();
  rows.households[0].baseline_enrollment_status = "not_enrolled";
  rows.households[0].cohort_status = "excluded";
  modules["node:async_hooks"] = require("node:async_hooks");
  const compiled = ts.transpileModule(readFileSync(new URL("./taskWriter.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Row = {};
  runInNewContext(compiled, { exports, require: (id: string) => modules[id] });
  const before = JSON.stringify(rows.followUpTasks);
  await exports.writeTasksFromDescriptors(["HRF", "WQ", "PSF"].map(task_type => ({
    household_id: "2-11-0001-01", task_key: task_type, subject_type: "household", task_type,
  })));
  assert.equal(JSON.stringify(rows.followUpTasks), before);
});


test("actual household replay retains terminal baseline exclusion", async () => {
  const { rows, modules } = fixture();
  rows.formResponses.at(-1)!.answers_json = { hhq_competent_respondent_available: 9, hhq_interview_date: "2026-10-24" };
  rows.domainEvents.push({ event_id: "event", event_type: "household_baseline_confirmed", household_id: "2-11-0001-01",
    form_response_id: "current", site_id: 2, locality_code: "11", apply_status: "applied", created_at: new Date() });
  modules["@dynamic/event-core"] = { reduceHouseholdProjectionEvents };
  modules["./promotionEventBridge"] = { toHhqProjectionEvent };
  const compiled = ts.transpileModule(readFileSync(new URL("./projectionReplay.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Row = {};
  runInNewContext(compiled, { exports, require: (id: string) => modules[id] });
  const result = await exports.rebuildHhqHouseholdProjection("2-11-0001-01");
  assert.equal(result.rebuilt, 1);
  assert.equal(rows.households[0].baseline_enrollment_status, "not_enrolled");
  assert.equal(rows.households[0].cohort_status, "excluded");
});
