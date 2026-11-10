import assert from "node:assert/strict";
import { test } from "node:test";
import { db, schema } from "../db";
import { runWithDb } from "../lib/dbContext";
import { correctMemberSex, MemberSexCorrectionError } from "./memberSexCorrection";

const request = { field: "sex", old_value: 1, new_value: 2, reason: "  Verified against source  " };
function fixture() {
  const household = { household_id: "1-01-0001-01", site_id: 1, locality_code: "01",
    baseline_enrollment_status: "enrolled", baseline_completed_date: "2026-10-01", cohort_status: null, closed_reason: null };
  const member = { household_member_id: `${household.household_id}-01`, household_id: household.household_id,
    site_id: 1, locality_code: "01", sex: 1, reported_age_years: 25, marital_status: 2,
    member_status: "active", usual_resident: true };
  const rows = new Map<unknown, any[]>([
    [schema.users, [{ user_id: "admin", active: true, role: "central_admin", site_id: null }]],
    [schema.households, [household]], [schema.householdMembers, [member]],
    [schema.userAreaAssignments, []], [schema.eligibleWomen, []], [schema.followUpTasks, []], [schema.formResponses, []],
    [schema.adminCorrections, []], [schema.adminCorrectionEvents, []], [schema.domainEvents, []],
  ]);
  const writes: unknown[] = [];
  const locks: string[] = [];
  let failTable: unknown;
  const client: any = {
    transaction: async (work: (tx: any) => Promise<unknown>) => {
      const snapshot = structuredClone([...rows.values()]);
      try { return await work(client); } catch (error) {
        [...rows.keys()].forEach((key, i) => rows.set(key, snapshot[i]));
        throw error;
      }
    },
    execute: async () => { locks.push("woman-pathway"); },
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const result = Promise.resolve(rows.get(table) ?? []);
      return Object.assign(result, { for: async (lock: string) => { locks.push(lock); return rows.get(table) ?? []; },
        limit: async () => (rows.get(table) ?? []).slice(0, 1) });
    } }) }),
    update: (table: unknown) => ({ set: (values: any) => ({ where: async () => {
      if (table === failTable) throw new Error("injected write failure");
      writes.push(table);
      Object.assign(rows.get(table)![0], values);
    } }) }),
    insert: (table: unknown) => ({ values: (value: any) => {
      const save = async () => {
        if (table === failTable) throw new Error("injected write failure");
        writes.push(table);
        rows.get(table)!.push(value);
      };
      return { then: (resolve: any, reject: any) => save().then(resolve, reject), onConflictDoNothing: save };
    } }),
  };
  return { rows, member, household, writes, locks, fail: (table: unknown) => { failTable = table; },
    correct: (input: unknown = request) => runWithDb(client as typeof db, () => correctMemberSex(member.household_member_id, "admin", input)) };
}

test("strict Male-to-Female validation happens before database access", async () => {
  for (const input of [null, {}, { ...request, reason: " " }, { ...request, reason: "x".repeat(1001) },
    { ...request, old_value: "1" }, { ...request, new_value: 1 }, { ...request, field: "name" }, { ...request, extra: true }]) {
    await assert.rejects(correctMemberSex("member", "admin", input), (e: unknown) => e instanceof MemberSexCorrectionError && e.status === 400);
  }
});

test("eligible correction uses shared deterministic WQ task and both audits, then rejects stale retry", async () => {
  const f = fixture();
  const result = await f.correct();
  assert.equal(result.bwq_task_created, true);
  assert.equal(result.bwq_task_exists, true);
  assert.equal(result.woman_questionnaire_eligible, true);
  assert.equal(f.member.sex, 2);
  assert.ok((f.member as any).updated_at instanceof Date);
  assert.ok((f.household as any).updated_at instanceof Date);
  assert.deepEqual(f.rows.get(schema.followUpTasks)!.map((t) => [t.task_type, t.task_key]), [
    ["WQ", `${f.household.household_id}|person|${f.member.household_member_id}|WQ|baseline|2026-10-01|v1`],
  ]);
  assert.equal(f.rows.get(schema.adminCorrections)![0].reason, "Verified against source");
  assert.equal(f.rows.get(schema.adminCorrectionEvents)!.length, 1);
  assert.ok(f.locks.includes("update"));
  assert.ok(f.locks.includes("woman-pathway"));
  await assert.rejects(f.correct(), (e: any) => e.code === "STALE_MEMBER_SEX");
  assert.equal(f.rows.get(schema.adminCorrections)!.length, 1);
});

