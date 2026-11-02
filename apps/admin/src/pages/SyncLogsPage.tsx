import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./SyncLogsPage.module.css";

interface SyncLog {
  sync_log_id: string;
  device_id: string;
  user_id: string;
  user_name?: string | null;
  username?: string | null;
  direction: "push" | "pull";
  records_sent: number;
  records_received: number;
  status: string;
  started_at: string;
  completed_at?: string;
  duration?: number;
}

const DIRECTIONS = ["push", "pull"] as const;
const STATUSES = ["success", "partial_success", "pending", "in_progress", "completed", "failed"] as const;
const PAGE_SIZE = 100;

export default function SyncLogsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [filters, setFilters] = useState({ device_id: "", user_name: "", status: "", direction: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE) });
    for (const [key, raw] of Object.entries(filters)) {
      const value = raw.trim();
      if (value) params.set(key, value);
    }
    api.getPage<SyncLog[]>(`/sync-logs?${params.toString()}`)
      .then((result) => { if (!cancelled) { setLogs(result.data); setTotal(result.meta.total); } })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load sync logs."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, page, revision]);

  function changeFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const getStatusClass = (status: string) => `${styles.badge} ${styles[`status_${status}`]}`;

  return (
    <div className={styles.container}>
      <h1>Sync Logs</h1>
      <div className={styles.filters}>
        <input aria-label="Device ID" type="text" placeholder="Device ID..." value={filters.device_id}
          onChange={(e) => changeFilter("device_id", e.target.value)} className={styles.filterInput} />
        <input aria-label="Name or username" type="text" placeholder="Name or username..." value={filters.user_name}
          onChange={(e) => changeFilter("user_name", e.target.value)} className={styles.filterInput} />
        <select aria-label="Direction" value={filters.direction} onChange={(e) => changeFilter("direction", e.target.value)} className={styles.filterSelect}>
          <option value="">All Directions</option>
          {DIRECTIONS.map((dir) => <option key={dir} value={dir}>{dir.charAt(0).toUpperCase() + dir.slice(1)}</option>)}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(e) => changeFilter("status", e.target.value)} className={styles.filterSelect}>
          <option value="">All Statuses</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())}</option>)}
        </select>
        <input aria-label="From date (IST)" title="From date (IST)" type="date" value={filters.from}
          onChange={(e) => changeFilter("from", e.target.value)} className={styles.filterInput} />
        <input aria-label="To date (IST, inclusive)" title="To date (IST, inclusive)" type="date" value={filters.to}
          onChange={(e) => changeFilter("to", e.target.value)} className={styles.filterInput} />
      </div>
      {loading ? <div className={styles.empty} role="status">Loading sync logs…</div>
        : error ? <div className={styles.empty} role="alert">{error} <button onClick={() => setRevision((value) => value + 1)}>Try again</button></div>
        : logs.length === 0 ? <div className={styles.empty}>No sync logs found</div>
        : <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead><tr><th>Device ID</th><th>User name</th><th>Direction</th><th>Records Sent</th><th>Records Received</th><th>Status</th><th>Started At (IST)</th><th>Duration (s)</th></tr></thead>
            <tbody>{logs.map((log) => <tr key={log.sync_log_id}>
              <td>{log.device_id}</td><td>{log.user_name || log.username || "Unknown user"}</td>
              <td>{log.direction === "push" ? "↑ Push" : "↓ Pull"}</td><td>{log.records_sent}</td><td>{log.records_received}</td>
              <td><span className={getStatusClass(log.status)}>{log.status}</span></td>
              <td>{new Date(log.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{log.duration ?? "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      {!loading && !error && <div className={styles.pagination}>
        <span>{total === 0 ? "0 results" : `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + logs.length} of ${total}`}</span>
        <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button>
      </div>}
    </div>
  );
}
