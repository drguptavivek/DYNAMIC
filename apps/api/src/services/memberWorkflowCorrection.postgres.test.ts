import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { schema } from "../db";
import { runWithDb } from "../lib/dbContext";
import { applyMemberWorkflowCorrection, getMemberCorrectionContext, previewMemberWorkflowCorrection } from "./memberWorkflowCorrection";

const url = process.env.MEMBER_CORRECTION_TEST_DATABASE_URL;
test("generic corrections use locked real transactions, preserve evidence and reconcile only approved current work", { skip: !url }, async () => {
  const target = new URL(url!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.equal(target.pathname, "/member_correction_test");
  const pool = new Pool({ connectionString: url, max: 5 }), database = drizzle(pool, { schema });
  const run = randomUUID(), manager = `workflow-manager-${run}`, foreign = `workflow-foreign-${run}`, worker = `workflow-worker-${run}`;
  const householdIds: string[] = [], memberIds: string[] = [];
  let sequence = Math.floor(Math.random() * 70000) + 20000;
  const call = <T>(work: () => Promise<T>) => runWithDb(database, work);
  const preview = (id: string, changes: Record<string, number>, actor = manager) => call(() => previewMemberWorkflowCorrection(id, actor, { changes, reason: "Verified synthetic correction" }));
  const apply = (id: string, changes: Record<string, number>, token: string) => call(() => applyMemberWorkflowCorrection(id, manager, { changes, reason: "Verified synthetic correction", preview_token: token }));
  const member = async (id: string) => (await database.select().from(schema.householdMembers).where(eq(schema.householdMembers.household_member_id, id)))[0];
  const tasks = (id: string) => database.select().from(schema.followUpTasks).where(eq(schema.followUpTasks.subject_id, id));
  async function fixture(overrides: Record<string, unknown> = {}) {
    const structure = String(++sequence), household = `2-39-${structure}-01`, id = `${household}-01`;
    householdIds.push(household); memberIds.push(id);
    await database.insert(schema.households).values({ household_id: household, site_id: 2, locality_code: "39", structure_map_id: structure,
      household_number: "01", baseline_completed_date: "2026-11-01", baseline_enrollment_status: "enrolled", cohort_status: "active" });
    await database.insert(schema.householdMembers).values({ household_member_id: id, household_id: household, member_number: 1, site_id: 2,
      locality_code: "39", name: "Synthetic member", sex: 1, reported_age_years: 28, marital_status: 1, usual_resident: true,
      member_status: "active", date_of_birth: "1998-01-01", date_of_birth_precision: "inferred_from_age", reported_age_as_of_date: "2026-11-01", ...overrides });
    await database.insert(schema.fieldWorkerHouseholdAssignments).values({ assignment_id: randomUUID(), household_id: household, user_id: worker, assigned_by_user_id: manager, assigned_at: new Date(), updated_at: new Date() });
    const evidence = { hhq_household_members: [{ member_name: "Synthetic member", member_sex: 1, member_age_years: 28 }] };
    await database.insert(schema.formResponses).values({ form_response_id: randomUUID(), response_id: randomUUID(), household_id: household,
      site_id: 2, locality_code: "39", form_code: "HHQ", form_version: "fixture", answers_json: evidence });
    return { id, household, evidence };
  }
  try {
    await database.insert(schema.users).values([{ user_id: manager, username: manager, role: "site_data_manager", site_id: 2, password_hash: "fixture" },
      { user_id: foreign, username: foreign, role: "site_data_manager", site_id: 4, password_hash: "fixture" },
      { user_id: worker, username: worker, role: "field_worker", site_id: 2, password_hash: "fixture" }]);
    const first = await fixture();
    const context = await call(() => getMemberCorrectionContext(first.id, manager));
    assert.equal(context.fields.length, 4); assert.equal(context.source_response_id, null);
    assert.equal(context.fields.find(f => f.key === "wq_pregnant")!.editable, false);
    await assert.rejects(preview(first.id, { sex: 2 }, foreign), /outside/);
    const before = await preview(first.id, { sex: 2 }); assert.equal(before.can_apply, true);
    const corrected = await apply(first.id, { sex: 2 }, before.preview_token);
    assert.equal(corrected.created_tasks, 1); assert.equal(corrected.withdrawn_tasks, 0);
    assert.equal((await member(first.id)).sex, 2);
    assert.deepEqual((await tasks(first.id)).map(t => t.form_code), ["WQ"]);
    assert.equal((await database.select().from(schema.fieldWorkerHouseholdAssignments).where(eq(schema.fieldWorkerHouseholdAssignments.household_id, first.household))).length, 1);
    assert.deepEqual((await database.select().from(schema.formResponses).where(eq(schema.formResponses.household_id, first.household)))[0].answers_json, first.evidence);
    await assert.rejects(apply(first.id, { sex: 2 }, before.preview_token), /Refresh and preview/);
    const baselineTaskId = (await tasks(first.id))[0].task_id;
    const younger = await preview(first.id, { reported_age_years: 10 }); assert.equal(younger.can_apply, true);
    assert.equal(younger.tasks_to_withdraw.length, 1);
    await apply(first.id, { reported_age_years: 10 }, younger.preview_token);
    assert.equal((await member(first.id)).date_of_birth, "2016-01-01");
    assert.equal((await tasks(first.id))[0].status, "superseded");
    const restored = await preview(first.id, { reported_age_years: 28 }); assert.equal(restored.tasks_to_create.length, 1);
    await apply(first.id, { reported_age_years: 28 }, restored.preview_token);
    assert.equal((await tasks(first.id))[0].task_id, baselineTaskId);
    assert.equal((await tasks(first.id))[0].status, "planned");

    const childAge = await fixture({sex:2,reported_age_years:10,date_of_birth:"2016-01-01"});
    const adultPreview=await preview(childAge.id,{reported_age_years:20});
    assert.equal(adultPreview.can_apply,true);assert.deepEqual(adultPreview.tasks_to_create.map(t=>t.form_code),["WQ"]);
    assert.equal((await member(childAge.id)).reported_age_years,10,"preview does not modify member data");assert.equal((await tasks(childAge.id)).length,0);
    await apply(childAge.id,{reported_age_years:20},adultPreview.preview_token);
    assert.equal((await member(childAge.id)).date_of_birth,"2006-01-01");assert.equal((await tasks(childAge.id)).length,1);

    const competing = await fixture(); const samePreview = await preview(competing.id, { sex: 2 });
    const competingResults = await Promise.allSettled([apply(competing.id, { sex: 2 }, samePreview.preview_token), apply(competing.id, { sex: 2 }, samePreview.preview_token)]);
    assert.equal(competingResults.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await tasks(competing.id)).length, 1);

    const woman = await fixture({ sex: 2 });
    await database.insert(schema.eligibleWomen).values({ woman_id: woman.id, household_member_id: woman.id, household_id: woman.household,
      site_id: 2, locality_code: "39", eligibility_start_date: "2026-11-01", wq_status: "completed", tracking_status: "not_pregnant" });
    const sourceId = randomUUID(), sourceTask = randomUUID();
    await database.insert(schema.followUpTasks).values({ task_id: sourceTask, task_key: `fixture-${sourceTask}`, site_id: 2, locality_code: "39", household_id: woman.household,
      subject_type: "person", subject_id: woman.id, woman_id: woman.id, form_code: "WQ", task_type: "WQ", generation_source: "fixture", target_date: "2026-11-02", status: "completed" });
    const rawBwq = { wq_pregnant: 2, wq_interview_date: "2026-11-02", wq_woman_available: 1 };
    await database.insert(schema.formResponses).values({ form_response_id: sourceId, response_id: randomUUID(), site_id: 2, locality_code: "39", household_id: woman.household,
      subject_type: "woman", subject_id: woman.id, task_id: sourceTask, form_code: "WQ", form_version: "fixture", response_status: "primary", answers_json: rawBwq, created_offline_at: new Date("2026-11-02T10:00Z") });
    const pregnancy = await preview(woman.id, { wq_pregnant: 1 }); assert.equal(pregnancy.can_apply, true);
    assert.ok(pregnancy.tasks_to_create.some(t => t.form_code === "PEF")); assert.ok(pregnancy.tasks_to_create.some(t => t.form_code === "PSF"));
    await apply(woman.id, { wq_pregnant: 1 }, pregnancy.preview_token);
    assert.equal((await call(() => getMemberCorrectionContext(woman.id, manager))).current.wq_pregnant, 1);
    assert.equal((await database.select().from(schema.eligibleWomen).where(eq(schema.eligibleWomen.woman_id,woman.id)))[0].tracking_status,"enrolled");
    assert.deepEqual((await database.select().from(schema.formResponses).where(eq(schema.formResponses.form_response_id, sourceId)))[0].answers_json, rawBwq);
    const work = await tasks(woman.id), pef = work.find(t => t.form_code === "PEF")!;
    assert.equal(pef.target_date, "2026-11-02"); assert.ok(pef.pregnancy_id);
    const notPregnant = await preview(woman.id, { wq_pregnant: 2 });
    assert.deepEqual(notPregnant.tasks_to_withdraw.map(t => t.form_code), ["PEF"]);
    await apply(woman.id, { wq_pregnant: 2 }, notPregnant.preview_token);
    assert.ok((await tasks(woman.id)).filter(t => t.form_code === "PSF").every(t => t.status === "planned"));
    assert.equal((await call(() => getMemberCorrectionContext(woman.id, manager))).current.wq_pregnant, 2);
    assert.equal((await database.select().from(schema.eligibleWomen).where(eq(schema.eligibleWomen.woman_id,woman.id)))[0].tracking_status,"not_pregnant");

    const stale = await preview(woman.id, { wq_pregnant: 1 });
    await database.update(schema.followUpTasks).set({ status: "completed", completed_at: new Date() }).where(eq(schema.followUpTasks.task_id, pef.task_id));
    await assert.rejects(apply(woman.id, { wq_pregnant: 1 }, stale.preview_token), /Refresh and preview/);
    const clinical = await preview(woman.id, { wq_pregnant: 1 }); assert.equal(clinical.can_apply, false);

    const advanced=await fixture({sex:2});
    await database.insert(schema.eligibleWomen).values({woman_id:advanced.id,household_member_id:advanced.id,household_id:advanced.household,site_id:2,locality_code:"39",wq_status:"completed",tracking_status:"not_pregnant",current_eligibility_status:"not_eligible"});
    await database.insert(schema.formResponses).values({form_response_id:randomUUID(),response_id:randomUUID(),site_id:2,locality_code:"39",household_id:advanced.household,subject_type:"woman",subject_id:advanced.id,form_code:"WQ",form_version:"fixture",response_status:"primary",answers_json:{wq_pregnant:1,wq_interview_date:"2026-11-02"},created_offline_at:new Date("2026-11-02T10:00Z")});
    await database.insert(schema.pregnancies).values({pregnancy_id:`advanced-${run}`,woman_id:advanced.id,household_member_id:advanced.id,household_id:advanced.household,site_id:2,locality_code:"39",pregnancy_sequence:1,pregnancy_status:"closed",detected_date:"2026-11-02",enrollment_date:"2026-11-03",outcome_recorded_date:"2026-11-05"});
    const beforeWoman=(await database.select().from(schema.eligibleWomen).where(eq(schema.eligibleWomen.woman_id,advanced.id)))[0];
    const beforePregnancy=(await database.select().from(schema.pregnancies).where(eq(schema.pregnancies.woman_id,advanced.id)))[0];
    const demographic=await preview(advanced.id,{reported_age_years:29});assert.equal(demographic.can_apply,true);assert.equal(demographic.tasks_to_create.length,0);
    await apply(advanced.id,{reported_age_years:29},demographic.preview_token);
    assert.deepEqual((await database.select().from(schema.eligibleWomen).where(eq(schema.eligibleWomen.woman_id,advanced.id)))[0],beforeWoman,"demographic-only correction must preserve later surveillance stop state");
    assert.deepEqual((await database.select().from(schema.pregnancies).where(eq(schema.pregnancies.woman_id,advanced.id)))[0],beforePregnancy,"demographic-only correction must not reopen completed pregnancy");

    const rollback = await fixture(); const rollbackPreview = await preview(rollback.id, { sex: 2 });
    await pool.query(`create function fail_workflow_correction_${sequence}() returns trigger language plpgsql as $$ begin if NEW.entity_id = '${rollback.id}' then raise exception 'synthetic rollback'; end if; return NEW; end $$`);
    await pool.query(`create trigger fail_workflow_correction_${sequence} before insert on admin_corrections for each row execute function fail_workflow_correction_${sequence}()`);
    try { await assert.rejects(apply(rollback.id, { sex: 2 }, rollbackPreview.preview_token), error => String((error as {cause?:Error}).cause?.message).includes("synthetic rollback")); }
    finally { await pool.query(`drop trigger fail_workflow_correction_${sequence} on admin_corrections`); await pool.query(`drop function fail_workflow_correction_${sequence}()`); }
    assert.equal((await member(rollback.id)).sex, 1); assert.equal((await tasks(rollback.id)).length, 0);
  } finally {
    if (householdIds.length) {
      await database.delete(schema.questionnaireDrafts).where(inArray(schema.questionnaireDrafts.household_id, householdIds));
      await database.delete(schema.formResponses).where(inArray(schema.formResponses.household_id, householdIds));
      await database.delete(schema.followUpTasks).where(inArray(schema.followUpTasks.household_id, householdIds));
      await database.delete(schema.domainEvents).where(inArray(schema.domainEvents.household_id, householdIds));
      await database.delete(schema.pregnancies).where(inArray(schema.pregnancies.household_id, householdIds));
      await database.delete(schema.eligibleWomen).where(inArray(schema.eligibleWomen.household_id, householdIds));
      await database.delete(schema.adminCorrectionEvents).where(inArray(schema.adminCorrectionEvents.subject_id, memberIds));
      await database.delete(schema.adminCorrections).where(inArray(schema.adminCorrections.entity_id, memberIds));
      await database.delete(schema.fieldWorkerHouseholdAssignments).where(inArray(schema.fieldWorkerHouseholdAssignments.household_id, householdIds));
      await database.delete(schema.householdMembers).where(inArray(schema.householdMembers.household_id, householdIds));
      await database.delete(schema.households).where(inArray(schema.households.household_id, householdIds));
    }
    await database.delete(schema.users).where(inArray(schema.users.user_id, [manager, foreign, worker]));
    await pool.end();
  }
});