test("current actor role, active status, site and area determine authorization", async () => {
  for (const actor of [
    { active: false, role: "central_admin" }, { active: true, role: "field_worker" },
    { active: true, role: "central_data_manager" },
    { active: true, role: "site_research_scientist", site_id: null },
    { active: true, role: "site_research_scientist", site_id: 2 },
  ]) {
    const f = fixture(); f.rows.set(schema.users, [actor]);
    await assert.rejects(f.correct(), (e: any) => e.status === 403);
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  f.rows.set(schema.users, [{ active: true, role: "site_data_manager", site_id: 1 }]);
  f.rows.set(schema.userAreaAssignments, [{ site_id: 1, locality_code: "02" }]);
  await assert.rejects(f.correct(), (e: any) => e.code === "OUT_OF_SCOPE");
  f.rows.set(schema.userAreaAssignments, [{ site_id: 1, locality_code: "01" }]);
  assert.equal((await f.correct()).bwq_task_created, true);
});

test("BHQ age and marital eligibility boundaries reject unknowns and preserve corrections", async () => {
  for (const [age, marital, eligible] of [[17, 2, false], [18, 2, true], [49, 2, true], [50, 2, false],
    [null, 2, false], [25, null, false], [25, 7, false]] as const) {
    const f = fixture(); Object.assign(f.member, { reported_age_years: age, marital_status: marital });
    const result = await f.correct();
    assert.equal(result.woman_questionnaire_eligible, eligible);
    assert.equal(result.bwq_task_created, eligible);
    assert.equal(f.member.sex, 2);
  }
});

test("inactive residents and excluded or closed households receive no baseline work", async () => {
  for (const patch of [{ member_status: "deceased" }, { usual_resident: false }]) {
    const f = fixture(); Object.assign(f.member, patch);
    assert.equal((await f.correct()).bwq_task_created, false);
    assert.equal(f.rows.get(schema.eligibleWomen)!.length, 0);
  }
  for (const patch of [{ baseline_enrollment_status: "pending" }, { cohort_status: "excluded" }, { cohort_status: "closed" },
    { cohort_status: "unknown" }, { closed_reason: "withdrawn" }]) {
    const f = fixture(); Object.assign(f.household, patch);
    assert.equal((await f.correct()).bwq_task_created, false);
  }
});

test("legacy sex correction supports enrolled imported and seeded household cohort states", async () => {
  for (const cohort_status of [null, "active", "listed", "enrolled"]) {
    const f = fixture(); Object.assign(f.household, { cohort_status });
    assert.equal((await f.correct()).bwq_task_created, true, String(cohort_status));
    assert.equal(f.rows.get(schema.followUpTasks)!.length, 1);
  }
});

test("existing WQ in any state, primary evidence and woman's advanced state prevent new baseline work", async () => {
  for (const status of ["planned", "completed_on_time", "cancelled", "superseded"]) {
    const f = fixture(); f.rows.set(schema.followUpTasks, [{ task_type: "WQ", status }]);
    const result = await f.correct();
    assert.equal(result.bwq_task_created, false); assert.equal(result.bwq_task_exists, true);
    assert.equal(f.rows.get(schema.followUpTasks)![0].status, status);
  }
  const f = fixture(); f.rows.set(schema.formResponses, [{ form_code: "WQ", response_status: "primary" }]);
  assert.equal((await f.correct()).bwq_task_created, false);
  for (const state of [{ wq_status: "completed" }, { tracking_status: "terminated" }, { current_eligibility_status: "deceased" }]) {
    const f = fixture();
    const woman = { woman_id: f.member.household_member_id, wq_status: "pending", tracking_status: "not_tracked",
      current_eligibility_status: "eligible", ...state };
    f.rows.set(schema.eligibleWomen, [woman]);
    assert.equal((await f.correct()).bwq_task_created, false);
    assert.deepEqual(f.rows.get(schema.eligibleWomen), [woman]);
    assert.ok(!f.writes.includes(schema.eligibleWomen));
  }
});

test("task write failure rolls back corrected projection, parent timestamp, woman and both audits", async () => {
  const f = fixture(); f.fail(schema.followUpTasks);
  await assert.rejects(f.correct(), /injected write failure/);
  assert.equal(f.rows.get(schema.householdMembers)![0].sex, 1);
  assert.equal(f.rows.get(schema.households)![0].updated_at, undefined);
  for (const table of [schema.eligibleWomen, schema.adminCorrections, schema.adminCorrectionEvents, schema.followUpTasks, schema.domainEvents]) {
    assert.equal(f.rows.get(table)!.length, 0);
  }
});
