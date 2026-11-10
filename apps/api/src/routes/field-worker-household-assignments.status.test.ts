import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { householdBhqStatusSql } from "./field-worker-household-assignments";
import { schema } from "../db";

test("assignment colors prioritize excluded households over completed server BHQs and active drafts", (t) => {
  let DatabaseSync;
  try { ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite")); }
  catch { t.skip("Isolated SQLite check requires Node 22+"); return; }
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`create table households(household_id text,site_id integer,cohort_status text,baseline_enrollment_status text,closed_reason text);
    create table form_responses(household_id text,site_id integer,form_code text,response_status text,answers_json text,task_id text);
    create table follow_up_tasks(task_id text,household_id text,site_id integer,form_code text,task_type text,status text);
    create table questionnaire_drafts(household_id text,site_id integer,form_code text,draft_status text,submitted_form_response_id text);`);
  const expected = {
    completed: "completed", legacy: "completed", draft: "draft", phone_only: "pending",
    incomplete: "pending", duplicate: "pending", quarantined: "pending", other_form: "pending",
    other_site: "pending", archived_draft: "pending", submitted_draft: "pending", other_form_draft: "pending",
    excluded: "excluded", excluded_completed: "excluded", excluded_draft: "excluded",
    baseline_excluded: "excluded", not_enrolled: "excluded",
    other_completed: "completed", other_legacy_completed: "completed", other_late: "completed",
    other_no_task: "pending", other_open_task: "pending", other_not_enrolled: "pending", other_closed: "pending",
    other_duplicate: "pending", other_revisit: "pending", other_wrong_site: "pending", other_wrong_household: "pending",
    absent_completed_task: "pending", postponed_completed_task: "pending", incomplete_completed_task: "pending", refused_completed_task: "pending",
  };
  for (const id of Object.keys(expected)) sqlite.prepare("insert into households values(?,2,null,null,null)").run(id);
  sqlite.exec(`update households set cohort_status='excluded' where household_id in ('excluded','excluded_completed','excluded_draft');
    update households set baseline_enrollment_status='excluded' where household_id='baseline_excluded';
    update households set baseline_enrollment_status='not_enrolled' where household_id='not_enrolled';`);
  const response = sqlite.prepare("insert into form_responses(household_id,site_id,form_code,response_status,answers_json) values(?,2,?,?,?)");
  response.run("completed", "HHQ", "primary", JSON.stringify({ hhq_result_interview: 1 }));
  response.run("legacy", "HHQ", null, JSON.stringify({ hhq_result_interview: "1" }));
  response.run("excluded_completed", "HHQ", "primary", JSON.stringify({ hhq_result_interview: 1 }));
  response.run("incomplete", "HHQ", "revisit_needed", JSON.stringify({ hhq_result_interview: 2 }));
  response.run("duplicate", "HHQ", "duplicate", JSON.stringify({ hhq_result_interview: 1 }));
  response.run("quarantined", "HHQ", "invalid_rejected", JSON.stringify({ hhq_result_interview: 1 }));
  response.run("other_form", "WQ", "primary", JSON.stringify({ hhq_result_interview: 1 }));
  sqlite.prepare("insert into form_responses(household_id,site_id,form_code,response_status,answers_json) values('other_site',1,'HHQ','primary',?)").run(JSON.stringify({ hhq_result_interview: 1 }));
  const otherCases = ["other_completed", "other_legacy_completed", "other_late", "other_no_task", "other_open_task", "other_not_enrolled", "other_closed",
    "other_duplicate", "other_revisit", "other_wrong_site", "other_wrong_household", "absent_completed_task", "postponed_completed_task", "incomplete_completed_task", "refused_completed_task"];
  for (const id of otherCases) {
    sqlite.prepare("update households set baseline_enrollment_status='enrolled' where household_id=?").run(id);
    const outcome = ({ absent_completed_task: 2, postponed_completed_task: 4, incomplete_completed_task: 5, refused_completed_task: 6 } as Record<string, number>)[id] ?? 10;
    sqlite.prepare("insert into form_responses values(?,2,'HHQ',?,?,?)").run(id,
      id === "other_duplicate" ? "duplicate" : id === "other_revisit" ? "revisit_needed" : "primary", JSON.stringify({ hhq_result_interview: outcome }), `${id}-task`);
    if (id !== "other_no_task") sqlite.prepare("insert into follow_up_tasks values(?,?,?,'HHQ','HHQ',?)").run(`${id}-task`,
      id === "other_wrong_household" ? "different-household" : id, id === "other_wrong_site" ? 1 : 2,
      id === "other_open_task" ? "planned" : id === "other_legacy_completed" ? "completed_on_time" : id === "other_late" ? "completed_late" : "completed");
  }
  sqlite.exec("update households set baseline_enrollment_status='pending' where household_id='other_not_enrolled'; update households set closed_reason='closed' where household_id='other_closed';");
  sqlite.exec(`insert into questionnaire_drafts values
    ('completed',2,'HHQ','active',null),('draft',2,'HHQ','active',null),
    ('excluded_draft',2,'HHQ','active',null),('excluded_completed',2,'HHQ','active',null),
    ('archived_draft',2,'HHQ','archived',null),('submitted_draft',2,'HHQ','active','sent'),
    ('other_form_draft',2,'WQ','active',null),('other_site',1,'HHQ','active',null);`);
  try {
    const compiled = new PgDialect().sqlToQuery(sql`select household_id, ${householdBhqStatusSql()} status from ${schema.households}`);
    // SQLite JSON extraction returns numbers; PostgreSQL ->> always returns text.
    const query = compiled.sql.replaceAll("f.answers_json->>'hhq_result_interview'", "cast(json_extract(f.answers_json,'$.hhq_result_interview') as text)");
    const rows = sqlite.prepare(query).all() as { household_id: string; status: string }[];
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.household_id, row.status])), expected);
  } finally { sqlite.close(); }
});
