import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { dashboardScope, dashboardSql, assembleDashboard, assignedHouseholdsSql } from "./operationsDashboard";
import type { JwtPayload } from "./jwt";

const url = process.env.DASHBOARD_TEST_DATABASE_URL;
test("dashboard aggregates real PostgreSQL fixtures without cross-site leaks or shared-household multiplication", { skip: !url }, async () => {
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(url!).hostname), "Use an isolated local test database");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`begin;
      create temp table users(user_id text,username text,display_name text,role text,active boolean,site_id int);
      create temp table study_sites(site_id int,site_name text);
      create temp table study_localities(site_id int,locality_code text,locality_name text);
      create temp table user_area_assignments(user_id text,site_id int,locality_code text,active_from date,active_to date);
      create temp table households(household_id text,site_id int,locality_code text);
      create temp table field_worker_household_assignments(user_id text,household_id text);
      create temp table form_responses(form_response_id text,submitted_by_user_id text,site_id int,locality_code text,form_code text,response_status text,created_offline_at timestamptz,synced_at timestamptz,created_at timestamptz,task_id text);
      create temp table questionnaire_drafts(draft_id text,user_id text,site_id int,locality_code text,draft_status text,task_id text,server_updated_at timestamptz);
      create temp table follow_up_tasks(task_id text,household_id text,site_id int,locality_code text,status text,action_state text,form_availability text,form_code text,window_start date,target_date date,deadline_date date);
      create temp table sync_logs(sync_log_id text,user_id text,started_at timestamptz,completed_at timestamptz,status text,conflicts_detected int);
      create temp table data_quality_flags(site_id int,status text,subject_id text,task_id text);
      create temp table household_members(site_id int,locality_code text);
      create temp table eligible_women(site_id int,locality_code text,wq_status text,tracking_status text);
      create temp table pregnancies(site_id int,locality_code text,pregnancy_status text);
      create temp table children(household_id text);
      insert into study_sites values(2,'Ballabhgarh'),(4,'Chennai');
      insert into study_localities values(2,'20','Bukharpur'),(4,'04','Chennai East'),(4,'05','Chennai West');
      insert into users values('cw','ch-worker','Chennai worker','field_worker',true,4),('co','ch-other','Other worker','field_worker',true,4),('cz','ch-zero','Zero activity','field_worker',true,4),('cm','ch-manager','Manager','site_data_manager',true,4),('bw','blb-worker','Ballabhgarh worker','field_worker',true,2);
      insert into user_area_assignments values('cw',4,'04',null,null),('co',4,'04',null,null),('cz',4,'05',null,null),('bw',2,'20',null,null);
      insert into households values('c1',4,'04'),('c2',4,'05'),('b1',2,'20');
      insert into field_worker_household_assignments values('cw','c1'),('co','c1'),('cw','c2'),('bw','b1');
      insert into form_responses values
      ('f1','cw',4,'04','HHQ','primary','2026-10-20 18:30Z','2026-10-21 10:00Z',null,'done'),
      ('f2','cw',4,'04','WQ','primary','2026-10-21 18:29:59Z','2026-10-22 10:00Z',null,null),
      ('f3','cw',4,'04','WQ','duplicate','2026-10-21 10:00Z','2026-10-21 10:00Z',null,null),
      ('f4','cw',4,'04','PEF','primary','2026-10-21 18:30Z','2026-10-21 18:30Z',null,null),
      ('f5','bw',2,'20','PEF','primary','2026-10-21 10:00Z','2026-10-21 10:00Z',null,null),
      ('f6',null,4,'04','HHQ','primary','2026-10-21 10:00Z','2026-10-21 10:00Z',null,null);
      insert into questionnaire_drafts values('d1','cw',4,'04','active','open','2026-10-21 10:30Z'),('d2','cw',4,'04','active','done','2026-10-21 10:30Z'),('d3','bw',2,'20','active','blb-open','2026-10-21 10:30Z');
      insert into follow_up_tasks values
      ('t1','c1',4,'04','planned','pending','available','HHQ',null,'2026-10-20',null),
      ('t2','c2',4,'05','due','enabled','available','PEF','2026-10-21','2026-10-21','2026-10-23'),
      ('t3','c1',4,'04','completed','enabled','available','WQ',null,'2026-10-20',null),
      ('t4','c1',4,'04','planned','disabled','available','WQ',null,'2026-10-20',null),
      ('t5','b1',2,'20','due','enabled','available','WQ',null,'2026-10-20',null);
      insert into sync_logs values
      ('s1','cw','2026-10-21 10:00Z','2026-10-21 10:01Z','partial_success',1),
      ('s2','bw','2026-10-21 10:00Z','2026-10-21 10:02Z','failed',0),
      ('s3','cw','2026-10-21 10:00Z','2026-10-21 10:03Z','error',0),
      ('s4','cw','2026-10-21 10:00Z','2026-10-21 10:04Z','success',2),
      ('s5','bw','2026-10-21 10:00Z','2026-10-21 10:05Z','success',3),
      ('s6','co','2026-10-21 10:00Z','2026-10-21 10:06Z','success',0),
      ('s7','co','2026-10-21 10:00Z','2026-10-21 10:07Z','success',1);
      insert into data_quality_flags values(4,'open','c1',null),(2,'open','b1',null);
      insert into household_members values(4,'04'),(4,'05'),(2,'20');
      insert into eligible_women values(4,'04','completed','active'),(4,'05','completed','not_tracked'),(2,'20','completed','active');
      insert into pregnancies values(4,'04','active'),(4,'05','enrolled'),(4,'04','closed'),(2,'20','active');
      insert into children values('c1'),('b1');
      alter table questionnaire_drafts add column form_code text default 'HHQ';
      update questionnaire_drafts set form_code='WQ' where draft_id='d1';
      insert into form_responses values
        ('f7','cw',4,'04','HHQ','primary','2026-10-19 10:00Z','2026-10-19 11:00Z',null,null),
        ('f8','cw',4,'04','WQ','primary','2026-10-22 10:00Z','2026-10-22 11:00Z',null,null);
      alter table data_quality_flags add column subject_type text default 'household',add column primary_response_id text,add column duplicate_response_id text;
      alter table pregnancies add column pregnancy_id text,add column household_id text;
      alter table household_members add column household_member_id text,add column household_id text;
      alter table eligible_women add column woman_id text,add column household_id text;
      alter table children add column child_id text;
      update pregnancies set pregnancy_id='preg-c',household_id='c1' where site_id=4 and locality_code='04' and pregnancy_status='active';
      update pregnancies set pregnancy_id='preg-b',household_id='b1' where site_id=2;
      update household_members set household_member_id='member-c',household_id='c2' where site_id=4 and locality_code='05';
      update eligible_women set woman_id='woman-c',household_id='c2' where site_id=4 and locality_code='05';
      update children set child_id='child-c' where household_id='c1';
      insert into data_quality_flags(site_id,status,subject_id,subject_type,primary_response_id) values
        (4,'open','preg-c','pregnancy',null),(2,'open','preg-b','pregnancy',null),
        (4,'open','unknown','form_response','f2'),(4,'open','member-c','person',null),
        (4,'open','woman-c','woman',null),(4,'open','child-c','child',null);`);
    const user = (role: JwtPayload["role"], site_id: number | null): JwtPayload => ({ sub: "cm", username: "manager", role, site_id, type: "access" });
    async function load(identity: JwtPayload, query: Record<string, unknown>) {
      const scope = dashboardScope(identity, { date: "2026-10-21", ...query }, new Date("2026-10-21T12:00:00Z"));
      const queries = dashboardSql(scope);
      const run = async (statement: typeof queries.roster) => {
        const compiled = new PgDialect().sqlToQuery(statement);
        return (await client.query(compiled.sql, compiled.params)).rows;
      };
      return assembleDashboard(scope, await run(queries.roster), await run(queries.facts), await run(queries.options), (await run(queries.quality))[0], (await run(queries.cohort))[0], await run(queries.staff_options));
    }
    const chennai = await load(user("site_data_manager",4),{site_id:2});
    assert.equal(chennai.scope.site_id,4);
    assert.ok(chennai.users.every(row=>row.site_id===4));
    assert.ok(chennai.sites.every(row=>row.site_id===4));
    assert.equal(chennai.users.length,4,"include management and zero-activity users");
    assert.equal(chennai.totals.assigned_households,2,"shared households count once in totals");
    assert.equal(chennai.totals.pending_tasks,2,"shared tasks count once in totals");
    const worker=chennai.users.find(row=>row.user_id==="cw")!;
    assert.equal(worker.forms_completed,2,"IST boundaries and primary-only counts");
    assert.deepEqual(worker.forms_by_code,{HHQ:1,WQ:1});
    assert.equal(worker.forms_received,1,"late receipt is distinct from completion");
    assert.equal(worker.backed_up_drafts,1,"exclude stale active backup for completed task");
    assert.equal(worker.pending_tasks,2);
    assert.equal(worker.overdue_tasks,1);
    assert.equal(worker.sync_errors,2,"count error and partial success, excluding successful repeat uploads");
    assert.equal(chennai.users.find(row=>row.user_id==="co")!.sync_errors,0,"successful syncs with or without repeat uploads are not issues");
    assert.equal(chennai.totals.sync_errors,2);
    assert.equal(chennai.sites_summary.find(row=>row.site_id===4)!.sync_errors,2);
    assert.equal(chennai.totals.unattributed_forms,1,"do not guess historical submitter");
    assert.equal(chennai.totals.open_data_quality_flags,6);
    assert.deepEqual(chennai.cohort,{households:2,members:2,eligible_women:2,tracking_eligible_women:1,active_pregnancies:2,children:1});
    assert.equal(chennai.users.find(row=>row.user_id==="co")!.pending_tasks,1);
    assert.equal(chennai.users.find(row=>row.user_id==="cz")!.forms_completed,0);
    const central=await load(user("central_admin",null),{});
    assert.equal(central.totals.assigned_households,3);
    assert.equal(central.totals.forms_completed,3);
    assert.equal(central.totals.sync_errors,3,"retain error, failed and partial success only across sites");
    assert.equal(central.users.find(row=>row.user_id==="bw")!.sync_errors,1);
    assert.equal(central.sites_summary.find(row=>row.site_id===2)!.sync_errors,1);
    assert.equal(central.sites_summary.find(row=>row.site_id===4)!.sync_errors,2);
    const ballabhgarh=await load(user("site_data_manager",2),{});
    assert.equal(ballabhgarh.totals.sync_errors,1,"site dashboards also exclude successful repeat uploads");
    assert.equal(central.users.length,5);
    assert.equal(central.cohort.households,3);
    assert.equal(central.cohort.children,2);
    assert.equal(central.totals.open_data_quality_flags,8);
    const village=await load(user("site_data_manager",4),{locality_code:"04"});
    assert.equal(village.totals.assigned_households,1);
    assert.equal(village.totals.pending_tasks,1);
    assert.equal(village.totals.forms_completed,2);
    assert.equal(village.cohort.households,1);
    assert.equal(village.cohort.active_pregnancies,1);
    assert.equal(village.totals.open_data_quality_flags,4,"resolve pregnancy, child and response flags without task links");
    const west=await load(user("site_data_manager",4),{locality_code:"05"});
    assert.equal(west.totals.open_data_quality_flags,2,"resolve person and woman flags in the other village");
    assert.ok(village.users.every(row=>row.user_id!=="bw"));
    const all = await load(user("site_data_manager",4),{period:"all"});
    assert.equal(all.totals.forms_completed,3,"all-time includes earlier forms and excludes tomorrow's submissions");
    assert.equal(all.totals.forms_today,2,"today stays independent of all-time period");
    const onlyWorker = await load(user("site_data_manager",4),{period:"all",user_id:"cw",form_code:"WQ"});
    assert.equal(onlyWorker.users.length,1);
    assert.equal(onlyWorker.totals.forms_completed,1);
    assert.equal(onlyWorker.totals.forms_today,1);
    assert.equal(onlyWorker.totals.backed_up_drafts,1);
    assert.equal(onlyWorker.totals.pending_tasks,0,"form filter also restricts tasks");
    assert.equal(onlyWorker.totals.unattributed_forms,0,"unattributed records cannot be assigned to selected user");
    assert.equal(onlyWorker.staff_options.length,4,"staff picker does not collapse to selected worker");
    const foreignWorker = await load(user("site_data_manager",4),{period:"all",user_id:"bw",site_id:2});
    assert.equal(foreignWorker.users.length,0,"foreign user cannot widen own-site scope");
    assert.equal(foreignWorker.totals.forms_completed,0);
    assert.ok(foreignWorker.staff_options.every(row=>row.site_id===4));
    const searched = await load(user("site_data_manager",4),{period:"all",search:" CH-WORKER "});
    assert.equal(searched.users.length,1);
    assert.equal(searched.totals.forms_completed,3,"search applies to aggregates, not just rendered rows");
    assert.equal(searched.totals.assigned_households,2);
    const literal = await load(user("site_data_manager",4),{period:"all",search:"%"});
    assert.equal(literal.users.length,0,"SQL wildcards are treated literally");
    const futureCode = await load(user("site_data_manager",4),{period:"all",form_code:"FUTURE_1"});
    assert.equal(futureCode.totals.forms_completed,0,"safe unknown form codes return empty metrics");
    const past = await load(user("site_data_manager",4),{period:"date",date:"2026-10-19"});
    assert.equal(past.totals.forms_completed,1);
    assert.equal(past.totals.forms_today,2,"today is shown beside historical daily activity");

    const today = await load(user("site_data_manager",4),{period:"today"});
    assert.equal(today.totals.forms_completed,2);
    const range = await load(user("site_data_manager",4),{period:"range",date:undefined,date_from:"2026-10-19",date_to:"2026-10-21"});
    assert.equal(range.totals.forms_completed,3,"range includes both endpoints but excludes the following IST midnight");
    const sameDay = await load(user("site_data_manager",4),{period:"range",date:undefined,date_from:"2026-10-21",date_to:"2026-10-21"});
    assert.equal(sameDay.totals.forms_completed,chennai.totals.forms_completed);
    const nextDay = await load(user("site_data_manager",4),{period:"range",date:undefined,date_from:"2026-10-21",date_to:"2026-10-22"});
    assert.equal(nextDay.totals.forms_completed,4,"next day's forms enter only when end date includes them");
    assert.deepEqual(chennai.localities_summary.find(l=>l.locality_code==='05')!.assigned_users.map(u=>u.user_id).sort(),['cw','cz'],"household-only and area assignments both name current workers");
    await client.query(`insert into study_localities values(4,'06','Zero village');
      insert into users values('moved','moved-worker','Moved worker','field_worker',true,2);
      insert into form_responses values('historical','moved',4,'05','FUTURE_1','primary','2026-10-19 10:00Z','2026-10-19 11:00Z',null,null);
      insert into field_worker_household_assignments values('co','c2');
      insert into sync_logs values('moved-foreign-sync','moved','2026-10-21 10:00Z','2026-10-21 10:01Z','error',1);`);
    const updated = await load(user("site_data_manager",4),{period:"all"});
    assert.equal(updated.localities_summary.find(l=>l.locality_code==='06')!.forms_completed,0,"zero villages remain visible");
    assert.deepEqual(updated.localities_summary.find(l=>l.locality_code==='05')!.assigned_users.map(u=>u.user_id).sort(),['co','cw','cz']);
    assert.equal(updated.localities_summary.find(l=>l.locality_code==='05')!.forms_by_code.FUTURE_1,1,"unknown form counts remain available");
    const historical = await load(user("site_data_manager",4),{period:"all",locality_code:"05",user_id:"moved"});
    assert.equal(historical.totals.forms_completed,1,"current site transfer does not lose recorded village attribution");
    assert.equal(historical.totals.sync_errors,0,"historical submitters cannot expose their current other-site sync issues");
    assert.equal(new Date(historical.users[0].last_sync_at!).toISOString(),"2026-10-19T11:00:00.000Z","last contact comes from scoped submissions rather than another site sync");
    assert.ok(historical.staff_options.some(u=>u.user_id==='moved'),"historical submitter is available in the village staff filter");
    assert.ok(!historical.localities_summary[0].assigned_users.some(u=>u.user_id==='moved'),"historical work does not imply a current assignment");
    const historicalZeroDay = await load(user("site_data_manager",4),{period:"date",date:"2026-10-21",user_id:"moved"});
    assert.deepEqual(historicalZeroDay.localities_summary.map(l=>l.locality_code),['05']);
    assert.equal(historicalZeroDay.localities_summary[0].forms_completed,0);
    const idle = await load(user("site_data_manager",4),{period:"all",user_id:"cz"});
    assert.deepEqual(idle.localities_summary.map(l=>l.locality_code),['05'],"user filter retains assigned village even without completed forms");

    await client.query(`alter table households add column household_head_name text,add column cohort_status text,add column baseline_enrollment_status text,add column closed_reason text;
      alter table form_responses add column household_id text,add column answers_json jsonb;
      alter table questionnaire_drafts add column household_id text,add column submitted_form_response_id text,add column client_updated_at timestamptz;
      alter table follow_up_tasks add column task_type text;
      update form_responses set household_id='c1',answers_json='{"hhq_result_interview":1}' where form_response_id='f1';
      update form_responses set household_id='c1' where form_response_id='f7';
      update form_responses set household_id='c2' where form_response_id='f2';
      update households set household_head_name='Head C1' where household_id='c1';
      insert into households values('c3',4,'04','Excluded head','excluded','enrolled',null),('c4',4,'04','Completed head',null,'enrolled',null);
      insert into field_worker_household_assignments values('cw','c3'),('cw','c4'),('cw','c1'),('bw','c1'),('moved','c1');
      insert into questionnaire_drafts(draft_id,user_id,site_id,locality_code,draft_status,form_code,household_id) values
        ('hh-draft-c2','cw',4,'05','active','HHQ','c2'),('hh-draft-c4','cw',4,'04','active','HHQ','c4');
      update questionnaire_drafts set client_updated_at='2026-10-20 18:30Z',server_updated_at='2026-10-23 10:00Z' where draft_id='hh-draft-c4';
      insert into form_responses(form_response_id,submitted_by_user_id,site_id,locality_code,form_code,response_status,household_id,answers_json) values
        ('c3-complete','cw',4,'04','HHQ','primary','c3','{"hhq_result_interview":1}'),
        ('c4-complete','cw',4,'04','HHQ','primary','c4','{"hhq_result_interview":1}');
      insert into households(household_id,site_id,locality_code) select 'hh-'||lpad(i::text,3,'0'),4,'04' from generate_series(1,55) i;
      insert into field_worker_household_assignments select 'cw',household_id from households where household_id like 'hh-%';`);
    async function assigned(identity: JwtPayload, query: Record<string,unknown>, page=1) {
      const statement=assignedHouseholdsSql(dashboardScope(identity,query,new Date('2026-10-21T12:00:00Z')),page);
      const compiled=new PgDialect().sqlToQuery(statement);
      return (await client.query(compiled.sql,compiled.params)).rows[0];
    }
    const assignments=await assigned(user('site_data_manager',4),{user_id:'cw',site_id:2});
    assert.equal(assignments.rows.length,50);
    assert.deepEqual(assignments.summary,{assigned:59,completed:2,draft:1,excluded:1,pending:55},'summary covers all matches, not the first page');
    assert.equal(assignments.total_pages,2);
    assert.equal(assignments.rows.find((r:any)=>r.household_id==='c1').household_head_name,'Head C1');
    assert.deepEqual(Object.fromEntries(assignments.rows.slice(0,4).map((r:any)=>[r.household_id,r.bhq_status])),{c1:'completed',c2:'draft',c3:'excluded',c4:'completed'});
    const secondPage=await assigned(user('site_data_manager',4),{user_id:'cw'},2);
    assert.equal(secondPage.rows.length,9);
    assert.deepEqual(secondPage.summary,assignments.summary);
    assert.ok(!secondPage.rows.some((r:any)=>assignments.rows.some((a:any)=>a.household_id===r.household_id)),'stable pages do not overlap');
    const noActivity=await assigned(user('site_data_manager',4),{user_id:'cw',period:'date',date:'2020-01-01'});
    assert.equal(noActivity.summary.assigned,0,'date mode only shows households with selected-user activity');
    const activeDay=await assigned(user('site_data_manager',4),{user_id:'cw',period:'date',date:'2026-10-21'});
    assert.deepEqual(activeDay.rows.map((r:any)=>r.household_id),['c1','c2','c4'],'all form submissions and active drafts establish user activity');
    assert.equal(activeDay.rows.find((r:any)=>r.household_id==='c2').bhq_status,'draft','current BHQ color remains shared classification even when activity is BWQ');
    assert.equal(new Date(activeDay.rows.find((r:any)=>r.household_id==='c4').last_activity_at).toISOString(),'2026-10-20T18:30:00.000Z','draft client save time wins over delayed server receipt');
    const activityRange=await assigned(user('site_data_manager',4),{user_id:'cw',period:'range',date_from:'2026-10-19',date_to:'2026-10-21'});
    assert.equal(activityRange.summary.assigned,3);
    const otherWorkerDay=await assigned(user('site_data_manager',4),{user_id:'co',period:'date',date:'2026-10-21'});
    assert.equal(otherWorkerDay.summary.assigned,0,'shared household activity is attributed to its actual submitter');
    const assignedWest=await assigned(user('site_data_manager',4),{user_id:'cw',locality_code:'05'});
    assert.equal(assignedWest.summary.assigned,1);assert.equal(assignedWest.rows[0].bhq_status,'draft');
    for(const user_id of ['bw','moved','unknown'])assert.equal((await assigned(user('site_data_manager',4),{user_id,site_id:2})).summary.assigned,0,'foreign/stale/unknown accounts cannot expose assignments');
    const centralAssigned=await assigned(user('central_admin',null),{user_id:'bw'});
    assert.equal(centralAssigned.summary.assigned,1);assert.equal(centralAssigned.rows[0].household_id,'b1','central view also excludes stale foreign-site allocations');
    const emptyAssigned=await assigned(user('site_data_manager',4),{user_id:'cw',locality_code:'06'});
    assert.deepEqual(emptyAssigned.rows,[]);assert.equal(emptyAssigned.total_pages,1);

  } finally { await client.query("rollback"); await client.end(); }
});
