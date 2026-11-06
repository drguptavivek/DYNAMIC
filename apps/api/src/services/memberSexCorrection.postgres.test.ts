import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { schema } from '../db';
import { runWithDb } from '../lib/dbContext';
import { correctMemberSex } from './memberSexCorrection';

const url=process.env.MEMBER_CORRECTION_TEST_DATABASE_URL;
test('member sex repair uses real PostgreSQL transactions, preserves evidence and serializes competing corrections', {skip:!url}, async()=>{
 const target=new URL(url!);
 assert.ok(['127.0.0.1','localhost'].includes(target.hostname));
 assert.equal(target.pathname,'/member_correction_test','Use only a dedicated disposable test database');
 const pool=new Pool({connectionString:url,max:6});
 const database=drizzle(pool,{schema});
 const runId=randomUUID();
 const manager=`manager-${runId}`,foreign=`foreign-${runId}`,worker=`worker-${runId}`;
 const payload={field:'sex',old_value:1,new_value:2,reason:'Verified test correction'};
 let n=Math.floor(Math.random()*80000)+10000;
 async function fixture(overrides:Record<string,unknown>={}) {
  const structure=String(++n),household=`2-39-${structure}-01`,id=`${household}-01`;
  await database.insert(schema.households).values({household_id:household,site_id:2,locality_code:'39',structure_map_id:structure,household_number:'01',baseline_enrollment_status:'enrolled',baseline_completed_date:'2026-11-01',cohort_status:'active',updated_at:new Date('2026-11-01T00:00Z')});
  await database.insert(schema.householdMembers).values({household_member_id:id,household_id:household,member_number:1,site_id:2,locality_code:'39',name:'Synthetic member',sex:1,reported_age_years:28,marital_status:1,member_status:'active',usual_resident:true,...overrides});
  await database.insert(schema.householdMembers).values({household_member_id:`${household}-02`,household_id:household,member_number:2,site_id:2,locality_code:'39',name:'Unchanged member',sex:1,reported_age_years:30,marital_status:1});
  await database.insert(schema.fieldWorkerHouseholdAssignments).values({assignment_id:randomUUID(),user_id:worker,household_id:household,assigned_by_user_id:manager,assigned_at:new Date(),updated_at:new Date()});
  const raw={hhq_household_members:[{member_name:'Synthetic member',member_sex:1,member_age_years:28}]};
  await database.insert(schema.formResponses).values({form_response_id:randomUUID(),response_id:randomUUID(),site_id:2,locality_code:'39',household_id:household,form_code:'HHQ',form_version:'test',answers_json:raw});
  return {household,id,raw};
 }
 const correct=(id:string,actor=manager)=>runWithDb(database,()=>correctMemberSex(id,actor,payload));
 const member=async(id:string)=>(await database.select().from(schema.householdMembers).where(eq(schema.householdMembers.household_member_id,id)))[0];
 const tasks=async(id:string)=>database.select().from(schema.followUpTasks).where(eq(schema.followUpTasks.subject_id,id));
 const audits=async(id:string)=>database.select().from(schema.adminCorrections).where(eq(schema.adminCorrections.entity_id,id));
 try {
  await database.insert(schema.users).values([{user_id:manager,username:manager,role:'site_data_manager',site_id:2,password_hash:'fixture'}, {user_id:foreign,username:foreign,role:'site_data_manager',site_id:4,password_hash:'fixture'}, {user_id:worker,username:worker,role:'field_worker',site_id:2,password_hash:'fixture'}]);
  const first=await fixture();
  const result=await correct(first.id);
  assert.equal(result.bwq_task_created,true);assert.equal(result.woman_questionnaire_eligible,true);
  assert.equal((await member(first.id)).sex,2);assert.equal((await member(first.id)).woman_questionnaire_eligible,true);
  const created=await tasks(first.id);assert.equal(created.length,1);assert.equal(created[0].form_code,'WQ');assert.equal(created[0].woman_id,first.id);
  assert.equal((await audits(first.id)).length,1);
  assert.equal((await database.select().from(schema.adminCorrectionEvents).where(eq(schema.adminCorrectionEvents.subject_id,first.id))).length,1);
  assert.equal((await database.select().from(schema.domainEvents).where(eq(schema.domainEvents.event_id,created[0].source_event_id!))).length,1);
  assert.equal((await member(`${first.household}-02`)).sex,1);
  assert.equal((await database.select().from(schema.fieldWorkerHouseholdAssignments).where(eq(schema.fieldWorkerHouseholdAssignments.household_id,first.household))).length,1);
  assert.deepEqual((await database.select().from(schema.formResponses).where(eq(schema.formResponses.household_id,first.household)))[0].answers_json,first.raw);
  await assert.rejects(correct(first.id),/refresh before correcting/);assert.equal((await tasks(first.id)).length,1);

  const competing=await fixture();
  const outcomes=await Promise.allSettled([correct(competing.id),correct(competing.id)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1,'competing saves serialize with exactly one success');
  assert.equal((await tasks(competing.id)).length,1);assert.equal((await audits(competing.id)).length,1);

  const alongsideBHQ=await fixture();
  const ingestion=await pool.connect();
  let pendingCorrection: ReturnType<typeof correct> | undefined;
  try {
   await ingestion.query('BEGIN');
   await ingestion.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`form-opportunity|HHQ|${alongsideBHQ.household}`]);
   await ingestion.query('select household_id from households where household_id=$1 for update',[alongsideBHQ.household]);
   pendingCorrection=correct(alongsideBHQ.id);
   await new Promise(done=>setTimeout(done,80));
   await ingestion.query("set local statement_timeout='3s'");
   await ingestion.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`woman-pathway|${alongsideBHQ.household}|${alongsideBHQ.id}`]);
   await ingestion.query('COMMIT');
   assert.equal((await pendingCorrection).bwq_task_created,true,'correction must not invert BHQ ingestion locks');
  } finally {await ingestion.query('ROLLBACK');ingestion.release();await pendingCorrection?.catch(()=>{});}

  const outside=await fixture();await assert.rejects(correct(outside.id,foreign),/scope/);assert.equal((await member(outside.id)).sex,1);assert.equal((await audits(outside.id)).length,0);
  await assert.rejects(correct(outside.id,worker),/cannot correct/);assert.equal((await member(outside.id)).sex,1);
  for(const overrides of [{reported_age_years:17},{reported_age_years:50},{marital_status:7},{usual_resident:false},{member_status:'deceased'}]) {
   const f=await fixture(overrides);const r=await correct(f.id);assert.equal(r.bwq_task_created,false);assert.equal((await tasks(f.id)).length,0);assert.equal((await member(f.id)).sex,2);
  }
  const completed=await fixture();
  await database.insert(schema.eligibleWomen).values({woman_id:completed.id,household_member_id:completed.id,household_id:completed.household,site_id:2,locality_code:'39',wq_status:'completed',tracking_status:'tracking',current_eligibility_status:'eligible'});
  await database.insert(schema.followUpTasks).values({task_id:randomUUID(),task_key:randomUUID(),site_id:2,locality_code:'39',household_id:completed.household,subject_type:'woman',subject_id:completed.id,woman_id:completed.id,task_type:'WQ',form_code:'WQ',generation_source:'fixture',target_date:'2026-11-01',status:'completed'});
  const kept=await correct(completed.id);assert.equal(kept.bwq_task_created,false);assert.equal(kept.bwq_task_exists,true);
  assert.equal((await tasks(completed.id)).length,1);assert.equal((await tasks(completed.id))[0].status,'completed');
  assert.equal((await database.select().from(schema.eligibleWomen).where(eq(schema.eligibleWomen.woman_id,completed.id)))[0].tracking_status,'tracking');

  const rollback=await fixture();
  await database.execute(sql.raw(`create function member_correction_test_fail() returns trigger language plpgsql as $$ begin raise exception 'forced task persistence failure'; end $$`));
  await database.execute(sql.raw('create trigger member_correction_test_fail before insert on follow_up_tasks for each row execute function member_correction_test_fail()'));
  try {await assert.rejects(correct(rollback.id));} finally {
   await database.execute(sql.raw('drop trigger member_correction_test_fail on follow_up_tasks'));
   await database.execute(sql.raw('drop function member_correction_test_fail()'));
  }
  assert.equal((await member(rollback.id)).sex,1,'failed task write rolls back member sex');
  assert.equal((await member(rollback.id)).woman_questionnaire_eligible,false);
  assert.equal((await tasks(rollback.id)).length,0);assert.equal((await audits(rollback.id)).length,0);
  assert.equal((await database.select().from(schema.eligibleWomen).where(eq(schema.eligibleWomen.household_member_id,rollback.id))).length,0);
 } finally {await pool.end();}
});
