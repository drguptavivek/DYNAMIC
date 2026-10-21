import { sql, SQL } from "drizzle-orm";
import type { JwtPayload } from "./jwt";
import type { DashboardMetrics, OperationsDashboard, DashboardStaffRow } from "../../../../shared/operationsDashboard";

const CENTRAL = new Set(["central_admin", "central_data_manager"]);
const SITE = new Set(["site_data_manager", "site_research_scientist", "site_investigator"]);
export function dashboardScope(user: JwtPayload, query: Record<string, unknown>, now = new Date()) {
  if (!CENTRAL.has(user.role) && !SITE.has(user.role)) throw new Error("DASHBOARD_FORBIDDEN");
  const as_of_date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const date = query.date === undefined ? as_of_date : String(query.date);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("INVALID_DATE");
  const all_sites = CENTRAL.has(user.role);
  const requestedSite = query.site_id === undefined || query.site_id === "" ? null : Number(query.site_id);
  if (requestedSite !== null && (!Number.isSafeInteger(requestedSite) || requestedSite < 1)) throw new Error("INVALID_SITE");
  if (!all_sites && (!Number.isSafeInteger(user.site_id) || user.site_id! < 1)) throw new Error("DASHBOARD_FORBIDDEN");
  const locality_code = query.locality_code === undefined || query.locality_code === "" ? null : String(query.locality_code).trim();
  if (locality_code !== null && !/^[A-Za-z0-9]{1,20}$/.test(locality_code)) throw new Error("INVALID_LOCALITY");
  return { date, as_of_date, all_sites, site_id: all_sites ? requestedSite : user.site_id, locality_code };
}
export type DashboardScope = ReturnType<typeof dashboardScope>;

