import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import type { DashboardMetrics, DashboardStaffRow, OperationsDashboard } from "../../../../shared/operationsDashboard";
import styles from "./DashboardPage.module.css";

type DashboardStats = { households: number; members: number; eligible_women: number; tracking_eligible_women: number; active_pregnancies: number; children: number; tasks: number; open_data_quality_flags: number };
type View = "staff" | "forms" | "villages" | "sites";
const OPERATION_ROLES = ["central_admin", "central_data_manager", "site_data_manager", "site_research_scientist", "site_investigator"];
const FORM_CODES = ["HHQ", "WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "PSF"];
const formLabel = (code: string) => code === "HHQ" ? "BHQ" : code === "WQ" ? "BWQ" : code;
const count = (value: number) => value.toLocaleString("en-IN");
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function syncTime(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
function StaffName({ row }: { row: DashboardStaffRow }) {
  return <><strong>{row.display_name || row.username}</strong><span className={styles.secondary}>{row.username} · {row.active ? "Active" : "Inactive"}</span><span className={styles.secondary}>{row.role.replace(/_/g, " ")} · {row.site_name || "No site"}</span></>;
}
function TaskCounts({ row }: { row: DashboardMetrics }) {
  return <>{count(row.pending_tasks)}<span className={row.overdue_tasks ? styles.warning : styles.secondary}>{count(row.overdue_tasks)} overdue</span></>;
}
function FormCounts({ row }: { row: DashboardMetrics }) {
  return <span className={styles.secondary}>{Object.entries(row.forms_by_code).filter(([, value]) => value > 0).map(([code, value]) => `${formLabel(code)} ${count(value)}`).join(" · ") || "No completed forms"}</span>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  return user && OPERATION_ROLES.includes(user.role) ? <OperationsView key={user.user_id} /> : <StudySummary key={user?.user_id} />;
}

function OperationsView() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayInIndia);
  const [siteId, setSiteId] = useState("");
  const [locality, setLocality] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("staff");
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const central = user?.role === "central_admin" || user?.role === "central_data_manager";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ date });
    if (central && siteId) params.set("site_id", siteId);
    if (locality) params.set("locality_code", locality);
    api.get<OperationsDashboard>(`/dashboard/operations?${params}`)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the dashboard."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, siteId, locality, revision, user?.user_id, central]);

  const users = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (data?.users ?? []).filter((row) => !term || `${row.display_name} ${row.username} ${row.role} ${row.site_name} ${row.assigned_localities.map((item) => `${item.locality_code} ${item.locality_name}`).join(" ")}`.toLocaleLowerCase().includes(term));
  }, [data, search]);
  const formCodes = useMemo(() => [...FORM_CODES, ...Object.keys(data?.totals.forms_by_code ?? {}).filter((code) => !FORM_CODES.includes(code)).sort()], [data]);
  const selectedSite = central ? siteId : String(data?.scope.site_id ?? user?.site_id ?? "");
  const localities = (data?.localities ?? []).filter((item) => !selectedSite || String(item.site_id) === selectedSite);
  const totals = !loading && !error ? data?.totals : null;
  const cards = [
    ["Staff forms filled", totals?.forms_completed, "Completed on the selected date with recorded staff attribution; successfully synced records only."],
    ["Assigned households", totals?.assigned_households, "Current unique household assignments in the selected area."],
    ["Backed-up drafts", totals?.backed_up_drafts, "Current drafts backed up to the server; device-only drafts are unavailable."],
    ["Pending tasks", totals?.pending_tasks, "Current pending and in-progress tasks."],
    ["Overdue tasks", totals?.overdue_tasks, "Pending tasks whose deadline has passed by the selected date."],
    ["Recorded sync issues", totals?.sync_errors, "Failed or partially successful sync requests on the selected date. Successful repeat uploads are excluded."],
  ] as const;
  const studyCards = !loading && !error && data?.cohort ? [
    ["Households", data.cohort.households],
    ["Household members", data.cohort.members],
    ["Eligible women", data.cohort.eligible_women],
    ["Tracking eligible", data.cohort.tracking_eligible_women],
    ["Active pregnancies", data.cohort.active_pregnancies],
    ["Children", data.cohort.children],
  ] as const : [];

  return <div className={styles.container}>
    <header className={styles.heading}><div><h1>Dashboard</h1><p>{central ? "Study-wide staff and village activity" : `${data?.sites.find((site) => String(site.site_id) === selectedSite)?.site_name || "Your site"} · staff and village activity`}</p></div><span className={styles.updated}>{data && !loading && !error ? `Updated ${syncTime(data.generated_at)} IST` : ""}</span></header>
    <div className={styles.filters}>
      <label>Date (IST)<input type="date" value={date} max={todayInIndia()} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label>
      <label>Site<select value={selectedSite} disabled={!central} onChange={(event) => { setSiteId(event.target.value); setLocality(""); }}>
        {central && <option value="">All sites</option>}
        {!central && !data && <option value={selectedSite}>Your site</option>}
        {(data?.sites ?? []).map((site) => <option key={site.site_id} value={site.site_id}>{site.site_name}</option>)}
      </select></label>
      <label>Village / locality<select value={locality ? `${selectedSite}:${locality}` : ""} onChange={(event) => { const [site, code] = event.target.value.split(":"); if (central && site) setSiteId(site); setLocality(code || ""); }}><option value="">All assigned villages</option>{localities.map((item) => <option key={`${item.site_id}:${item.locality_code}`} value={`${item.site_id}:${item.locality_code}`}>{!selectedSite ? `${data?.sites.find((site) => site.site_id === item.site_id)?.site_name} · ` : ""}{item.locality_code} · {item.locality_name}</option>)}</select></label>
      <label className={styles.search}>Find staff<input type="search" placeholder="Name, username or village" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <button className={styles.primaryButton} onClick={() => setRevision((value) => value + 1)} disabled={loading}>Refresh</button>
    </div>
    <div className={styles.statsGrid}>{cards.map(([label, value, help]) => <div key={label} className={styles.statCard} title={help}><span className={styles.statLabel}>{label}</span><strong className={styles.statValue}>{value === undefined ? "—" : count(value)}</strong></div>)}</div>
    {totals && totals.unattributed_forms > 0 && <p className={styles.attributionNotice}>{count(totals.unattributed_forms)} additional completed forms have no recorded staff attribution.</p>}
    <details className={styles.studyTotals}><summary>Study totals <span>Current records in the selected site / locality</span></summary><div className={styles.statsGrid}>{studyCards.map(([label, value]) => <div key={label}><span className={styles.statLabel}>{label}</span><strong className={styles.statValue}>{loading || error ? "—" : count(value)}</strong></div>)}</div></details>
    <details className={styles.notes}><summary>Showing server-synced activity only · villages are assignments, not live locations</summary><div><p>Forms filled refers to completion on the selected date, even if received later. Assignments, backed-up drafts and task statuses are current. Work still only on a phone becomes visible after sync. Staff search filters the staff tables; summary totals follow the date and area filters.</p>{data?.notes.map((note) => <p key={note}>{note}</p>)}{totals && <p>{count(totals.forms_received)} forms received on this date · {count(totals.unattributed_forms)} completed forms without staff attribution · {count(totals.open_data_quality_flags)} open data quality flags.</p>}</div></details>
    <section className={styles.tablePanel} aria-label="Operational activity">
      <div className={styles.tableToolbar}><div className={styles.tabs} role="group" aria-label="Dashboard view">{([["staff", "Staff overview"], ["forms", "Forms by staff"], ["villages", "Village activity"], ...(central ? [["sites", "Site activity"]] : [])] as [View, string][]).map(([key, label]) => <button key={key} aria-pressed={view === key} className={view === key ? styles.activeTab : styles.tab} onClick={() => setView(key)}>{label}</button>)}</div><span className={styles.rowCount}>{!loading && !error && data ? `${count(view === "staff" || view === "forms" ? users.length : view === "villages" ? data.localities_summary.length : data.sites_summary.length)} ${view === "staff" || view === "forms" ? "users" : view === "villages" ? "villages" : "sites"}` : ""}</span></div>
      {loading ? <div className={styles.state} role="status">Loading dashboard…</div> : error ? <div className={styles.state} role="alert"><strong>Dashboard could not be loaded</strong><p>{error}</p><button onClick={() => setRevision((value) => value + 1)}>Try again</button></div> : data && <div className={styles.tableScroll}>
        {view === "staff" && <table className={styles.staffTable}><thead><tr><th scope="col">Staff</th><th scope="col">Assigned villages</th><th scope="col">Households assigned</th><th scope="col">Forms by staff</th><th scope="col">Backed-up drafts</th><th scope="col">Tasks pending</th><th scope="col">Sync issues</th><th scope="col">Last server contact (IST)</th></tr></thead><tbody>{users.length ? users.map((row) => <tr key={row.user_id}><td><StaffName row={row} /></td><td>{row.assigned_localities.length ? row.assigned_localities.map((item) => <span key={`${item.site_id}:${item.locality_code}`} className={styles.village}>{item.locality_code} · {item.locality_name}</span>) : <span className={styles.secondary}>None assigned</span>}{row.completed_localities?.length > 0 && <span className={styles.worked}>Forms filled: {row.completed_localities.map((item) => `${item.locality_code} · ${item.locality_name}`).join(", ")}</span>}</td><td>{count(row.assigned_households)}</td><td><strong>{count(row.forms_completed)}</strong></td><td>{count(row.backed_up_drafts)}</td><td><TaskCounts row={row} /></td><td className={row.sync_errors ? styles.issueCount : undefined}>{count(row.sync_errors)}</td><td>{syncTime(row.last_sync_at)}<span className={styles.secondary}>{row.last_sync_status?.replace(/_/g, " ") || "No server contact"}</span></td></tr>) : <tr><td colSpan={8} className={styles.empty}>No staff match these filters.</td></tr>}</tbody></table>}
        {view === "forms" && <table className={styles.formsTable}><thead><tr><th scope="col">Staff</th><th scope="col">Total</th>{formCodes.map((code) => <th scope="col" key={code}>{formLabel(code)}</th>)}</tr></thead><tbody>{users.length ? users.map((row) => <tr key={row.user_id}><td><StaffName row={row} /></td><td><strong>{count(row.forms_completed)}</strong></td>{formCodes.map((code) => <td key={code}>{count(row.forms_by_code[code] ?? 0)}</td>)}</tr>) : <tr><td className={styles.empty} colSpan={formCodes.length + 2}>No staff match these filters.</td></tr>}</tbody><tfoot><tr><th scope="row">Staff-attributed area total</th><td>{count(data.totals.forms_completed)}</td>{formCodes.map((code) => <td key={code}>{count(data.totals.forms_by_code[code] ?? 0)}</td>)}</tr></tfoot></table>}
        {(view === "villages" || view === "sites") && <table className={styles.areaTable}><thead><tr><th scope="col">{view === "villages" ? "Village / locality" : "Site"}</th><th scope="col">Staff</th><th scope="col">Households assigned</th><th scope="col">Forms by staff</th><th scope="col">Backed-up drafts</th><th scope="col">Tasks pending</th><th scope="col">Sync issues</th></tr></thead><tbody>{(view === "villages" ? data.localities_summary : data.sites_summary).length ? (view === "villages" ? data.localities_summary : data.sites_summary).map((row) => <tr key={`${row.site_id}:${"locality_code" in row ? row.locality_code : "site"}`}><td>{"locality_code" in row ? <><strong>{row.locality_code} · {row.locality_name}</strong><span className={styles.secondary}>{data.sites.find((site) => site.site_id === row.site_id)?.site_name}</span></> : <strong>{row.site_name}</strong>}</td><td>{count(row.users)}</td><td>{count(row.assigned_households)}</td><td><strong>{count(row.forms_completed)}</strong><FormCounts row={row} /></td><td>{count(row.backed_up_drafts)}</td><td><TaskCounts row={row} /></td><td className={view === "sites" && row.sync_errors ? styles.issueCount : undefined}>{view === "villages" ? <span title="Sync requests cannot reliably be assigned to a single village.">—</span> : count(row.sync_errors)}</td></tr>) : <tr><td colSpan={7} className={styles.empty}>No {view === "villages" ? "villages" : "sites"} match these filters.</td></tr>}</tbody></table>}
      </div>}
    </section>
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
