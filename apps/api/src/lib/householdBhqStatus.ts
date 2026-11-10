import { sql } from "drizzle-orm";
import { schema } from "../db";

export const completedBhqHouseholdsSql = () => sql`select distinct f.household_id,f.site_id from form_responses f
  where f.form_code='HHQ' and coalesce(f.response_status,'primary')='primary' and f.answers_json->>'hhq_result_interview'='1'`;

export const draftBhqHouseholdsSql = () => sql`select distinct d.household_id,d.site_id from questionnaire_drafts d
  where d.form_code='HHQ' and d.draft_status='active' and d.submitted_form_response_id is null`;

export function householdBhqStatusSql() {
  return sql<string>`case when ${schema.households.cohort_status}='excluded'
    or ${schema.households.baseline_enrollment_status} in ('not_enrolled','excluded') then 'excluded' when exists (
    select 1 from (${completedBhqHouseholdsSql()}) f where f.household_id=${schema.households.household_id}
      and f.site_id=${schema.households.site_id}
  ) then 'completed' when exists (
    select 1 from (${draftBhqHouseholdsSql()}) d where d.household_id=${schema.households.household_id}
      and d.site_id=${schema.households.site_id}
  ) then 'draft' else 'pending' end`;
}
