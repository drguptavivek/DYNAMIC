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
  sqlite.exec(`create table households(household_id text,site_id integer,cohort_status text,baseline_enrollment_status text);
    create table form_responses(household_id text,site_id integer,form_code text,response_status text,answers_json text);
    create table questionnaire_drafts(household_id text,site_id integer,form_code text,draft_status text,submitted_form_response_id text);`);
  const expected = {
    completed: "completed", legacy: "completed", draft: "draft", phone_only: "pending",
    incomplete: "pending", duplicate: "pending", quarantined: "pending", other_form: "pending",
    other_site: "pending", archived_draft: "pending", submitted_draft: "pending", other_form_draft: "pending",
    excluded: "excluded", excluded_completed: "excluded", excluded_draft: "excluded",
    baseline_excluded: "excluded", not_enrolled: "excluded",
  };
  for (const id of Object.keys(expected)) sqlite.prepare("insert into households values(?,2,null,null)").run(id);
  sqlite.exec(`update households set cohort_status='excluded' where household_id in ('excluded','excluded_completed','excluded_draft');
    update households set baseline_enrollment_status='excluded' where household_id='baseline_excluded';
    update households set baseline_enrollment_status='not_enrolled' where household_id='not_enrolled';`);
  const response = sqlite.prepare("insert into form_responses values(?,2,?,?,?)");
  response.run("completed", "HHQ", "primary", JSON.stringify({ hhq_result_interview: 1 }));
  response.run("legacy", "HHQ", null, JSON.stringify({ hhq_result_interview: "1" }));
  response.run("excluded_completed", "HHQ", "primary", JSON.stringify({ hhq_result_interview: 1 }));
  response.run("incomplete", "HHQ", "revisit_needed", JSON.stringify({ hhq_result_interview: 2 }));
  response.run("duplicate", "HHQ", "duplicate", JSON.stringify({ hhq_result_interview: 1 }));
  response.run("quarantined", "HHQ", "invalid_rejected", JSON.stringify({ hhq_result_interview: 1 }));
  response.run("other_form", "WQ", "primary", JSON.stringify({ hhq_result_interview: 1 }));
  sqlite.prepare("insert into form_responses values('other_site',1,'HHQ','primary',?)").run(JSON.stringify({ hhq_result_interview: 1 }));
  sqlite.exec(`insert into questionnaire_drafts values
    ('completed',2,'HHQ','active',null),('draft',2,'HHQ','active',null),
    ('excluded_draft',2,'HHQ','active',null),('excluded_completed',2,'HHQ','active',null),
    ('archived_draft',2,'HHQ','archived',null),('submitted_draft',2,'HHQ','active','sent'),
    ('other_form_draft',2,'WQ','active',null),('other_site',1,'HHQ','active',null);`);
  try {
    const compiled = new PgDialect().sqlToQuery(sql`select household_id, ${householdBhqStatusSql()} status from ${schema.households}`);
    // SQLite JSON extraction returns numbers; PostgreSQL ->> always returns text.
    const query = compiled.sql.replace("f.answers_json->>'hhq_result_interview'", "cast(json_extract(f.answers_json,'$.hhq_result_interview') as text)");
    const rows = sqlite.prepare(query).all() as { household_id: string; status: string }[];
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.household_id, row.status])), expected);
  } finally { sqlite.close(); }
});