export function dashboardSql(scope: DashboardScope) {
  const { site_id: site, locality_code: locality, date } = scope;
  const area = (alias: string): SQL => sql`(${site}::integer is null or ${sql.raw(alias)}.site_id = ${site}) and (${locality}::text is null or ${sql.raw(alias)}.locality_code = ${locality})`;
  const start = `${date}T00:00:00+05:30`;
  const finish = new Date(Date.parse(start) + 86400000).toISOString();
  const active = sql`(a.active_from is null or a.active_from <= ${scope.as_of_date}::date) and (a.active_to is null or a.active_to >= ${scope.as_of_date}::date)`;
  const roster = sql`select u.user_id, u.username, coalesce(u.display_name, u.username) display_name, u.role, u.active, u.site_id,
    coalesce(s.site_name, 'Central') site_name from users u left join study_sites s on s.site_id=u.site_id
    where (${site}::integer is null or u.site_id=${site}) and (${locality}::text is null or
      exists(select 1 from user_area_assignments a where a.user_id=u.user_id and ${active} and ${area("a")}) or
      exists(select 1 from field_worker_household_assignments a join households h on h.household_id=a.household_id where a.user_id=u.user_id and ${area("h")}))`;
  return {
    cohort: sql`select
      (select count(*)::integer from households h where ${area("h")}) households,
      (select count(*)::integer from household_members m where ${area("m")}) members,
      (select count(*)::integer from eligible_women w where ${area("w")}) eligible_women,
      (select count(*)::integer from eligible_women w where ${area("w")} and w.wq_status='completed' and w.tracking_status<>'not_tracked') tracking_eligible_women,
      (select count(*)::integer from pregnancies p where ${area("p")} and p.pregnancy_status in ('active','enrolled')) active_pregnancies,
      (select count(*)::integer from children c join households h on h.household_id=c.household_id where ${area("h")}) children`,
    roster: sql`with roster as (${roster}), locality_rows as (
      select distinct a.user_id,a.site_id,a.locality_code,coalesce(l.locality_name,a.locality_code) locality_name
      from user_area_assignments a left join study_localities l on l.site_id=a.site_id and l.locality_code=a.locality_code
      where ${active} and ${area("a")}
    ), localities as (select user_id,json_agg(json_build_object('site_id',site_id,'locality_code',locality_code,'locality_name',locality_name) order by site_id,locality_code) assigned_localities from locality_rows group by user_id),
    contacts as (select z.user_id,coalesce(z.completed_at,z.started_at) at,z.status, z.sync_log_id id from sync_logs z
      union all select d.user_id,d.server_updated_at,'draft_backup',d.draft_id from questionnaire_drafts d where ${area("d")}
      union all select f.submitted_by_user_id,f.synced_at,'form_received',f.form_response_id from form_responses f where ${area("f")}),
    latest_sync as (select distinct on (z.user_id) z.user_id,z.at last_sync_at,z.status last_sync_status
      from contacts z join roster r on r.user_id=z.user_id where z.at is not null order by z.user_id,z.at desc,z.id desc),
    worked_rows as (select distinct f.submitted_by_user_id user_id,f.site_id,f.locality_code,coalesce(l.locality_name,f.locality_code) locality_name
      from form_responses f left join study_localities l on l.site_id=f.site_id and l.locality_code=f.locality_code
      where ${area("f")} and coalesce(f.response_status,'primary')='primary' and coalesce(f.created_offline_at,f.synced_at,f.created_at)>=${start}::timestamptz and coalesce(f.created_offline_at,f.synced_at,f.created_at)<${finish}::timestamptz),
    worked as (select user_id,json_agg(json_build_object('site_id',site_id,'locality_code',locality_code,'locality_name',locality_name) order by site_id,locality_code) completed_localities from worked_rows group by user_id)
    select r.*,coalesce(l.assigned_localities,'[]'::json) assigned_localities,coalesce(w.completed_localities,'[]'::json) completed_localities,z.last_sync_at,z.last_sync_status
    from roster r left join localities l on l.user_id=r.user_id left join latest_sync z on z.user_id=r.user_id
    left join worked w on w.user_id=r.user_id
    order by r.site_id nulls first, r.display_name, r.user_id`,
    facts: sql`with roster as (${roster}), facts as (
      select a.user_id,h.site_id,h.locality_code,'assigned_households' metric,h.household_id id,'' code
      from field_worker_household_assignments a join households h on h.household_id=a.household_id where ${area("h")}
      union all select f.submitted_by_user_id,f.site_id,f.locality_code,'forms_completed',f.form_response_id,f.form_code
      from form_responses f where ${area("f")} and coalesce(f.response_status,'primary')='primary'
        and coalesce(f.created_offline_at,f.synced_at,f.created_at)>=${start}::timestamptz and coalesce(f.created_offline_at,f.synced_at,f.created_at)<${finish}::timestamptz
      union all select f.submitted_by_user_id,f.site_id,f.locality_code,'forms_received',f.form_response_id,''
      from form_responses f where ${area("f")} and coalesce(f.response_status,'primary')='primary'
        and coalesce(f.synced_at,f.created_at)>=${start}::timestamptz and coalesce(f.synced_at,f.created_at)<${finish}::timestamptz
      union all select d.user_id,d.site_id,d.locality_code,'backed_up_drafts',d.draft_id,'' from questionnaire_drafts d
      where ${area("d")} and d.draft_status='active' and not exists(select 1 from form_responses f
        where f.task_id=d.task_id and coalesce(f.response_status,'primary')='primary')
      union all select a.user_id,t.site_id,t.locality_code,'pending_tasks',t.task_id,''
      from follow_up_tasks t join field_worker_household_assignments a on a.household_id=t.household_id
      where ${area("t")} and t.status in ('planned','due','urgent','overdue','in_progress')
        and coalesce(t.action_state,'enabled')<>'disabled' and coalesce(t.form_availability,'available')<>'disabled'
        and (t.form_code in ('HHQ','WQ') or coalesce(t.window_start,t.target_date)<=${date}::date)
      union all select a.user_id,t.site_id,t.locality_code,'overdue_tasks',t.task_id,''
      from follow_up_tasks t join field_worker_household_assignments a on a.household_id=t.household_id
      where ${area("t")} and t.status in ('planned','due','urgent','overdue','in_progress')
        and coalesce(t.action_state,'enabled')<>'disabled' and coalesce(t.form_availability,'available')<>'disabled'
        and (t.form_code in ('HHQ','WQ') or coalesce(t.window_start,t.target_date)<=${date}::date)
        and coalesce(t.deadline_date,t.target_date)<${date}::date
      union all select z.user_id,u.site_id,null,'sync_errors',z.sync_log_id,'' from sync_logs z join roster u on u.user_id=z.user_id
      where coalesce(z.completed_at,z.started_at)>=${start}::timestamptz and coalesce(z.completed_at,z.started_at)<${finish}::timestamptz
        and (z.status in ('error','failed','partial_success') or coalesce(z.conflicts_detected,0)>0)
    ) select f.user_id,f.site_id,f.locality_code,grouping(f.user_id) gu,grouping(f.site_id) gs,grouping(f.locality_code) gl,
      metric,code,count(distinct id)::integer count from facts f join roster r on r.user_id=f.user_id
      group by grouping sets ((f.user_id,metric,code),(f.site_id,metric,code),(f.site_id,f.locality_code,metric,code),(metric,code))`,
    options: sql`select s.site_id,s.site_name,l.locality_code,l.locality_name from study_sites s left join study_localities l on l.site_id=s.site_id where (${scope.all_sites ? null : site}::integer is null or s.site_id=${site}) order by s.site_id,l.locality_code`,
    quality: sql`select
      (select count(*)::integer from form_responses f where ${area("f")} and coalesce(f.response_status,'primary')='primary'
        and not exists(select 1 from users u where u.user_id=f.submitted_by_user_id)
        and coalesce(f.created_offline_at,f.synced_at,f.created_at)>=${start}::timestamptz and coalesce(f.created_offline_at,f.synced_at,f.created_at)<${finish}::timestamptz) unattributed_forms,
      (select count(*)::integer from data_quality_flags q where q.status='open' and (${site}::integer is null or q.site_id=${site})
        and (${locality}::text is null or exists(select 1 from households h where h.site_id=q.site_id and ${area("h")} and (
          (q.subject_type='household' and h.household_id=q.subject_id)
          or exists(select 1 from follow_up_tasks t where t.task_id=q.task_id and t.household_id=h.household_id)
          or (q.subject_type='pregnancy' and exists(select 1 from pregnancies p where p.pregnancy_id=q.subject_id and p.household_id=h.household_id))
          or (q.subject_type in ('person','member','household_member') and exists(select 1 from household_members m where m.household_member_id=q.subject_id and m.household_id=h.household_id))
          or (q.subject_type='woman' and exists(select 1 from eligible_women w where w.woman_id=q.subject_id and w.household_id=h.household_id))
          or (q.subject_type='child' and exists(select 1 from children c where c.child_id=q.subject_id and c.household_id=h.household_id))
        )) or exists(select 1 from form_responses f where f.site_id=q.site_id and ${area("f")} and f.form_response_id in (q.primary_response_id,q.duplicate_response_id)))) open_data_quality_flags`,
  };
}

