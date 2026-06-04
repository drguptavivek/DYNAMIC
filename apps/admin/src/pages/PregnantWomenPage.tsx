import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import styles from "./PregnantWomenPage.module.css";

interface Pregnancy {
  id: string;
  woman_name: string;
  household_id: string;
  locality_code: string;
  lmp_date?: string;
  edd?: string;
  ga_weeks?: number;
  pregnancy_status: string;
  pef_status: string;
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

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      if (search) params.set("search", search);
      const res = await api.getPage<Pregnancy[]>(`/pregnant-women?${params}`);
      setRows(res.data);
      setMeta(res.meta);
      setLoading(false);
    },
    [search],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const GA_COLOR = (weeks?: number) => {
    if (!weeks) return "#6b7280";
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
      {loading ? (
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
              <th>GA (wks)</th>
              <th>PEF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.woman_name}</td>
                <td>
                  <code>{p.household_id}</code>
                </td>
                <td>{p.locality_code}</td>
                <td>{p.lmp_date ?? "—"}</td>
                <td>{p.edd ?? "—"}</td>
                <td>
                  {p.ga_weeks != null ? (
                    <span
                      className={styles.badge}
                      style={{ backgroundColor: GA_COLOR(p.ga_weeks) }}
                    >
                      {p.ga_weeks}w
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span className={styles.badge}>{p.pef_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
