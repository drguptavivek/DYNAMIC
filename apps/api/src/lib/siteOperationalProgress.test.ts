import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { PgDialect } from "drizzle-orm/pg-core";
import { assembleSiteOperationalProgress, emptySiteOperationalProgress, siteOperationalProgressSql } from "./siteOperationalProgress";
import { assembleSiteFormTotals } from "./siteFormTotals";

test("operational progress partitions unique households and tasks without inflated assignments or drafts", (t) => {
  let DatabaseSync;
  try { ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite")); }
  catch { t.skip("Isolated SQL verification requires Node 22+"); return; }
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`create table study_sites(site_id integer);
    create table households(household_id text,site_id integer,cohort_status text,baseline_enrollment_status text,closed_reason text);
    create table form_responses(household_id text,site_id integer,form_code text,response_status text,answers_json text,task_id text);
    create table questionnaire_drafts(household_id text,site_id integer,form_code text,draft_status text,submitted_form_response_id text,task_id text);
    create table field_worker_household_assignments(household_id text,user_id text);
    create table users(user_id text,site_id integer,role text,active integer);
    create table follow_up_tasks(task_id text,site_id integer,form_code text,task_type text,status text,action_state text,form_availability text,window_start text,target_date text,deadline_date text,household_id text);
    create table eligible_women(site_id integer);
    create table pregnancies(site_id integer,pregnancy_status text);
    insert into study_sites values(1),(2),(9);
    insert into households(household_id,site_id,cohort_status,baseline_enrollment_status) values('done',1,null,'enrolled'),('draft',1,null,'pending'),('left',1,null,'pending'),('excluded',1,'excluded','not_enrolled'),('other',2,null,'pending');
    insert into users values('worker',1,'field_worker',1),('shared',1,'field_worker',1),('inactive',1,'field_worker',0),('wrong-site',2,'field_worker',1),('manager',1,'site_data_manager',1);
    insert into field_worker_household_assignments values('draft','worker'),('draft','shared'),('left','inactive'),('left','wrong-site'),('left','manager');
    insert into form_responses(household_id,site_id,form_code,response_status,answers_json) values('done',1,'HHQ','primary','{"hhq_result_interview":1}'),('left',1,'HHQ','duplicate','{"hhq_result_interview":1}');
    insert into questionnaire_drafts values('done',1,'HHQ','active',null,'completed'),('draft',1,'HHQ','active',null,'draft-task'),('draft',1,'HHQ','active',null,'draft-task'),('excluded',1,'HHQ','active',null,null),('left',1,'HHQ','archived',null,null),('other',1,'HHQ','active',null,null);
    insert into eligible_women values(1),(1),(2);
    insert into pregnancies values(1,'active'),(1,'enrolled'),(1,'closed'),(2,'active');`);
  const task = sqlite.prepare("insert into follow_up_tasks(task_id,site_id,form_code,task_type,status,action_state,form_availability,window_start,target_date,deadline_date) values(?,?,?,?,?,?,?,?,?,?)");
  const add = (id: string, code: string, status: string, window = "2026-11-01", deadline = "2026-11-03", action = "enabled", site = 1) => task.run(id, site, code, code, status, action, "available", window, "2026-11-10", deadline);
  add("completed", "HHQ", "completed");
  add("draft-task", "HHQ", "planned");
  add("pending-task", "WQ", "due");
  add("baseline-future-target", "HHQ", "planned", "2027-01-01", "2027-02-01");
  add("upcoming", "PEF", "planned", "2027-01-01", "2027-02-01");
  add("disabled", "PEF", "planned", "2026-11-01", "2026-11-03", "disabled");
  add("cancelled", "NEW_FORM", "cancelled");
  add("unrecognized", "NEW_FORM", "unknown");
  add("other-site", "HHQ", "completed", "2026-11-01", "2026-11-03", "enabled", 2);
  sqlite.exec(`update form_responses set answers_json='{"hhq_result_interview":10}',task_id='completed' where household_id='done';
    update follow_up_tasks set household_id='done' where task_id='completed';`);
  const run = (site: number | null) => {
    const compiled = new PgDialect().sqlToQuery(siteOperationalProgressSql(site, "2026-11-04"));
    const query = compiled.sql.replace(/::integer|::date/g, "")
      .replaceAll("f.answers_json->>'hhq_result_interview'", "cast(json_extract(f.answers_json,'$.hhq_result_interview') as text)")
      .replace(/\$\d+/g, "?");
    return sqlite.prepare(query).all(...compiled.params) as any[];
  };
  try {
    const all = assembleSiteOperationalProgress(run(null));
    const progress = all.get(1)!;
    assert.deepEqual(progress.households, { total: 4, assigned: 1, completed: 1, draft: 1, pending: 1, closed: 1 });
    assert.deepEqual(progress.tasks, { completed: 1, draft: 1, pending: 2, upcoming: 1, closed: 3, overdue: 2 });
    assert.deepEqual(progress.tasks_by_code.PEF, { completed: 0, draft: 0, pending: 0, upcoming: 1, closed: 1, overdue: 0 });
    assert.equal(progress.active_field_workers, 2);
    assert.equal(progress.eligible_women, 2);
    assert.equal(progress.active_pregnancies, 2);
    assert.equal(all.get(2)!.households.pending, 1, "Wrong-site draft cannot color another site household");
    assert.deepEqual([...assembleSiteOperationalProgress(run(2)).keys()], [2], "Manager site filter limits every metric");
    const zero = assembleSiteFormTotals([{ site_id: 9, site_name: "New", form_code: null, count: 0 }], new Date("2026-11-04"), run(9));
    assert.deepEqual(zero.sites[0].progress, emptySiteOperationalProgress());
    sqlite.exec("delete from field_worker_household_assignments");
    const afterDeassign = assembleSiteOperationalProgress(run(1)).get(1)!;
    assert.equal(afterDeassign.households.assigned, 0);
    assert.equal(afterDeassign.households.completed, 1, "Deassignment does not reset completed coverage");
    assert.equal(afterDeassign.tasks.completed, 1);
  } finally { sqlite.close(); }
});