export const emptyDashboardMetrics = (): DashboardMetrics => ({ assigned_households: 0, forms_completed: 0, forms_received: 0, backed_up_drafts: 0, pending_tasks: 0, overdue_tasks: 0, sync_errors: 0, forms_by_code: {} });
interface Fact { user_id: string | null; site_id: number | null; locality_code: string | null; gu: number; gs: number; gl: number; metric: keyof DashboardMetrics; code: string; count: number; }
export function assembleDashboard(scope: DashboardScope, users: DashboardStaffRow[], facts: Fact[], options: { site_id: number; site_name: string; locality_code: string | null; locality_name: string | null }[], quality: { unattributed_forms: number; open_data_quality_flags: number }, cohort: OperationsDashboard["cohort"] = { households: 0, members: 0, eligible_women: 0, tracking_eligible_women: 0, active_pregnancies: 0, children: 0 }): OperationsDashboard {
  const userMap = new Map(users.map(u => [u.user_id, Object.assign(u, emptyDashboardMetrics())]));
  const sites = [...new Map(options.map(o => [o.site_id, { site_id: o.site_id, site_name: o.site_name }])).values()];
  const localities = options.filter(o => o.locality_code !== null).map(o => ({ site_id: o.site_id, locality_code: o.locality_code!, locality_name: o.locality_name! }));
  const totals = { ...emptyDashboardMetrics(), users: users.length, active_users: users.filter(u => u.active).length, ...quality };
  const siteMap = new Map(sites.filter(s => scope.site_id === null || s.site_id === scope.site_id).map(s => [s.site_id, { ...s, ...emptyDashboardMetrics(), users: users.filter(u => u.site_id === s.site_id).length }]));
  const localityMap = new Map(localities.filter(l => (scope.site_id === null || l.site_id === scope.site_id) && (scope.locality_code === null || l.locality_code === scope.locality_code)).map(l => [l.site_id + ":" + l.locality_code, { ...l, ...emptyDashboardMetrics(), users: users.filter(u => u.assigned_localities.some(a => a.site_id === l.site_id && a.locality_code === l.locality_code)).length }]));
  for (const f of facts) {
    const target = f.gu === 0 ? userMap.get(f.user_id!) : f.gs === 1 ? totals : f.gl === 1 ? siteMap.get(f.site_id!) : localityMap.get(f.site_id + ":" + f.locality_code);
    if (!target) continue;
    if (f.metric === "forms_completed") target.forms_by_code[f.code] = Number(f.count);
    if (f.metric !== "forms_by_code") target[f.metric] += Number(f.count);
  }
  return { cohort, date: scope.date, timezone: "Asia/Kolkata", generated_at: new Date().toISOString(), scope: { all_sites: scope.all_sites, site_id: scope.site_id, locality_code: scope.locality_code }, sites, localities, totals, users: [...userMap.values()], sites_summary: [...siteMap.values()], localities_summary: [...localityMap.values()], notes: [
    "Forms completed use the client submission date in India time; received forms use the server receipt date. Only primary accepted submissions count.",
    "Drafts are active server backups, excluding tasks already submitted. Unsynced phone drafts and outbox forms are not visible here.",
    "Village labels show assigned localities, not the user's current physical location. Household and task totals count unique records even when assigned to multiple users.",
    "Sync issues reflect recorded push errors or conflicts; failed connections and HDSS download failures may not reach the server. Sync issues are user/site metrics, not attributed to a village.",
    "Task and assignment figures show current server state; changing the date changes activity counts and due-date comparison, not historical assignment ownership."
  ] };
}
