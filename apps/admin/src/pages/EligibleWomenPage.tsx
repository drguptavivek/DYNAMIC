import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import styles from "./EligibleWomenPage.module.css";

interface EligibleWoman {
  id: string;
  household_member_id: string;
  full_name: string;
  dob: string;
  age_years?: number;
  locality_code: string;
  wq_status: string;
  tracking_status: string;
  current_eligibility_status: string;
}

interface Meta {
  total: number;
  page: number;
  per_page: number;
}

const STATUS_COLORS: Record<string, string> = {
  eligible: "#16a34a",
  not_eligible: "#6b7280",
  enrolled: "#2563eb",
  completed: "#7c3aed",
  lost_to_followup: "#dc2626",
};

export default function EligibleWomenPage() {
  const [women, setWomen] = useState<EligibleWoman[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, per_page: 20 });
  const [search, setSearch] = useState("");
  const [trackingStatus, setTrackingStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      if (search) params.set("search", search);
      if (trackingStatus) params.set("tracking_status", trackingStatus);
      const res = await api.getPage<EligibleWoman[]>(`/eligible-women?${params}`);
      setWomen(res.data);
      setMeta(res.meta);
      setLoading(false);
    },
    [search, trackingStatus],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Eligible Women</h1>
        <span className={styles.count}>{meta.total} total</span>
      </div>
      <div className={styles.filters}>
        <input
          placeholder="Search name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={trackingStatus} onChange={(e) => setTrackingStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="eligible">Eligible</option>
          <option value="enrolled">Enrolled</option>
          <option value="not_eligible">Not eligible</option>
          <option value="completed">Completed</option>
          <option value="lost_to_followup">Lost to follow-up</option>
        </select>
      </div>
      {loading ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>DOB</th>
              <th>Locality</th>
              <th>WQ Status</th>
              <th>Tracking Status</th>
            </tr>
          </thead>
          <tbody>
            {women.map((w) => (
              <tr key={w.id}>
                <td>{w.full_name}</td>
                <td>{w.dob}</td>
                <td>{w.locality_code}</td>
                <td>
                  <span className={styles.badge}>{w.wq_status}</span>
                </td>
                <td>
                  <span
                    className={styles.badge}
                    style={{ backgroundColor: STATUS_COLORS[w.tracking_status] || "#6b7280" }}
                  >
                    {w.tracking_status}
                  </span>
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
