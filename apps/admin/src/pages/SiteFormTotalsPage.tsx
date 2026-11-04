import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import type { DashboardWorkload, SiteFormTotals, SiteOperationalProgress } from "../../../../shared/siteFormTotals";
import styles from "./SiteFormTotalsPage.module.css";

const FORM_CODES = ["HHQ", "WQ", "PEF", "PSF", "PFF", "HRF", "UF", "POF", "BAF", "SBF", "NFF", "CDF"];
const WORKLOAD_KEYS = ["completed", "draft", "pending", "upcoming", "closed", "overdue"] as const;
const formLabel = (code: string) => code === "HHQ" ? "BHQ" : code === "WQ" ? "BWQ" : code;
const count = (value: number) => value.toLocaleString("en-IN");
const percent = (value: number, total: number) => {
  if (total <= 0) return "—";
  const percentage = value * 100 / total;
  if (value > 0 && percentage < 0.1) return "<0.1%";
  if (value < total && percentage > 99.9) return ">99.9%";
  return `${percentage.toFixed(1)}%`;
};
const emptyWorkload = (): DashboardWorkload => ({ completed: 0, draft: 0, pending: 0, upcoming: 0, closed: 0, overdue: 0 });
const actionable = (tasks: DashboardWorkload) => tasks.completed + tasks.draft + tasks.pending;

function summarize(sites: SiteFormTotals["sites"]): SiteOperationalProgress {
  const result: SiteOperationalProgress = {
    households: { total: 0, assigned: 0, completed: 0, draft: 0, pending: 0, closed: 0 },
    tasks: emptyWorkload(), tasks_by_code: {}, active_field_workers: 0, eligible_women: 0, active_pregnancies: 0,
  };
  for (const { progress } of sites) {
    for (const key of ["total", "assigned", "completed", "draft", "pending", "closed"] as const) result.households[key] += progress.households[key];
    for (const key of WORKLOAD_KEYS) result.tasks[key] += progress.tasks[key];
    for (const [code, tasks] of Object.entries(progress.tasks_by_code)) {
      const target = result.tasks_by_code[code] ??= emptyWorkload();
      for (const key of WORKLOAD_KEYS) target[key] += tasks[key];
    }
    result.active_field_workers += progress.active_field_workers;
    result.eligible_women += progress.eligible_women;
    result.active_pregnancies += progress.active_pregnancies;
  }
  return result;
}

function segments(values: { label: string; value: number; color: string }[], total: number) {
  return <>
    <div className={styles.stackedBar} aria-hidden="true">{values.map(({ label, value, color }) => <span key={label} style={{ width: `${total ? value * 100 / total : 0}%`, background: color }} />)}</div>
    <dl className={styles.legend}>{values.map(({ label, value, color }) => <div key={label}>
      <dt><i style={{ background: color }} />{label}</dt><dd>{count(value)} <span>{percent(value, total)}</span></dd>
    </div>)}</dl>
  </>;
}

export default function SiteFormTotalsPage() {
  const { user } = useAuth();
  if (user?.role !== "central_admin" && user?.role !== "site_data_manager") return <Navigate to="/dashboard" replace />;
  return <SiteFormTotalsView key={`${user.user_id}:${user.role}:${user.site_id}`} />;
}

