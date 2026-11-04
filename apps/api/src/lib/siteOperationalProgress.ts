import { sql } from "drizzle-orm";
import type { DashboardWorkload, SiteOperationalProgress } from "../../../../shared/siteFormTotals";
import { completedBhqHouseholdsSql, draftBhqHouseholdsSql } from "./householdBhqStatus";

export const emptyDashboardWorkload = (): DashboardWorkload => ({ completed: 0, draft: 0, pending: 0, upcoming: 0, closed: 0, overdue: 0 });
export const emptySiteOperationalProgress = (): SiteOperationalProgress => ({
  households: { total: 0, assigned: 0, completed: 0, draft: 0, pending: 0, closed: 0 },
  tasks: emptyDashboardWorkload(), tasks_by_code: {}, active_field_workers: 0, eligible_women: 0, active_pregnancies: 0,
});

export function siteOperationalProgressSql(siteId: number | null, asOfDate: string) {
  return sql`with scoped_sites as (
    select site_id from study_sites where (${siteId}::integer is null or site_id=${siteId})
  ), completed_households as (${completedBhqHouseholdsSql()}), draft_households as (${draftBhqHouseholdsSql()}),
  assigned_households as (
    select distinct a.household_id,u.site_id from field_worker_household_assignments a join users u on u.user_id=a.user_id
      where u.role='field_worker' and u.active=true
  ), active_task_drafts as (
    select distinct d.task_id,d.site_id,d.form_code from questionnaire_drafts d
      where d.draft_status='active' and d.submitted_form_response_id is null
  ), household_status as (
    select households.site_id,households.household_id,households.cohort_status,households.baseline_enrollment_status,
      case when c.household_id is not null then 'completed' when d.household_id is not null then 'draft' else 'pending' end bhq_status,
      case when a.household_id is not null then 1 else 0 end assigned
    from households join scoped_sites s on s.site_id=households.site_id
      left join completed_households c on c.household_id=households.household_id and c.site_id=households.site_id
      left join draft_households d on d.household_id=households.household_id and d.site_id=households.site_id
      left join assigned_households a on a.household_id=households.household_id and a.site_id=households.site_id
  ), household_buckets as (
    select site_id,assigned,case when bhq_status='completed' then 'completed'
      when cohort_status='excluded' or baseline_enrollment_status in ('not_enrolled','excluded') then 'closed'
      when bhq_status='draft' then 'draft' else 'pending' end bucket from household_status
  ), task_status as (
    select t.site_id,coalesce(t.form_code,t.task_type,'UNKNOWN') form_code,
      case when t.status='completed' then 'completed'
        when coalesce(t.status,'planned') not in ('planned','due','urgent','overdue','in_progress')
          or coalesce(t.action_state,'enabled')='disabled' or coalesce(t.form_availability,'available')='disabled' then 'closed'
        when d.task_id is not null then 'draft'
        when coalesce(t.form_code,t.task_type) not in ('HHQ','WQ') and coalesce(t.window_start,t.target_date)>${asOfDate}::date then 'upcoming'
        else 'pending' end bucket,
      case when coalesce(t.deadline_date,t.target_date)<${asOfDate}::date
        and (coalesce(t.form_code,t.task_type) in ('HHQ','WQ') or coalesce(t.window_start,t.target_date)<=${asOfDate}::date) then 1 else 0 end overdue
    from follow_up_tasks t join scoped_sites s on s.site_id=t.site_id
      left join active_task_drafts d on d.task_id=t.task_id and d.site_id=t.site_id and d.form_code=coalesce(t.form_code,t.task_type)
  )
  select site_id,'households' metric,'' form_code,bucket,count(*)::integer count from household_buckets group by site_id,bucket
  union all select site_id,'households','','total',count(*)::integer from household_buckets group by site_id
  union all select site_id,'households','','assigned',sum(assigned)::integer from household_buckets group by site_id
  union all select site_id,'tasks',form_code,bucket,count(*)::integer from task_status group by site_id,form_code,bucket
  union all select site_id,'tasks',form_code,'overdue',sum(overdue)::integer from task_status where bucket in ('pending','draft') group by site_id,form_code
  union all select u.site_id,'active_field_workers','','',count(*)::integer from users u join scoped_sites s on s.site_id=u.site_id where u.role='field_worker' and u.active=true group by u.site_id
  union all select w.site_id,'eligible_women','','',count(*)::integer from eligible_women w join scoped_sites s on s.site_id=w.site_id group by w.site_id
  union all select p.site_id,'active_pregnancies','','',count(*)::integer from pregnancies p join scoped_sites s on s.site_id=p.site_id where p.pregnancy_status in ('active','enrolled') group by p.site_id`;
}

export interface SiteProgressRow { site_id: number; metric: string; form_code: string; bucket: string; count: number }

export function assembleSiteOperationalProgress(rows: SiteProgressRow[]): Map<number, SiteOperationalProgress> {
  const sites = new Map<number, SiteOperationalProgress>();
  for (const row of rows) {
    let progress = sites.get(row.site_id);
    if (!progress) { progress = emptySiteOperationalProgress(); sites.set(row.site_id, progress); }
    const count = Number(row.count);
    if (row.metric === "households") progress.households[row.bucket as keyof SiteOperationalProgress["households"]] = count;
    else if (row.metric === "tasks") {
      const workload = progress.tasks_by_code[row.form_code] ??= emptyDashboardWorkload();
      workload[row.bucket as keyof DashboardWorkload] += count;
      progress.tasks[row.bucket as keyof DashboardWorkload] += count;
    } else if (row.metric === "active_field_workers" || row.metric === "eligible_women" || row.metric === "active_pregnancies") progress[row.metric] = count;
  }
  return sites;
}
