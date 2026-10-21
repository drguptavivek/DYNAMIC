import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { dashboardScope, dashboardSql, assembleDashboard } from "./operationsDashboard";
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
      insert into sync_logs values('s1','cw','2026-10-21 10:00Z','2026-10-21 10:01Z','partial_success',1),('s2','bw','2026-10-21 10:00Z','2026-10-21 10:02Z','failed',0);
      insert into data_quality_flags values(4,'open','c1',null),(2,'open','b1',null);
      insert into household_members values(4,'04'),(4,'05'),(2,'20');
      insert into eligible_women values(4,'04','completed','active'),(4,'05','completed','not_tracked'),(2,'20','completed','active');
      insert into pregnancies values(4,'04','active'),(4,'05','enrolled'),(4,'04','closed'),(2,'20','active');
      insert into children values('c1'),('b1');
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
      return assembleDashboard(scope, await run(queries.roster), await run(queries.facts), await run(queries.options), (await run(queries.quality))[0], (await run(queries.cohort))[0]);
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
    assert.equal(worker.sync_errors,1);
    assert.equal(chennai.totals.unattributed_forms,1,"do not guess historical submitter");
    assert.equal(chennai.totals.open_data_quality_flags,6);
    assert.deepEqual(chennai.cohort,{households:2,members:2,eligible_women:2,tracking_eligible_women:1,active_pregnancies:2,children:1});
    assert.equal(chennai.users.find(row=>row.user_id==="co")!.pending_tasks,1);
    assert.equal(chennai.users.find(row=>row.user_id==="cz")!.forms_completed,0);
    const central=await load(user("central_admin",null),{});
    assert.equal(central.totals.assigned_households,3);
    assert.equal(central.totals.forms_completed,3);
    assert.equal(central.totals.sync_errors,2);
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
  } finally { await client.query("rollback"); await client.end(); }
});
