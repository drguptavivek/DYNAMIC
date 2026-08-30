import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Site { site_id: number; site_code: string; site_name: string }
interface Locality { site_id: number; locality_code: string; locality_name: string }
import styles from "./TasksPage.module.css";

interface Task {
  task_id: string;
  household_id?: string;
  form_code?: string;
  subject_id: string;
  task_type: string;
  protocol_visit_label?: string;
  target_date?: string;
  deadline?: string;
  deadline_date?: string;
  status: string;
  failed_attempts?: number;
  failed_attempt_count?: number;
  sequence_number?: number;
}

interface TaskAttempt {
  attempt_number: number;
  status: "completed" | "failed";
  completed_at?: string;
  failed_reason?: string;
}

const TASK_TYPES = [
  "HHQ",
  "WQ",
  "PEF",
  "PFF",
  "HRF",
  "NFF",
  "VA",
  "CHF",
  "DEF",
  "FFF",
  "OEF",
  "EEF",
];

const STATUSES = ["pending", "in_progress", "completed", "overdue", "closed"] as const;

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [siteFilter, setSiteFilter] = useState("");
  const [localityFilter, setLocalityFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [attempts, setAttempts] = useState<TaskAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);

  useEffect(() => {
    Promise.all([api.get<Site[]>("/masters/sites"), api.get<Locality[]>("/masters/localities")])
      .then(([siteRows, localityRows]) => { setSites(siteRows); setLocalities(localityRows); })
      .catch(() => { setSites([]); setLocalities([]); });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: "1", per_page: "500" });
    if (taskTypeFilter) params.set("task_type", taskTypeFilter);
    if (siteFilter) params.set("site_id", siteFilter);
    if (localityFilter) params.set("locality_code", localityFilter);
    if (statusFilter.length) params.set("status", statusFilter.join(","));
    if (overdueOnly) params.set("overdue", "true");
    api.getPage<Task[]>(`/tasks?${params.toString()}`)
      .then((result) => setTasks(result.data))
      .catch(() => setTasks([]));
  }, [siteFilter, localityFilter, taskTypeFilter, statusFilter, overdueOnly]);

  const filtered = tasks.filter((task) => {
    if (siteFilter && String((task as Task & { site_id?: number }).site_id ?? "") !== siteFilter) return false;
    if (localityFilter && (task as Task & { locality_code?: string }).locality_code !== localityFilter) return false;
    if (taskTypeFilter && task.task_type !== taskTypeFilter) return false;
    if (statusFilter.length > 0 && !statusFilter.includes(task.status)) return false;
    if (overdueOnly && task.status !== "overdue") return false;
    return true;
  });

  async function handleViewTask(task: Task) {
    setSelectedTask(task);
    setLoading(true);
    try {
      const attemptsResult = await api.get<TaskAttempt[]>(`/tasks/${encodeURIComponent(task.task_id)}/attempts`);
      setAttempts(attemptsResult);
    } finally {
      setLoading(false);
    }
  }

  function toggleStatusFilter(status: string) {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  const getStatusBadgeClass = (status: string) => {
    return `${styles.badge} ${styles[`status_${status}`]}`;
  };

  return (
    <div className={styles.container}>
      <h1>Tasks</h1>

      <div className={styles.filters}>
        <select
          value={siteFilter}
          onChange={(e) => { setSiteFilter(e.target.value); setLocalityFilter(""); }}
          className={styles.filterSelect}
        >
          <option value="">All Sites</option>
          {sites.map((site) => <option key={site.site_id} value={site.site_id}>{site.site_code} - {site.site_name}</option>)}
        </select>

        <select
          value={localityFilter}
          onChange={(e) => setLocalityFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Localities</option>
          {localities.filter((locality) => !siteFilter || String(locality.site_id) === siteFilter).map((locality) => (
            <option key={`${locality.site_id}-${locality.locality_code}`} value={locality.locality_code}>{locality.locality_code} - {locality.locality_name}</option>
          ))}
        </select>

        <select
          value={taskTypeFilter}
          onChange={(e) => setTaskTypeFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Task Types</option>
          {TASK_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <div className={styles.statusFilter}>
          <label>Status:</label>
          {STATUSES.map((status) => (
            <label key={status} className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={statusFilter.includes(status)}
                onChange={() => toggleStatusFilter(status)}
              />
              {status}
            </label>
          ))}
        </div>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          Overdue Only
        </label>
      </div>

      {tasks.length === 0 ? (
        <div className={styles.empty}>No tasks found</div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Household / Form ID</th>
                <th>Type</th>
                <th>Visit Label</th>
                <th>Target Date</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Visit Number</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.task_id}>
                  <td>{task.household_id || task.subject_id} / {task.form_code || task.task_type}</td>
                  <td>{task.task_type}</td>
                  <td>{task.protocol_visit_label || "—"}</td>
                  <td>{task.target_date || "—"}</td>
                  <td>{task.deadline_date || task.deadline || "—"}</td>
                  <td>
                    <span className={getStatusBadgeClass(task.status)}>
                      {task.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>{task.sequence_number ?? (task.protocol_visit_label?.match(/R(\d+)$/)?.[1] || (task.protocol_visit_label === "baseline" ? "1" : "-"))}</td>
                  <td>
                    <button onClick={() => handleViewTask(task)} className={styles.actionBtn}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          attempts={attempts}
          loading={loading}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}

function TaskDetailModal({
  task,
  attempts,
  loading,
  onClose,
}: {
  task: Task;
  attempts: TaskAttempt[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Task: {task.task_id}</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className={styles.modalBody}>
            <p>Loading...</p>
          </div>
        ) : (
          <div className={styles.modalBody}>
            <div className={styles.section}>
              <h3>Task Information</h3>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <label>Task ID</label>
                  <span>{task.task_id}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Subject ID</label>
                  <span>{task.subject_id}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Type</label>
                  <span>{task.task_type}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Status</label>
                  <span>{task.status}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Protocol Visit Label</label>
                  <span>{task.protocol_visit_label || "—"}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Target Date</label>
                  <span>{task.target_date || "—"}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Deadline</label>
                  <span>{task.deadline || "—"}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Visit Number</label>
                  <span>{task.sequence_number ?? (task.protocol_visit_label?.match(/R(\d+)$/)?.[1] || (task.protocol_visit_label === "baseline" ? "1" : "-"))}</span>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h3>Attempts ({attempts.length})</h3>
              {attempts.length === 0 ? (
                <p className={styles.empty}>No attempts recorded</p>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>Attempt</th>
                        <th>Status</th>
                        <th>Completed At</th>
                        <th>Failed Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((attempt) => (
                        <tr key={attempt.attempt_number}>
                          <td>{attempt.attempt_number}</td>
                          <td>{attempt.status}</td>
                          <td>{attempt.completed_at || "—"}</td>
                          <td>{attempt.failed_reason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.secondaryBtn}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
