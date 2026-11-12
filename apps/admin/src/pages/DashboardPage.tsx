import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import type { DashboardAssignedHouseholds, OperationsDashboard } from "../../../../shared/operationsDashboard";
import styles from "./DashboardPage.module.css";

type DashboardStats = { households: number; members: number; eligible_women: number; tracking_eligible_women: number; active_pregnancies: number; children: number; tasks: number; open_data_quality_flags: number };
type Period = "all" | "today" | "date" | "range";
const OPERATION_ROLES = ["central_admin", "central_data_manager", "site_data_manager", "site_research_scientist", "site_investigator"];
const FORM_CODES = ["HHQ", "WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "PSF"];
const formLabel = (code: string) => code === "HHQ" ? "BHQ" : code === "WQ" ? "BWQ" : code;
const count = (value: number) => value.toLocaleString("en-IN");
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const validDate = (value: string) => /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function syncTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export default function DashboardPage() {
  const { user } = useAuth();
  return user && OPERATION_ROLES.includes(user.role) ? <OperationsView key={user.user_id} /> : <StudySummary key={user?.user_id} />;
}

function OperationsView() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("all");
  const [date, setDate] = useState(todayInIndia);
  const [dateFrom, setDateFrom] = useState(todayInIndia);
  const [dateTo, setDateTo] = useState(todayInIndia);
  const [siteId, setSiteId] = useState("");
  const [locality, setLocality] = useState("");
  const [userId, setUserId] = useState("");
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [householdPage, setHouseholdPage] = useState(1);
  const [assignedData, setAssignedData] = useState<DashboardAssignedHouseholds | null>(null);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [assignedError, setAssignedError] = useState("");
  const central = user?.role === "central_admin" || user?.role === "central_data_manager";
  const dateError = period === "date" && !validDate(date) ? "Select a valid submission date."
    : period === "range" && (!validDate(dateFrom) || !validDate(dateTo)) ? "Select both From and To dates."
    : period === "range" && dateFrom > dateTo ? "To date must be on or after From date." : "";

  useEffect(() => {
    let cancelled = false;
    setError("");
    if (dateError) { setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams({ period });
    if (period === "date") params.set("date", date);
    if (period === "range") { params.set("date_from", dateFrom); params.set("date_to", dateTo); }
    if (central && siteId) params.set("site_id", siteId);
    if (locality) params.set("locality_code", locality);
    if (userId) params.set("user_id", userId);
    api.get<OperationsDashboard>(`/dashboard/operations?${params}`)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the dashboard."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, date, dateFrom, dateTo, dateError, siteId, locality, userId, revision, user?.user_id, central]);

  useEffect(() => {
    let cancelled = false;
    setAssignedError("");
    if (!userId || dateError) { setAssignedData(null); setAssignedLoading(false); return; }
    setAssignedLoading(true);
    const params = new URLSearchParams({ user_id: userId, period, page: String(householdPage) });
    if (period === "date") params.set("date", date);
    if (period === "range") { params.set("date_from", dateFrom); params.set("date_to", dateTo); }
    if (central && siteId) params.set("site_id", siteId);
    if (locality) params.set("locality_code", locality);
    api.get<DashboardAssignedHouseholds>(`/dashboard/assigned-households?${params}`)
      .then((result) => { if (!cancelled) setAssignedData(result); })
      .catch((reason) => { if (!cancelled) setAssignedError(reason instanceof Error ? reason.message : "Could not load assigned households."); })
      .finally(() => { if (!cancelled) setAssignedLoading(false); });
    return () => { cancelled = true; };
  }, [period, date, dateFrom, dateTo, dateError, siteId, locality, userId, householdPage, revision, user?.user_id, central]);

  const selectedSite = central ? siteId : String(data?.scope.site_id ?? user?.site_id ?? "");
  const localities = (data?.localities ?? []).filter((item) => !selectedSite || String(item.site_id) === selectedSite);
  const selectedUser = data?.staff_options.find((staff) => staff.user_id === userId);
  const periodLabel = period === "all" ? "All time" : period === "today" ? "Today (IST)" : period === "date" ? date : `${dateFrom} to ${dateTo} (inclusive)`;
  const currentError = dateError || error;

  return <div className={styles.container}>
    <header className={styles.heading}>
      <div><h1>Village dashboard</h1><p>Forms filled in each village, by staff and submission date</p></div>
      <span className={styles.updated}>{data && !loading && !currentError ? `Updated ${syncTime(data.generated_at)} IST` : ""}</span>
    </header>
    <div className={styles.filters}>
      <label>Site<select value={selectedSite} disabled={!central} onChange={(event) => { setSiteId(event.target.value); setLocality(""); setUserId(""); setHouseholdPage(1); }}>
        {central && <option value="">All sites</option>}
        {!central && !data && <option value={selectedSite}>Your site</option>}
        {(data?.sites ?? []).map((site) => <option key={site.site_id} value={site.site_id}>{site.site_name}</option>)}
      </select></label>
      <label>Village<select value={locality ? `${selectedSite}:${locality}` : ""} onChange={(event) => { const [site, code] = event.target.value.split(":"); if (central && site) setSiteId(site); setLocality(code || ""); setUserId(""); setHouseholdPage(1); }}>
        <option value="">All villages</option>
        {localities.map((item) => <option key={`${item.site_id}:${item.locality_code}`} value={`${item.site_id}:${item.locality_code}`}>{!selectedSite ? `${data?.sites.find((site) => site.site_id === item.site_id)?.site_name} - ` : ""}{item.locality_code} - {item.locality_name}</option>)}
      </select></label>
      <label>User<select value={userId} onChange={(event) => { setUserId(event.target.value); setHouseholdPage(1); }}>
        <option value="">All users</option>
        {(data?.staff_options ?? []).map((staff) => <option key={staff.user_id} value={staff.user_id}>{staff.display_name || staff.username}{staff.display_name && staff.display_name !== staff.username ? ` (${staff.username})` : ""}</option>)}
      </select></label>
      <label>Date<select value={period} onChange={(event) => { setPeriod(event.target.value as Period); setHouseholdPage(1); }}>
        <option value="all">All</option><option value="today">Today</option><option value="date">Specific date</option><option value="range">Date range</option>
      </select></label>
      {period === "date" && <label>Submission date (IST)<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setHouseholdPage(1); }} required /></label>}
      {period === "range" && <label>From date (IST)<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setHouseholdPage(1); }} required /></label>}
      {period === "range" && <label>To date (IST)<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setHouseholdPage(1); }} required /></label>}
      <button className={styles.primaryButton} onClick={() => setRevision((value) => value + 1)} disabled={loading || !!dateError}>Refresh</button>
    </div>
    <p className={styles.periodSummary}><strong>{periodLabel}</strong> | {userId ? `${selectedUser?.display_name || selectedUser?.username || "Selected user"}'s forms only` : "All users' forms"}. Accepted, server-synced submissions; offline work appears after sync. Dates use IST. Assigned staff are current assignments.</p>
    <div className={styles.contentScroll}>
    {loading ? <div className={styles.state} role="status">Loading village forms...</div>
      : currentError ? <div className={styles.state} role="alert"><strong>Dashboard could not be loaded</strong><p>{currentError}</p>{!dateError && <button onClick={() => setRevision((value) => value + 1)}>Try again</button>}</div>
      : data && <section className={styles.cardsSection} aria-label="Village form totals">
        {data.localities_summary.length === 0 ? <p className={styles.empty}>No villages match these filters.</p>
          : <div className={styles.villageGrid}>{data.localities_summary.map((village) => {
            const codes = [...FORM_CODES, ...Object.keys(village.forms_by_code).filter((code) => !FORM_CODES.includes(code)).sort()];
            return <article key={`${village.site_id}:${village.locality_code}`} className={styles.villageCard} aria-label={`${village.locality_name} (${village.locality_code})`}>
              <header className={styles.cardHeading}><div><span className={styles.siteName}>{data.sites.find((site) => site.site_id === village.site_id)?.site_name}</span><h2>{village.locality_name} <span>({village.locality_code})</span></h2></div><div className={styles.cardTotal}><strong>{count(village.forms_completed)}</strong><span>Total forms</span></div></header>
              <div className={styles.assignees}><h3>Assigned staff</h3>{village.assigned_users.length ? <ul>{village.assigned_users.map((staff) => <li key={staff.user_id} className={staff.user_id === userId ? styles.selectedStaff : undefined}>{staff.display_name || staff.username}{staff.display_name && staff.display_name !== staff.username ? ` (${staff.username})` : ""}</li>)}</ul> : <p>No staff currently assigned</p>}</div>
              <dl className={styles.formCounts}>{codes.map((code) => <div key={code}><dt>{formLabel(code)}</dt><dd><strong>{count(village.forms_by_code[code] ?? 0)}</strong> <span>forms filled</span></dd></div>)}</dl>
            </article>;
          })}</div>}
      </section>}
      <section className={styles.householdPanel} aria-label="Assigned household status">
        <header className={styles.householdHeading}><h2>Assigned households{userId ? ` - ${selectedUser?.display_name || selectedUser?.username || "Selected user"}` : ""}</h2><p>{periodLabel}. Rows show current BHQ status, using the same rules as the assignment page. A selected period includes this user's submissions or saved drafts in that period; choose All to include untouched pending households.</p></header>
        {!userId ? <p className={styles.empty}>Select a user above to see their assigned households.</p>
          : dateError ? <p className={styles.empty}>Select valid dates to view assigned households.</p>
          : assignedLoading ? <p className={styles.empty} role="status">Loading assigned households...</p>
          : assignedError ? <div className={styles.state} role="alert"><p>{assignedError}</p><button onClick={() => setRevision((value) => value + 1)}>Retry households</button></div>
          : assignedData && <>
            <div className={styles.householdSummary} aria-label="Household totals">
              <span>{period === "all" ? "Assigned" : "Households in period"}: <strong>{count(assignedData.summary.assigned)}</strong></span>
              <span>Completed: <strong>{count(assignedData.summary.completed)}</strong></span><span>Draft: <strong>{count(assignedData.summary.draft)}</strong></span><span>Excluded: <strong>{count(assignedData.summary.excluded)}</strong></span><span>Pending: <strong>{count(assignedData.summary.pending)}</strong></span><span>{period === "all" ? "Left to complete BHQ" : "Left among matching households"}: <strong>{count(assignedData.summary.draft + assignedData.summary.pending)}</strong></span>
            </div>
            <p className={styles.statusLegend}>Green: completed BHQ synced | Yellow: backed-up BHQ draft | Rose: excluded | White: pending</p>
            <div className={styles.householdTableScroll}><table><thead><tr><th scope="col">Household ID</th><th scope="col">Head name</th><th scope="col">Site</th><th scope="col">Village</th><th scope="col">BHQ status</th><th scope="col">Activity (IST)</th></tr></thead><tbody>{assignedData.rows.length ? assignedData.rows.map((row) => <tr key={row.household_id} data-household-id={row.household_id} className={row.bhq_status === "completed" ? styles.completedRow : row.bhq_status === "draft" ? styles.draftRow : row.bhq_status === "excluded" ? styles.excludedRow : undefined}>
              <td>{row.household_id}</td><td>{row.household_head_name || "-"}</td><td>{row.site_name}</td><td>{row.locality_name} ({row.locality_code})</td><td><span className={styles.statusBadge}>{row.bhq_status === "completed" ? "Completed" : row.bhq_status === "draft" ? "Draft" : row.bhq_status === "excluded" ? "Excluded" : "Pending"}</span></td><td>{row.last_activity_at ? syncTime(row.last_activity_at) : "No synced activity"}</td>
            </tr>) : <tr><td colSpan={6} className={styles.empty}>No assigned households match these filters.</td></tr>}</tbody></table></div>
            <div className={styles.householdPagination}><span>Showing {assignedData.rows.length ? count((assignedData.page - 1) * 50 + 1) : "0"}-{count(Math.min(assignedData.page * 50, assignedData.summary.assigned))} of {count(assignedData.summary.assigned)}</span><div><button type="button" disabled={assignedData.page <= 1} onClick={() => setHouseholdPage((page) => page - 1)}>Previous households</button><span>Page {assignedData.page} of {assignedData.total_pages}</span><button type="button" disabled={assignedData.page >= assignedData.total_pages} onClick={() => setHouseholdPage((page) => page + 1)}>Next households</button></div></div>
          </>}
      </section>
    </div>
  </div>;
}

function StudySummary() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get<DashboardStats>("/dashboard").then((result) => { if (!cancelled) setStats(result); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [user?.user_id]);
  const cards: [string, keyof DashboardStats][] = [["Households", "households"], ["Active pregnancies", "active_pregnancies"], ["Household members", "members"], ["Eligible women", "eligible_women"], ["Tracking eligible", "tracking_eligible_women"], ["Children", "children"], ["Tasks", "tasks"], ["Open data quality flags", "open_data_quality_flags"]];
  return <div className={styles.container}><header className={styles.heading}><div><h1>Dashboard</h1><p>Welcome, {user?.display_name || user?.username}</p></div></header>{error && <p role="alert">Could not load the study summary. Please refresh the page.</p>}<div className={styles.statsGrid}>{cards.map(([label, key]) => <div className={styles.statCard} key={key}><span className={styles.statLabel}>{label}</span><strong className={styles.statValue}>{stats ? count(stats[key]) : "—"}</strong></div>)}</div></div>;
}
