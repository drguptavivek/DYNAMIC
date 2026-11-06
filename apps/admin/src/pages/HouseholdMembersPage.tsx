import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import correctionStyles from "./HouseholdMemberCorrection.module.css";
import {
  formatHouseholdMemberStatus,
  formatHouseholdRelationship,
} from "../lib/householdMemberLabels";
import styles from "./HouseholdsPage.module.css";

interface HouseholdMemberRow {
  household_member_id: string;
  household_id: string;
  member_number: number;
  name?: string;
  sex?: number;
  site_id?: number;
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
  const { user } = useAuth();
  const canCorrect = !!user && ["central_admin", "site_data_manager", "site_research_scientist"].includes(user.role);
  const [correcting, setCorrecting] = useState<HouseholdMemberRow | null>(null);
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correctionError, setCorrectionError] = useState("");
  const [notice, setNotice] = useState("");
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (correcting) reasonInput.current?.focus(); }, [correcting]);
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

  async function saveCorrection(event: React.FormEvent) {
    event.preventDefault();
    if (!correcting || !verified || !reason.trim() || saving) return;
    setSaving(true);
    setCorrectionError("");
    try {
      const result = await api.post<{ woman_questionnaire_eligible: boolean; bwq_task_created: boolean; bwq_task_exists: boolean }>(
        `/members/${encodeURIComponent(correcting.household_member_id)}/corrections`,
        { field: "sex", old_value: 1, new_value: 2, reason: reason.trim() },
      );
      setNotice(`Member corrected to Female. ${result.bwq_task_created
        ? "A BWQ task was created. Ask the assigned field worker to sync the app."
        : result.bwq_task_exists ? "Existing BWQ work was preserved; no duplicate task was created. Ask the assigned field worker to sync the app."
        : "No BWQ task was created because the member does not meet the current eligibility or active study conditions."}`);
      setCorrecting(null);
      await loadMembers();
    } catch (err) {
      setCorrectionError(err instanceof Error ? err.message : "Could not save the correction. Please try again.");
    } finally { setSaving(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className={styles.container}>
      <h1>{routeHouseholdId ? `Household Members: ${routeHouseholdId}` : "Household Members"}</h1>
      {error && <div className={styles.error}>{error}</div>}
      {notice && <div role="status" className={correctionStyles.notice}>{notice}</div>}
      {correcting && <section className={correctionStyles.panel} aria-labelledby="member-correction-title">
        <h2 id="member-correction-title">Correct incorrectly recorded sex</h2>
        <p><strong>{correcting.name || correcting.household_member_id}</strong> - {correcting.household_member_id}</p>
        <p>Change <strong>Male to Female</strong>. Normal BWQ eligibility will be checked and only missing BWQ work will be created. The original BHQ submission remains preserved.</p>
        <form onSubmit={saveCorrection}>
          <label htmlFor="member-correction-reason">Reason for correction</label>
          <textarea id="member-correction-reason" ref={reasonInput} value={reason} required maxLength={1000} disabled={saving} onChange={(event) => setReason(event.target.value)} />
          <label className={correctionStyles.confirm}><input type="checkbox" checked={verified} disabled={saving} onChange={(event) => setVerified(event.target.checked)} />I have verified that this member is Female and was incorrectly recorded as Male.</label>
          {correctionError && <p role="alert" className={styles.error}>{correctionError}</p>}
          <div className={correctionStyles.actions}>
            <button type="button" className={styles.secondaryBtn} disabled={saving} onClick={() => setCorrecting(null)}>Cancel correction</button>
            <button type="submit" className={correctionStyles.save} disabled={saving || !verified || !reason.trim()}>{saving ? "Saving correction..." : "Confirm correction"}</button>
          </div>
        </form>
      </section>}

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
        <div className={styles.results}>
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
                  {canCorrect && <th>Correction</th>}
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
                    <td>{formatHouseholdRelationship(member.relationship_to_head, member.name, member.household?.household_head_name)}</td>
                    <td>{member.household?.address || "—"}</td>
                    <td>{formatHouseholdMemberStatus(member, member.household?.household_head_name)}</td>
                    {canCorrect && <td>{Number(member.sex) === 1 && (user?.role === "central_admin" || member.site_id === user?.site_id) && <button type="button" className={styles.secondaryBtn} aria-label={`Correct sex for ${member.name || "member"} (${member.household_member_id})`} disabled={saving} onClick={() => {
                      if (!window.confirm(`Are you sure you want to correct ${member.name || "this member"} (${member.household_member_id}) to Female? Continuing opens the verification form. No changes are saved yet.`)) return;
                      setCorrecting(member); setReason(""); setVerified(false); setCorrectionError(""); setNotice("");
                    }}>Correct to Female</button>}</td>}
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
