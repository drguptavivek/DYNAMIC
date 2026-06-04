import { useState } from "react";
import styles from "./SyncLogsPage.module.css";

interface SyncLog {
  sync_log_id: string;
  device_id: string;
  user_id: string;
  direction: "push" | "pull";
  records_sent: number;
  records_received: number;
  status: "pending" | "in_progress" | "completed" | "failed";
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
          placeholder="User ID..."
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
                <th>Sync ID</th>
                <th>Device ID</th>
                <th>User ID</th>
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
                  <td className={styles.syncId}>{log.sync_log_id.substring(0, 8)}...</td>
                  <td>{log.device_id}</td>
                  <td>{log.user_id}</td>
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
