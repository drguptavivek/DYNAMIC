import { useState } from "react";
import styles from "./HouseholdsPage.module.css";

interface Household {
  household_id: string;
  head_name?: string;
  contact?: string;
  cohort_status: "enrolled" | "empty_at_baseline" | "refused" | "not_found";
  baseline_date?: string;
  site_id?: number;
  locality_code?: string;
}

interface HouseholdMember {
  member_number: number;
  name: string;
  sex: string;
  age?: number;
  member_status: string;
  wq_eligible?: boolean;
}

interface Task {
  task_id: string;
  task_type: string;
  protocol_visit_label?: string;
  status: string;
  target_date?: string;
}

const COHORT_STATUSES = ["enrolled", "empty_at_baseline", "refused", "not_found"] as const;

export default function HouseholdsPage() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [siteFilter, setSiteFilter] = useState("");
  const [localityFilter, setLocalityFilter] = useState("");
  const [cohortFilter, setCohortFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const filtered = households.filter((h) => {
    if (siteFilter && h.site_id?.toString() !== siteFilter) return false;
    if (localityFilter && h.locality_code !== localityFilter) return false;
    if (cohortFilter && h.cohort_status !== cohortFilter) return false;
    if (search && !h.household_id.includes(search) && !h.head_name?.includes(search)) return false;
    return true;
  });

  async function handleViewHousehold(household: Household) {
    setSelectedHousehold(household);
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setMembers([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1>Households</h1>

      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Search household ID or head name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
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
          value={cohortFilter}
          onChange={(e) => setCohortFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Statuses</option>
          {COHORT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {households.length === 0 ? (
        <div className={styles.empty}>No households found</div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Household ID</th>
                <th>Head Name</th>
                <th>Contact</th>
                <th>Cohort Status</th>
                <th>Baseline Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((household) => (
                <tr key={household.household_id}>
                  <td>{household.household_id}</td>
                  <td>{household.head_name || "—"}</td>
                  <td>{household.contact || "—"}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${styles[`cohort_${household.cohort_status}`]}`}
                    >
                      {household.cohort_status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>{household.baseline_date || "—"}</td>
                  <td>
                    <button
                      onClick={() => handleViewHousehold(household)}
                      className={styles.actionBtn}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedHousehold && (
        <HouseholdDetailModal
          household={selectedHousehold}
          members={members}
          tasks={tasks}
          loading={loading}
          onClose={() => setSelectedHousehold(null)}
        />
      )}
    </div>
  );
}

function HouseholdDetailModal({
  household,
  members,
  tasks,
  loading,
  onClose,
}: {
  household: Household;
  members: HouseholdMember[];
  tasks: Task[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Household: {household.household_id}</h2>
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
              <h3>Household Information</h3>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <label>Head Name</label>
                  <span>{household.head_name || "—"}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Contact</label>
                  <span>{household.contact || "—"}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Cohort Status</label>
                  <span>{household.cohort_status.replace(/_/g, " ")}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Baseline Date</label>
                  <span>{household.baseline_date || "—"}</span>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h3>Members ({members.length})</h3>
              {members.length === 0 ? (
                <p className={styles.empty}>No members found</p>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Name</th>
                        <th>Sex</th>
                        <th>Age</th>
                        <th>Status</th>
                        <th>WQ Eligible</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.member_number}>
                          <td>{member.member_number}</td>
                          <td>{member.name}</td>
                          <td>{member.sex}</td>
                          <td>{member.age || "—"}</td>
                          <td>{member.member_status}</td>
                          <td>{member.wq_eligible ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={styles.section}>
              <h3>Tasks ({tasks.length})</h3>
              {tasks.length === 0 ? (
                <p className={styles.empty}>No tasks found</p>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.miniTable}>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Visit Label</th>
                        <th>Status</th>
                        <th>Target Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr key={task.task_id}>
                          <td>{task.task_type}</td>
                          <td>{task.protocol_visit_label || "—"}</td>
                          <td>{task.status}</td>
                          <td>{task.target_date || "—"}</td>
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