function SiteFormTotalsView() {
  const [data, setData] = useState<SiteFormTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [siteFilter, setSiteFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.get<SiteFormTotals>("/dashboard/site-form-totals")
      .then((result) => { if (!cancelled) setData(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load study progress."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const sites = data?.sites.filter((site) => !siteFilter || String(site.site_id) === siteFilter) ?? [];
  const progress = summarize(sites);
  const households = progress.households, tasks = progress.tasks;
  const taskTotal = actionable(tasks);
  const forms = sites.reduce((sum, site) => sum + site.total, 0);
  const formsByCode: Record<string, number> = {};
  for (const site of sites) for (const [code, value] of Object.entries(site.forms_by_code)) formsByCode[code] = (formsByCode[code] ?? 0) + value;
  const codes = [...FORM_CODES, ...[...new Set([...Object.keys(formsByCode), ...Object.keys(progress.tasks_by_code)])].filter((code) => !FORM_CODES.includes(code)).sort()];
  const householdSegments = [
    { label: "Completed BHQ", value: households.completed, color: "#16835b" },
    { label: "Backed-up draft", value: households.draft, color: "#e6ad26" },
    { label: "Not yet completed", value: households.pending, color: "#d9e3ed" },
    { label: "Closed / excluded", value: households.closed, color: "#66758a" },
  ];
  const taskSegments = [
    { label: "Completed", value: tasks.completed, color: "#16835b" },
    { label: "Draft", value: tasks.draft, color: "#e6ad26" },
    { label: "Left now", value: tasks.pending, color: "#387bd6" },
  ];
  let angle = 0;
  const gradient = householdSegments.map(({ value, color }) => {
    const start = angle; angle += households.total ? value * 100 / households.total : 0;
    return `${color} ${start}% ${angle}%`;
  }).join(", ");

  return <div className={styles.container}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>DYNAMIC · STUDY DELIVERY</span><h1>Operational dashboard</h1><p>All-time progress and current workload</p></div>
      <div className={styles.actions}>
        {data && data.sites.length > 1 && <label>Study site<select aria-label="Study site" value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
          <option value="">All sites</option>{data.sites.map((site) => <option key={site.site_id} value={site.site_id}>{site.site_name}</option>)}
        </select></label>}
        <Link to="/staff-dashboard">Staff dashboard</Link>
        <button onClick={() => setRevision((value) => value + 1)} disabled={loading}>Refresh</button>
      </div>
    </header>
    {loading ? <div className={styles.state} role="status">Loading study progress…</div>
      : error ? <div className={styles.state} role="alert"><strong>Study progress could not be loaded</strong><p>{error}</p><button onClick={() => setRevision((value) => value + 1)}>Try again</button></div>
      : data && <div className={styles.content}>
        <div className={styles.context}><span>{sites.length === 1 ? sites[0].site_name : `${sites.length} study sites`} · Server-synced records</span><span>Updated {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(data.generated_at))} IST</span></div>
        {sites.length === 0 ? <div className={styles.state}>No study sites found.</div> : <>
          <div className={styles.kpis}>
            <article><span>Accepted forms received</span><strong>{count(forms)}</strong><small>All questionnaire types · field staff</small></article>
            <article><span>Tasks completed</span><strong>{percent(tasks.completed, taskTotal)}</strong><small>{count(tasks.completed)} of {count(taskTotal)} actionable tasks · all forms</small></article>
            <article><span>Work open now</span><strong>{count(tasks.pending + tasks.draft)}</strong><small>{count(tasks.draft)} drafts · {count(tasks.upcoming)} upcoming separately</small></article>
            <article className={tasks.overdue ? styles.attention : undefined}><span>Overdue tasks</span><strong>{count(tasks.overdue)}</strong><small>Included in work open now</small></article>
          </div>
          <section className={`${styles.panel} ${styles.formOverview}`} aria-label="Questionnaire progress cards">
            <header><div><h2>Progress by questionnaire</h2><p>Each form at a glance · task completion excludes upcoming and inactive work</p></div></header>
            <div className={styles.formCards}>{codes.map((code) => {
              const t = progress.tasks_by_code[code] ?? emptyWorkload(), total = actionable(t);
              return <article key={code} className={styles.formCard} aria-label={`${formLabel(code)} progress`}>
                <header><h3>{formLabel(code)}</h3><strong>{percent(t.completed, total)}</strong></header>
                <p className={styles.received}>Accepted forms <b>{count(formsByCode[code] ?? 0)}</b></p>
                <div className={styles.formBar} aria-hidden="true">
                  <span style={{ width: `${total ? t.completed * 100 / total : 0}%`, background: "#16835b" }} />
                  <span style={{ width: `${total ? t.draft * 100 / total : 0}%`, background: "#e6ad26" }} />
                  <span style={{ width: `${total ? t.pending * 100 / total : 0}%`, background: "#387bd6" }} />
                </div>
                <dl className={styles.formCounts}>
                  <div><dt>Completed tasks</dt><dd>{count(t.completed)}</dd></div>
                  <div><dt>Draft</dt><dd>{count(t.draft)}</dd></div>
                  <div><dt>Left now</dt><dd>{count(t.pending)}</dd></div>
                </dl>
                <footer>{total === 0 && <span>{t.upcoming > 0 ? "Upcoming only" : "No actionable tasks"}</span>}<span>{count(t.upcoming)} upcoming · {count(t.closed)} inactive</span></footer>
              </article>;
            })}</div>
          </section>
          <div className={styles.overview}>
            <section className={styles.panel} aria-label="Household coverage">
              <header><div><h2>Household coverage</h2><p>Every registered household, counted once</p></div><span className={styles.pill}>BHQ</span></header>
              <div className={styles.coverage}>
                <div className={styles.donut} style={{ background: households.total ? `conic-gradient(${gradient})` : "#e8edf3" }} aria-hidden="true"><div><strong>{percent(households.completed, households.total)}</strong><span>surveyed</span></div></div>
                <div className={styles.coverageLegend}>{segments(householdSegments, households.total)}</div>
              </div>
              <footer><span><strong>{count(households.assigned)}</strong> assigned · <strong>{count(households.total - households.assigned)}</strong> unassigned</span><span>Assignment coverage {percent(households.assigned, households.total)}</span></footer>
            </section>
            <section className={styles.panel} aria-label="Form task delivery">
              <header><div><h2>Actionable task delivery</h2><p>Completed work and tasks currently open</p></div><strong className={styles.deliveryPercent}>{percent(tasks.completed, taskTotal)}</strong></header>
              <div className={styles.taskSummary}><strong>{count(tasks.completed)}</strong><span>completed / {count(taskTotal)} actionable tasks</span></div>
              {segments(taskSegments, taskTotal)}
              <footer><span><strong>{count(tasks.upcoming)}</strong> upcoming · not yet due</span><span>{count(tasks.closed)} closed / cancelled / disabled</span><span>Both outside this percentage</span></footer>
            </section>
          </div>
          <div className={styles.cohort}>
            <span><strong>{count(progress.active_field_workers)}</strong> active field staff</span>
            <span><strong>{count(progress.eligible_women)}</strong> women registered for BWQ</span>
            <span><strong>{count(progress.active_pregnancies)}</strong> active pregnancies</span>
          </div>
          <section className={styles.panel} aria-label="Site progress comparison">
            <header><div><h2>Site progress</h2><p>Compare coverage and the workload needing attention</p></div></header>
            <div className={styles.tableScroll}><table><thead><tr><th>Site</th><th>BHQ coverage</th><th>Draft households</th><th>Pending households</th><th>Closed households</th><th>Assigned</th><th>Open tasks</th><th>Overdue</th><th>Accepted forms</th></tr></thead>
              <tbody>{sites.map((site) => { const h = site.progress.households, t = site.progress.tasks; return <tr key={site.site_id}>
                <th scope="row">{site.site_name}</th><td><div className={styles.miniProgress}><span>{percent(h.completed, h.total)}</span><i><b style={{ width: `${h.total ? h.completed * 100 / h.total : 0}%` }} /></i></div><small>{count(h.completed)} / {count(h.total)}</small></td>
                <td>{count(h.draft)}</td><td>{count(h.pending)}</td><td>{count(h.closed)}</td><td>{count(h.assigned)}</td><td>{count(t.pending + t.draft)}</td><td className={t.overdue ? styles.danger : undefined}>{count(t.overdue)}</td><td>{count(site.total)}</td>
              </tr>; })}</tbody></table></div>
          </section>
          <section className={styles.panel} aria-label="Questionnaire workload">
            <header><div><h2>Questionnaire workload</h2><p>Received forms and task progress have separate totals</p></div></header>
            <div className={styles.tableScroll}><table><thead><tr><th>Form</th><th>Accepted forms</th><th>Tasks completed</th><th>Draft tasks</th><th>Left now</th><th>Upcoming</th><th>Inactive / closed</th><th>Task completion</th></tr></thead><tbody>
              {codes.map((code) => { const t = progress.tasks_by_code[code] ?? emptyWorkload(), total = actionable(t); return <tr key={code}>
                <th scope="row">{formLabel(code)}</th><td>{count(formsByCode[code] ?? 0)}</td><td>{count(t.completed)}</td><td>{count(t.draft)}</td><td>{count(t.pending)}</td><td>{count(t.upcoming)}</td><td>{count(t.closed)}</td>
                <td><div className={styles.miniProgress}><span>{percent(t.completed, total)}</span><i><b style={{ width: `${total ? t.completed * 100 / total : 0}%` }} /></i></div></td>
              </tr>; })}
            </tbody></table></div>
          </section>
          <p className={styles.note}>Household coverage uses all registered households. Task completion uses completed + draft + left now; upcoming, closed, cancelled and disabled tasks are outside that percentage. Drafts are server backups; unsynced phone work is not visible. Accepted form totals retain their existing rules and can differ from CSV exports.</p>
        </>}
      </div>}
  </div>;
}
