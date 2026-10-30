import { sql } from "drizzle-orm";
import type { SiteFormTotals } from "../../../../shared/siteFormTotals";

export function siteFormTotalsSql(siteId: number | null = null) {
  return sql`select s.site_id,s.site_name,f.form_code,count(f.form_response_id)::integer count
    from study_sites s left join (
      select f.form_response_id,f.site_id,f.form_code from form_responses f
      join users u on u.user_id=f.submitted_by_user_id and u.role='field_worker'
      where coalesce(f.response_status,'primary')='primary'
    ) f on f.site_id=s.site_id
    where (${siteId}::integer is null or s.site_id=${siteId})
    group by s.site_id,s.site_name,f.form_code
    order by s.site_id,f.form_code`;
}

interface SiteFormCount {
  site_id: number;
  site_name: string;
  form_code: string | null;
  count: number;
}

export function assembleSiteFormTotals(rows: SiteFormCount[], now = new Date()): SiteFormTotals {
  const sites = new Map<number, SiteFormTotals["sites"][number]>();
  for (const row of rows) {
    let site = sites.get(row.site_id);
    if (!site) {
      site = { site_id: row.site_id, site_name: row.site_name, total: 0, forms_by_code: {} };
      sites.set(row.site_id, site);
    }
    const count = Number(row.count);
    site.total += count;
    if (count > 0) site.forms_by_code[row.form_code || "UNKNOWN"] = count;
  }
  return { generated_at: now.toISOString(), sites: [...sites.values()] };
}
