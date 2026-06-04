import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import styles from "./ChildrenPage.module.css";

interface Child {
  id: string;
  full_name?: string;
  sex?: string;
  birth_date?: string;
  age_months?: number;
  birth_status: string;
  current_vital_status: string;
  locality_code: string;
  mother_name?: string;
}

interface Meta {
  total: number;
  page: number;
  per_page: number;
}

const VITAL_COLORS: Record<string, string> = {
  alive: "#16a34a",
  dead: "#dc2626",
  unknown: "#6b7280",
};

export default function ChildrenPage() {
  const [rows, setRows] = useState<Child[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, per_page: 20 });
  const [search, setSearch] = useState("");
  const [vitalStatus, setVitalStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      if (search) params.set("search", search);
      if (vitalStatus) params.set("current_vital_status", vitalStatus);
      const res = await api.getPage<Child[]>(`/children?${params}`);
      setRows(res.data);
      setMeta(res.meta);
      setLoading(false);
    },
    [search, vitalStatus],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Children</h1>
        <span className={styles.count}>{meta.total} total</span>
      </div>
      <div className={styles.filters}>
        <input
          placeholder="Search name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={vitalStatus} onChange={(e) => setVitalStatus(e.target.value)}>
          <option value="">All vital statuses</option>
          <option value="alive">Alive</option>
          <option value="dead">Dead</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      {loading ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Sex</th>
              <th>Birth Date</th>
              <th>Age (mo)</th>
              <th>Birth Status</th>
              <th>Vital Status</th>
              <th>Locality</th>
              <th>Mother</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.full_name ?? "—"}</td>
                <td>{c.sex ?? "—"}</td>
                <td>{c.birth_date ?? "—"}</td>
                <td>{c.age_months != null ? `${c.age_months}m` : "—"}</td>
                <td>
                  <span className={styles.badge}>{c.birth_status}</span>
                </td>
                <td>
                  <span
                    className={styles.badge}
                    style={{ backgroundColor: VITAL_COLORS[c.current_vital_status] || "#6b7280" }}
                  >
                    {c.current_vital_status}
                  </span>
                </td>
                <td>{c.locality_code}</td>
                <td>{c.mother_name ?? "—"}</td>
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
