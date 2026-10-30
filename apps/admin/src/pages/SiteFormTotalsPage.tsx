import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import type { SiteFormTotals } from "../../../../shared/siteFormTotals";
import styles from "./SiteFormTotalsPage.module.css";

const FORM_CODES = ["HHQ", "WQ", "PEF", "PSF", "PFF", "HRF", "UF", "POF", "BAF", "SBF", "NFF", "CDF"];
const formLabel = (code: string) => code === "HHQ" ? "BHQ" : code === "WQ" ? "BWQ" : code;
const count = (value: number) => value.toLocaleString("en-IN");

export default function SiteFormTotalsPage() {
  const { user } = useAuth();
  if (user?.role !== "central_admin") return <Navigate to="/dashboard" replace />;
  return <SiteFormTotalsView key={user.user_id} />;
}

function SiteFormTotalsView() {
  const [data, setData] = useState<SiteFormTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.get<SiteFormTotals>("/dashboard/site-form-totals")
      .then((result) => { if (!cancelled) setData(result); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load site totals."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  return <div className={styles.container}>
    <header className={styles.heading}>
      <div><h1>Main dashboard</h1><p>All-time forms submitted by field staff, by site</p></div>
      <div className={styles.actions}>
        <Link to="/staff-dashboard">Staff dashboard</Link>
        <button onClick={() => setRevision((value) => value + 1)} disabled={loading}>Refresh</button>
      </div>
    </header>
    <p className={styles.note}>Accepted, synced submissions only. Drafts and work still on a phone are not included.</p>
    {loading ? <div className={styles.state} role="status">Loading site totals…</div>
      : error ? <div className={styles.state} role="alert"><strong>Site totals could not be loaded</strong><p>{error}</p><button onClick={() => setRevision((value) => value + 1)}>Try again</button></div>
      : data && <>
        <div className={styles.updated}>Updated {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(data.generated_at))} IST</div>
        <div className={styles.grid}>
          {data.sites.map((site) => {
            const codes = [...FORM_CODES, ...Object.keys(site.forms_by_code).filter((code) => !FORM_CODES.includes(code)).sort()];
            return <section className={styles.card} key={site.site_id} aria-label={`${site.site_name} form totals`}>
              <header className={styles.cardHeading}><div><span className={styles.siteId}>Site {site.site_id}</span><h2>{site.site_name}</h2></div><div className={styles.total}><span>Total forms</span><strong>{count(site.total)}</strong></div></header>
              <dl className={styles.forms}>{codes.map((code) => <div key={code}><dt>{formLabel(code)}</dt><dd>{count(site.forms_by_code[code] ?? 0)}</dd></div>)}</dl>
            </section>;
          })}
          {data.sites.length === 0 && <p className={styles.state}>No study sites found.</p>}
        </div>
      </>}
  </div>;
}
