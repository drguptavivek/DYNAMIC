import { useState } from "react";
import styles from "./TasksPage.module.css";

interface Task {
  task_id: string;
  subject_id: string;
  task_type: string;
  protocol_visit_label?: string;
  target_date?: string;
  deadline?: string;
  status: "pending" | "in_progress" | "completed" | "overdue" | "closed";
  failed_attempts: number;
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

  const filtered = tasks.filter((task) => {
    if (siteFilter) return true;
    if (localityFilter) return true;
    if (taskTypeFilter && task.task_type !== taskTypeFilter) return false;
    if (statusFilter.length > 0 && !statusFilter.includes(task.status)) return false;
    if (overdueOnly && task.status !== "overdue") return false;
    return true;
  });

  async function handleViewTask(task: Task) {
    setSelectedTask(task);
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setAttempts([]);
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
          onChange={(e) => setSiteFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Sites</option>
        </select>

        <select
          value={localityFilter}
          onChange={(e) => setLocalityFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Localities</option>
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
                <th>Task ID</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Visit Label</th>
                <th>Target Date</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Failed Attempts</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.task_id}>
                  <td className={styles.taskId}>{task.task_id.substring(0, 8)}...</td>
                  <td>{task.subject_id}</td>
                  <td>{task.task_type}</td>
                  <td>{task.protocol_visit_label || "—"}</td>
                  <td>{task.target_date || "—"}</td>
                  <td>{task.deadline || "—"}</td>
                  <td>
                    <span className={getStatusBadgeClass(task.status)}>
                      {task.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>{task.failed_attempts}</td>
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
                  <label>Failed Attempts</label>
                  <span>{task.failed_attempts}</span>
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
