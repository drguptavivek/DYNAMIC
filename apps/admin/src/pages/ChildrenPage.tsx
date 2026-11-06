import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import styles from "./ChildrenPage.module.css";

interface Child {
  child_id: string;
  sex?: number | null;
  birth_date?: string | null;
  age_months?: number | null;
  birth_status: string | null;
  current_vital_status: string | null;
  locality_code?: string | null;
  mother_name?: string | null;
}
interface Meta { total: number; page: number; per_page: number; }
const VITAL_COLORS: Record<string, string> = { alive: "#16a34a", dead: "#dc2626", unknown: "#6b7280" };
const SEX_LABELS: Record<number, string> = { 1: "Male", 2: "Female", 3: "Transgender" };

export default function ChildrenPage() {
  const [rows, setRows] = useState<Child[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, per_page: 20 });
  const [search, setSearch] = useState("");
  const [vitalStatus, setVitalStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const load = useCallback(async (page = 1) => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(page), per_page: "20" });
    if (search.trim()) params.set("search", search.trim());
    if (vitalStatus) params.set("current_vital_status", vitalStatus);
    try {
      const res = await api.getPage<Child[]>(`/children?${params}`);
      if (currentRequest !== requestId.current) return;
      setRows(res.data); setMeta(res.meta);
    } catch (err) {
      if (currentRequest !== requestId.current) return;
      setError(err instanceof Error ? err.message : "Could not load children.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [search, vitalStatus]);
  useEffect(() => { void load(1); return () => { requestId.current++; }; }, [load]);

  return <div className={styles.page}>
    <div className={styles.header}><h1>Children</h1><span className={styles.count}>{error ? "Count unavailable" : `${meta.total} total`}</span></div>
    <div className={styles.filters}>
      <input aria-label="Child or mother ID" placeholder="Search child or mother ID..." value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Vital status" value={vitalStatus} onChange={e => setVitalStatus(e.target.value)}><option value="">All vital statuses</option><option value="alive">Alive</option><option value="dead">Dead</option><option value="unknown">Unknown</option></select>
    </div>
    <div className={styles.tableScroll}>
      {loading ? <p role="status" className={styles.loading}>Loading children...</p> : error ? <div role="alert" className={styles.message}><p>{error}</p><button type="button" onClick={() => void load(meta.page)}>Retry</button></div> : rows.length === 0 ? <div role="status" className={styles.message}>
        {search.trim() || vitalStatus ? <p>No children match these filters.</p> : <><p>No children registered from study pregnancy outcomes yet.</p><p>Household members under 18 are listed under <Link to="/household-members">Household Members</Link>.</p></>}
      </div> : <table className={styles.table}>
        <thead><tr><th>Child ID</th><th>Sex</th><th>Birth Date</th><th>Age (mo)</th><th>Birth Status</th><th>Vital Status</th><th>Locality</th><th>Mother</th></tr></thead>
        <tbody>{rows.map(c => <tr key={c.child_id}>
          <td>{c.child_id}</td><td>{c.sex != null ? SEX_LABELS[c.sex] ?? "Unknown" : "—"}</td><td>{c.birth_date ?? "—"}</td><td>{c.age_months != null ? `${c.age_months}m` : "—"}</td>
          <td><span className={styles.badge}>{c.birth_status ?? "Unknown"}</span></td>
          <td><span className={styles.badge} style={{ backgroundColor: VITAL_COLORS[c.current_vital_status ?? "unknown"] || "#6b7280" }}>{c.current_vital_status ?? "Unknown"}</span></td>
          <td>{c.locality_code ?? "—"}</td><td>{c.mother_name ?? "—"}</td>
        </tr>)}</tbody>
      </table>}
    </div>
    <div className={styles.pagination}>
      <button disabled={loading || !!error || meta.page <= 1} onClick={() => void load(meta.page - 1)}>Previous</button>
      <span>Page {meta.page} of {Math.ceil(meta.total / meta.per_page) || 1}</span>
      <button disabled={loading || !!error || meta.page >= Math.ceil(meta.total / meta.per_page)} onClick={() => void load(meta.page + 1)}>Next</button>
    </div>
  </div>;
}
