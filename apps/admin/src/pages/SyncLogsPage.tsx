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
const STATUSES = ["pending", "in_progress", "completed", "failed"] as const;

export default function SyncLogsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [deviceFilter, setDeviceFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ page: "1", per_page: "500" });
    if (deviceFilter) params.set("device_id", deviceFilter);
    if (userFilter) params.set("user_name", userFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (startDate) params.set("from", startDate);
    if (endDate) params.set("to", endDate);
    api.getPage<SyncLog[]>(`/sync-logs?${params.toString()}`)
      .then((result) => setLogs(result.data))
      .catch(() => setLogs([]));
  }, [deviceFilter, userFilter, statusFilter, startDate, endDate]);

  const filtered = logs.filter((log) => {
    if (deviceFilter && !log.device_id.includes(deviceFilter)) return false;
    if (userFilter && !log.user_id.includes(userFilter)) return false;
    if (statusFilter && log.status !== statusFilter) return false;
    if (directionFilter && log.direction !== directionFilter) return false;
    if (startDate && new Date(log.started_at) < new Date(startDate)) return false;
    if (endDate && new Date(log.started_at) > new Date(endDate)) return false;
    return true;
  });

  const getStatusClass = (status: string) => `${styles.badge} ${styles[`status_${status}`]}`;

  return (
    <div className={styles.container}>
      <h1>Sync Logs</h1>

      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Device ID..."
          value={deviceFilter}
          onChange={(e) => setDeviceFilter(e.target.value)}
          className={styles.filterInput}
        />

        <input
          type="text"
          placeholder="User name..."
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className={styles.filterInput}
        />

        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Directions</option>
          {DIRECTIONS.map((dir) => (
            <option key={dir} value={dir}>
              {dir.charAt(0).toUpperCase() + dir.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={styles.filterInput}
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={styles.filterInput}
        />
      </div>

      {logs.length === 0 ? (
        <div className={styles.empty}>No sync logs found</div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Device ID</th>
                <th>User name</th>
                <th>Direction</th>
                <th>Records Sent</th>
                <th>Records Received</th>
                <th>Status</th>
                <th>Started At</th>
                <th>Duration (s)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.sync_log_id}>
                  <td>{log.device_id}</td>
                  <td>{log.user_name || log.username || "Unknown user"}</td>
                  <td>{log.direction === "push" ? "↑ Push" : "↓ Pull"}</td>
                  <td>{log.records_sent}</td>
                  <td>{log.records_received}</td>
                  <td>
                    <span className={getStatusClass(log.status)}>{log.status}</span>
                  </td>
                  <td>{new Date(log.started_at).toLocaleString()}</td>
                  <td>{log.duration ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
