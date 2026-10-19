import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../lib/api";
import styles from "./PregnantWomenPage.module.css";

interface Pregnancy {
  pregnancy_id: string;
  member_name: string | null;
  household_id: string;
  locality_code: string;
  lmp_date: string | null;
  edd_date: string | null;
  gestational_age_at_enrollment: number | null;
  enrollment_date: string | null;
}

interface Meta {
  total: number;
  page: number;
  per_page: number;
}

export default function PregnantWomenPage() {
  const [rows, setRows] = useState<Pregnancy[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, per_page: 20 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(
    async (page = 1) => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      if (search.trim()) params.set("search", search.trim());
      try {
        const res = await api.getPage<Pregnancy[]>(`/pregnant-women?${params}`);
        if (currentRequest !== requestId.current) return;
        setRows(res.data);
        setMeta(res.meta);
      } catch (err) {
        if (currentRequest === requestId.current) {
          setError(err instanceof Error ? err.message : "Unable to load pregnant women");
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    load(1);
    return () => { requestId.current++; };
  }, [load]);

  const GA_COLOR = (weeks: number) => {
    if (weeks >= 36) return "#dc2626";
    if (weeks >= 28) return "#d97706";
    return "#16a34a";
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Pregnant Women</h1>
        <span className={styles.count}>{meta.total} active pregnancies</span>
      </div>
      <div className={styles.filters}>
        <input
          placeholder="Search name or household ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.tableScroll}>
        {error ? (
          <p role="alert">{error}</p>
        ) : loading ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Household</th>
                <th>Locality</th>
                <th>LMP</th>
                <th>EDD</th>
                <th>GA at enrollment (wks)</th>
                <th>PEF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.pregnancy_id}>
                  <td>{p.member_name || "—"}</td>
                  <td>
                    <code>{p.household_id}</code>
                  </td>
                  <td>{p.locality_code}</td>
                  <td>{p.lmp_date ?? "—"}</td>
                  <td>{p.edd_date ?? "—"}</td>
                  <td>
                    {p.gestational_age_at_enrollment != null ? (
                      <span
                        className={styles.badge}
                        style={{ backgroundColor: GA_COLOR(p.gestational_age_at_enrollment) }}
                      >
                        {p.gestational_age_at_enrollment}w
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className={styles.badge}>{p.enrollment_date ? "Enrolled" : "Pending"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className={styles.pagination}>
        <button disabled={meta.page <= 1} onClick={() => load(meta.page - 1)}>
          ← Prev
        </button>
        <span>
          Page {meta.page} of {Math.ceil(meta.total / meta.per_page) || 1}
        </span>
        <button
          disabled={meta.page >= Math.ceil(meta.total / meta.per_page)}
          onClick={() => load(meta.page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
