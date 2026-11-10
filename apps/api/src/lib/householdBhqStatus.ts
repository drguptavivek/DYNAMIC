import { sql } from "drizzle-orm";
import { schema } from "../db";

export const completedBhqHouseholdsSql = () => sql`select distinct f.household_id,f.site_id from form_responses f
  where f.form_code='HHQ' and coalesce(f.response_status,'primary')='primary' and (
    f.answers_json->>'hhq_result_interview'='1' or (
      f.answers_json->>'hhq_result_interview'='10' and exists (
        select 1 from households h join follow_up_tasks t on t.task_id=f.task_id
          and t.household_id=h.household_id and t.site_id=h.site_id
        where h.household_id=f.household_id and h.site_id=f.site_id
          and h.baseline_enrollment_status='enrolled' and coalesce(h.cohort_status,'')<>'excluded'
          and h.closed_reason is null and coalesce(t.form_code,t.task_type)='HHQ'
          and t.status in ('completed','completed_on_time','completed_late')
      )
    )
  )`;

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
