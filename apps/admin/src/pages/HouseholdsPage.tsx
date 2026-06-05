import { useEffect, useState } from "react";
import { api } from "../lib/api";
import styles from "./HouseholdsPage.module.css";

interface Household {
  household_id: string;
  household_head_name?: string;
  contact_mobile?: string;
  cohort_status: "enrolled" | "empty_at_baseline" | "refused" | "not_found";
  baseline_completed_date?: string;
  site_id?: number;
  locality_code?: string;
  structure_map_id?: string;
  household_number?: string;
  address?: string;
  eligible_women_names?: string[];
  pregnancy_tracking_eligible_names?: string[];
}

interface HouseholdMember {
  household_member_id: string;
  member_number: number;
  name: string;
  sex: number;
  reported_age_years?: number;
  marital_status?: number;
  member_status: string;
  relationship_to_head?: number;
  woman_questionnaire_eligible?: boolean;
}

interface Task {
  task_id: string;
  task_type: string;
  protocol_visit_label?: string;
  status: string;
  target_date?: string;
}

const COHORT_STATUSES = ["enrolled", "empty_at_baseline", "refused", "not_found"] as const;
const PER_PAGE = 50;

export default function HouseholdsPage() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [siteFilter, setSiteFilter] = useState("");
  const [localityFilter, setLocalityFilter] = useState("");
  const [cohortFilter, setCohortFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [siteFilter, localityFilter, cohortFilter, search]);

  useEffect(() => {
    loadHouseholds();
  }, [page, siteFilter, localityFilter, cohortFilter, search]);

  async function loadHouseholds() {
    setListLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(PER_PAGE),
      });
      if (siteFilter) params.set("site_id", siteFilter);
      if (localityFilter) params.set("locality_code", localityFilter);
      if (cohortFilter) params.set("cohort_status", cohortFilter);
      if (search) params.set("search", search);

      const result = await api.getPage<Household[]>(`/households?${params.toString()}`);
      setHouseholds(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load households");
      setHouseholds([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }

  async function handleViewHousehold(household: Household) {
    setSelectedHousehold(household);
    setLoading(true);
    try {
      const householdId = encodeURIComponent(household.household_id);
      const [memberRows, taskRows] = await Promise.all([
        api.get<HouseholdMember[]>(`/households/${householdId}/members`),
        api.get<Task[]>(`/households/${householdId}/tasks`),
      ]);
      setMembers(memberRows);
      setTasks(taskRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load household detail");
      setMembers([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className={styles.container}>
      <h1>Households</h1>
      {error && <div className={styles.error}>{error}</div>}

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
          {[1, 2, 3, 4].map((siteId) => (
            <option key={siteId} value={siteId}>
              Site {siteId}
            </option>
          ))}
        </select>
        <select
          value={localityFilter}
          onChange={(e) => setLocalityFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Localities</option>
          {["01", "02", "03", "04"].map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
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

      {listLoading ? (
        <div className={styles.empty}>Loading households...</div>
      ) : households.length === 0 ? (
        <div className={styles.empty}>No households found</div>
      ) : (
        <div>
          <div className={styles.pagination}>
            <span>
              {`Showing ${(page - 1) * PER_PAGE + 1}-${Math.min(page * PER_PAGE, total)} of ${total}`}
            </span>
            <div className={styles.paginationActions}>
              <button
                className={styles.secondaryBtn}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span>{`Page ${page} of ${totalPages}`}</span>
              <button
                className={styles.secondaryBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>HH ID (HH + Structure)</th>
                  <th>Head Name</th>
                  <th>Address</th>
                  <th>Eligible Women</th>
                  <th>Eligible for Pregnancy Status Tracking</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {households.map((household) => (
                  <tr key={household.household_id}>
                    <td>
                      <div className={styles.hhIdCell}>{household.household_id}</div>
                      <div className={styles.hhStructure}>
                        {`${household.structure_map_id || "—"}-${household.household_number || "—"}`}
                      </div>
                    </td>
                    <td>{household.household_head_name || "—"}</td>
                    <td>{household.address || "—"}</td>
                    <td>{formatEligibleWomen(household.eligible_women_names)}</td>
                    <td>{formatEligibleWomen(household.pregnancy_tracking_eligible_names)}</td>
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
                  <span>{household.household_head_name || "—"}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Contact</label>
                  <span>{household.contact_mobile || "—"}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Cohort Status</label>
                  <span>{household.cohort_status.replace(/_/g, " ")}</span>
                </div>
                <div className={styles.infoItem}>
                  <label>Baseline Date</label>
                  <span>{household.baseline_completed_date || "—"}</span>
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
                        <th>Member</th>
                        <th>Age / Sex / Marital</th>
                        <th>Relation to HOH</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.household_member_id || member.member_number}>
                          <td>
                            <div className={styles.hhIdCell}>{`${member.name || "—"} [ID: ${member.household_member_id}]`}</div>
                          </td>
                          <td>
                            {`${member.reported_age_years || "—"} years · ${formatSex(member.sex)} · ${formatMaritalStatus(member.marital_status)}`}
                          </td>
                          <td>{formatRelationship(member.relationship_to_head)}</td>
                          <td>{formatMemberStatus(member)}</td>
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

function formatSex(sex: number) {
  if (Number(sex) === 1) return "Male";
  if (Number(sex) === 2) return "Female";
  return "Other";
}

function formatMaritalStatus(status?: number) {
  if (Number(status) === 1) return "Married";
  if (Number(status) === 2) return "Unmarried";
  return "Marital status unknown";
}

function formatRelationship(value?: number) {
  if (Number(value) === 1) return "Self / HOH";
  if (Number(value) === 2) return "Spouse";
  if (Number(value) === 3) return "Parent";
  if (Number(value) === 4) return "Child";
  if (Number(value) === 5) return "Sibling";
  return "Other";
}

function formatMemberStatus(member: HouseholdMember) {
  if (Number(member.relationship_to_head) === 1) return "Household head";
  if (member.woman_questionnaire_eligible) return "WQ eligible";
  return "Active member";
}

function formatEligibleWomen(names?: string[]) {
  if (!names || names.length === 0) return "—";
  return names.join(", ");
}
