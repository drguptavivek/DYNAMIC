import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import styles from "./HouseholdsPage.module.css";

interface HouseholdMemberRow {
  household_member_id: string;
  household_id: string;
  member_number: number;
  name?: string;
  sex?: number;
  reported_age_years?: number;
  marital_status?: number;
  relationship_to_head?: number;
  woman_questionnaire_eligible?: boolean;
  member_status?: string;
  locality_code?: string;
  household?: {
    structure_map_id?: string;
    household_number?: string;
    address?: string;
    household_head_name?: string;
  } | null;
}

const PER_PAGE = 50;

export default function HouseholdMembersPage() {
  const params = useParams();
  const routeHouseholdId = params.householdId ? decodeURIComponent(params.householdId) : "";
  const [members, setMembers] = useState<HouseholdMemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sex, setSex] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [routeHouseholdId, search, sex]);

  useEffect(() => {
    loadMembers();
  }, [page, routeHouseholdId, search, sex]);

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(PER_PAGE),
      });
      if (search) params.set("search", search);
      if (sex) params.set("sex", sex);
      const path = routeHouseholdId
        ? `/household-members/${encodeURIComponent(routeHouseholdId)}?${params.toString()}`
        : `/household-members?${params.toString()}`;
      const result = await api.getPage<HouseholdMemberRow[]>(path);
      setMembers(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load household members");
      setMembers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className={styles.container}>
      <h1>{routeHouseholdId ? `Household Members: ${routeHouseholdId}` : "Household Members"}</h1>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Search member name, member ID, or HH ID..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={styles.searchInput}
        />
        <select value={sex} onChange={(event) => setSex(event.target.value)} className={styles.filterSelect}>
          <option value="">Any sex</option>
          <option value="1">Male</option>
          <option value="2">Female</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.empty}>Loading household members...</div>
      ) : members.length === 0 ? (
        <div className={styles.empty}>No household members found</div>
      ) : (
        <div>
          <div className={styles.pagination}>
            <span>
              {`Showing ${(page - 1) * PER_PAGE + 1}-${Math.min(page * PER_PAGE, total)} of ${total}`}
            </span>
            <div className={styles.paginationActions}>
              <button className={styles.secondaryBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>{`Page ${page} of ${totalPages}`}</span>
              <button
                className={styles.secondaryBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>HH ID</th>
                  <th>Age / Sex / Marital</th>
                  <th>Relation to HOH</th>
                  <th>Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.household_member_id}>
                    <td>
                      <div className={styles.hhIdCell}>{member.name || "—"}</div>
                      <div className={styles.hhStructure}>{`[ID: ${member.household_member_id}]`}</div>
                    </td>
                    <td>
                      <div>{member.household_id}</div>
                      <div className={styles.hhStructure}>
                        {`${member.household?.structure_map_id || "—"}-${member.household?.household_number || "—"}`}
                      </div>
                    </td>
                    <td>
                      {`${member.reported_age_years || "—"} years · ${formatSex(member.sex)} · ${formatMaritalStatus(member.marital_status)}`}
                    </td>
                    <td>{formatRelationship(member.relationship_to_head)}</td>
                    <td>{member.household?.address || "—"}</td>
                    <td>{formatMemberStatus(member)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSex(sex?: number) {
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

function formatMemberStatus(member: HouseholdMemberRow) {
  if (Number(member.relationship_to_head) === 1) return "Household head";
  if (member.woman_questionnaire_eligible) return "WQ eligible";
  return "Active member";
}
