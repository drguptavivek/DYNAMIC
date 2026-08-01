import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth, type UserRole } from "../lib/auth-context";
import styles from "./UsersPage.module.css";

interface User {
  user_id: string;
  username: string;
  display_name?: string;
  email?: string;
  role: UserRole;
  site_id?: number | null;
  active: boolean;
  created_at?: string;
}

interface AreaAssignment {
  assignment_id: string;
  user_id: string;
  site_id: number;
  locality_code: string;
  role: string;
  active_from?: string;
  active_to?: string;
}

interface Locality {
  site_id: number;
  locality_code: string;
  locality_name: string;
}

interface Site {
  site_id: number;
  site_code: string;
  site_name: string;
}

const ROLES: readonly UserRole[] = [
  "field_worker",
  "field_supervisor",
  "site_research_scientist",
  "central_admin",
  "site_data_manager",
  "central_data_manager",
  "us_collaborator",
];

const SITE_ADMIN_ROLES = new Set<UserRole>([
  "field_worker",
  "field_supervisor",
  "site_research_scientist",
  "site_data_manager",
]);

const ROLE_RANK: Record<UserRole, number> = {
  field_worker: 10,
  field_supervisor: 20,
  site_data_manager: 30,
  site_research_scientist: 40,
  central_data_manager: 50,
  us_collaborator: 50,
  central_admin: 60,
};

interface CreateUserFormData {
  username: string;
  display_name: string;
  email: string;
  role: UserRole;
  site_id: number | "";
  password: string;
  confirm_password: string;
  staff_full_name: string;
  staff_designation: string;
  staff_country: string;
  institution_name: string;
  institution_country: string;
  institution_type: string;
}

interface EditUserFormData {
  display_name: string;
  email: string;
  role: UserRole;
  site_id: number | "";
  new_password: string;
}

function siteLabel(site: Site): string {
  return `${site.site_name} (${site.site_code} · ID ${site.site_id})`;
}

function activeAssignments(assignments: AreaAssignment[]): AreaAssignment[] {
  const now = new Date();
  return assignments.filter((assignment) => {
    const activeFrom = assignment.active_from ? new Date(assignment.active_from) : null;
    const activeTo = assignment.active_to ? new Date(assignment.active_to) : null;
    return (!activeFrom || activeFrom <= now) && (!activeTo || activeTo >= now);
  });
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [assignmentsByUser, setAssignmentsByUser] = useState<Record<string, AreaAssignment[]>>({});
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingStatusFor, setSavingStatusFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<boolean | "">("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const sitesById = useMemo(
    () => new Map(sites.map((site) => [site.site_id, site])),
    [sites],
  );
  const localitiesByKey = useMemo(
    () => new Map(localities.map((locality) => [`${locality.site_id}-${locality.locality_code}`, locality])),
    [localities],
  );

  useEffect(() => {
    void loadUsers();
  }, [search, roleFilter, activeFilter]);

  useEffect(() => {
    void loadMasters();
  }, []);

  async function loadMasters() {
    try {
      const [siteData, localityData] = await Promise.all([
        api.get<Site[]>("/masters/sites"),
        api.get<Locality[]>("/masters/localities"),
      ]);
      setSites(siteData);
      setLocalities(localityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load site and locality names");
    }
  }

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (roleFilter) params.append("role", roleFilter);
      if (activeFilter !== "") params.append("active", String(activeFilter));

      const data = await api.get<User[]>(`/users?${params.toString()}`);
      setUsers(data);
      const entries = await Promise.all(
        data.map(async (listedUser) => {
          try {
            const assignments = await api.get<AreaAssignment[]>(
              `/users/${listedUser.user_id}/area-assignments`,
            );
            return [listedUser.user_id, assignments] as const;
          } catch {
            return [listedUser.user_id, []] as const;
          }
        }),
      );
      setAssignmentsByUser(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(formData: CreateUserFormData) {
    if (formData.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (formData.password !== formData.confirm_password) throw new Error("Passwords do not match");
    if (!formData.staff_full_name.trim()) throw new Error("Staff full name is required");
    if (!formData.staff_designation.trim()) throw new Error("Staff designation is required");
    if (!formData.institution_name.trim()) throw new Error("Institution name is required");

    await api.post("/users", {
      username: formData.username,
      display_name: formData.display_name || undefined,
      email: formData.email || undefined,
      role: formData.role,
      site_id: formData.site_id === "" ? null : formData.site_id,
      password: formData.password,
      staff: {
        full_name: formData.staff_full_name,
        email: formData.email || undefined,
        designation: formData.staff_designation,
        country: formData.staff_country || "India",
        institution: {
          institution_name: formData.institution_name,
          country: formData.institution_country || formData.staff_country || "India",
          institution_type: formData.institution_type || "study_site",
        },
      },
    });
    setShowCreateModal(false);
    await loadUsers();
  }

  async function handleEditUser(formData: EditUserFormData) {
    if (!editingUser) return;
    if (formData.new_password && formData.new_password.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }
    const nextSiteId = formData.site_id === "" ? null : formData.site_id;
    const currentSiteId = editingUser.site_id ?? null;
    await api.patch(`/users/${editingUser.user_id}`, {
      display_name: formData.display_name,
      email: formData.email || undefined,
      role: formData.role,
      ...(nextSiteId !== currentSiteId ? { site_id: nextSiteId } : {}),
      ...(formData.new_password && { password: formData.new_password }),
    });
    setEditingUser(null);
    await loadUsers();
  }

  function statusDisabledReason(target: User): string | null {
    if (!currentUser) return "Current user could not be identified";
    if (currentUser.user_id === target.user_id) return "You cannot change your own account status";
    if (ROLE_RANK[target.role] > ROLE_RANK[currentUser.role]) {
      return "You cannot change the status of a higher-level role";
    }
    if (
      currentUser.role === "site_research_scientist" &&
      target.site_id !== currentUser.site_id
    ) {
      return "You can only manage users at your own site";
    }
    return null;
  }

  async function handleStatusToggle(target: User) {
    if (statusDisabledReason(target)) return;
    setSavingStatusFor(target.user_id);
    setError("");
    try {
      await api.patch(`/users/${target.user_id}`, { active: !target.active });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change user status");
    } finally {
      setSavingStatusFor(null);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Users</h1>
        <button onClick={() => setShowCreateModal(true)} className={styles.primaryBtn}>Create User</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Search username or display name..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={styles.searchInput}
        />
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className={styles.filterSelect}>
          <option value="">All Roles</option>
          {ROLES.map((role) => <option key={role} value={role}>{role.replace(/_/g, " ")}</option>)}
        </select>
        <select
          value={activeFilter === "" ? "" : String(activeFilter)}
          onChange={(event) => setActiveFilter(event.target.value === "" ? "" : event.target.value === "true")}
          className={styles.filterSelect}
        >
          <option value="">All Statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {loading ? <p>Loading...</p> : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead><tr>
              <th>Username</th><th>Display Name</th><th>Role</th><th>Site</th>
              <th>Assigned Localities</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {users.map((listedUser) => {
                const disabledReason = statusDisabledReason(listedUser);
                return (
                  <tr key={listedUser.user_id}>
                    <td>{listedUser.username}</td>
                    <td>{listedUser.display_name || "—"}</td>
                    <td>{listedUser.role.replace(/_/g, " ")}</td>
                    <td><SiteName site={listedUser.site_id ? sitesById.get(listedUser.site_id) : undefined} siteId={listedUser.site_id} /></td>
                    <td><AssignmentBadges assignments={assignmentsByUser[listedUser.user_id] ?? []} localitiesByKey={localitiesByKey} /></td>
                    <td>
                      <StatusSwitch
                        active={listedUser.active}
                        disabled={Boolean(disabledReason) || savingStatusFor === listedUser.user_id}
                        title={disabledReason ?? `Set ${listedUser.username} ${listedUser.active ? "inactive" : "active"}`}
                        onToggle={() => void handleStatusToggle(listedUser)}
                      />
                    </td>
                    <td><button onClick={() => setEditingUser(listedUser)} className={styles.actionBtn}>Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal
          currentUserRole={currentUser?.role}
          currentUserSiteId={currentUser?.site_id}
          sites={sites}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateUser}
        />
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          currentUserRole={currentUser?.role}
          currentUserSiteId={currentUser?.site_id}
          sites={sites}
          onClose={() => setEditingUser(null)}
          onSubmit={handleEditUser}
        />
      )}
    </div>
  );
}

function SiteName({ site, siteId }: { site?: Site; siteId?: number | null }) {
  if (!siteId) return <span className={styles.muted}>—</span>;
  if (!site) return <span>ID {siteId}</span>;
  return <span className={styles.siteName}>{siteLabel(site)}</span>;
}

function AssignmentBadges({
  assignments,
  localitiesByKey,
}: {
  assignments: AreaAssignment[];
  localitiesByKey: Map<string, Locality>;
}) {
  const currentAssignments = activeAssignments(assignments);
  if (currentAssignments.length === 0) return <span className={styles.muted}>—</span>;

  return (
    <div className={styles.assignmentList}>
      {currentAssignments.map((assignment) => {
        const key = `${assignment.site_id}-${assignment.locality_code}`;
        const locality = localitiesByKey.get(key);
        const label = locality ? `${locality.locality_name} (${locality.locality_code})` : assignment.locality_code;
        return <span key={assignment.assignment_id} className={styles.assignmentBadge}>{label}</span>;
      })}
    </div>
  );
}

function StatusSwitch({
  active,
  disabled,
  title,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  title: string;
  onToggle: () => void;
}) {
  return (
    <div className={styles.statusControl} title={title}>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`Account status: ${active ? "Active" : "Inactive"}`}
        disabled={disabled}
        onClick={onToggle}
        className={`${styles.statusSwitch} ${active ? styles.statusSwitchActive : ""}`}
      ><span /></button>
      <span className={active ? styles.activeText : styles.inactiveText}>{active ? "Active" : "Inactive"}</span>
    </div>
  );
}

interface ScopeSelectorProps {
  siteId: number | "";
  sites: Site[];
  lockedSiteId?: number;
  siteRequired: boolean;
  onChange: (siteId: number | "") => void;
}

function ScopeSelector({
  siteId,
  sites,
  lockedSiteId,
  siteRequired,
  onChange,
}: ScopeSelectorProps) {
  const availableSites = lockedSiteId == null ? sites : sites.filter((site) => site.site_id === lockedSiteId);

  function updateSite(value: string) {
    const nextSiteId = value === "" ? "" : Number(value);
    onChange(nextSiteId);
  }

  return (
    <>
      <div className={styles.formGroup}>
        <label htmlFor="user-site">Site {siteRequired ? "*" : ""}</label>
        <select
          id="user-site"
          value={siteId}
          onChange={(event) => updateSite(event.target.value)}
          required={siteRequired}
          disabled={lockedSiteId != null}
        >
          {!siteRequired && <option value="">Central / no site</option>}
          {siteRequired && <option value="">Select a site</option>}
          {availableSites.map((site) => <option key={site.site_id} value={site.site_id}>{siteLabel(site)}</option>)}
        </select>
        {lockedSiteId != null && <p className={styles.fieldHint}>Site administrators can assign only their own site.</p>}
      </div>
    </>
  );
}

function permittedRoles(currentUserRole?: UserRole): readonly UserRole[] {
  return currentUserRole === "site_research_scientist"
    ? ROLES.filter((role) => SITE_ADMIN_ROLES.has(role))
    : ROLES;
}

function CreateUserModal({
  currentUserRole,
  currentUserSiteId,
  sites,
  onClose,
  onSubmit,
}: {
  currentUserRole?: UserRole;
  currentUserSiteId?: number;
  sites: Site[];
  onClose: () => void;
  onSubmit: (data: CreateUserFormData) => Promise<void>;
}) {
  const lockedSiteId = currentUserRole === "site_research_scientist" ? currentUserSiteId : undefined;
  const [formData, setFormData] = useState<CreateUserFormData>({
    username: "", display_name: "", email: "", role: "field_worker",
    site_id: lockedSiteId ?? "",
    staff_full_name: "", staff_designation: "Field Worker", staff_country: "India",
    institution_name: "", institution_country: "India", institution_type: "study_site",
    password: "", confirm_password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const roles = permittedRoles(currentUserRole);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await onSubmit(formData); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to create user"); }
    finally { setLoading(false); }
  }

  return (
    <div className={styles.modal}><div className={styles.modalContent}>
      <div className={styles.modalHeader}><h2>Create User</h2><button onClick={onClose} className={styles.closeBtn}>✕</button></div>
      {error && <div className={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit} autoComplete="off">
        <FormInput label="Username *" name="create-user-username" autoComplete="off" value={formData.username} required onChange={(username) => setFormData({ ...formData, username })} />
        <FormInput label="Display Name" value={formData.display_name} onChange={(display_name) => setFormData({ ...formData, display_name })} />
        <FormInput label="Email" name="create-user-email" autoComplete="off" type="email" value={formData.email} onChange={(email) => setFormData({ ...formData, email })} />
        <div className={styles.formGroup}><label>Role *</label><select value={formData.role} onChange={(event) => {
          const role = event.target.value as UserRole;
          const siteRequired = SITE_ADMIN_ROLES.has(role);
          setFormData({ ...formData, role, site_id: siteRequired ? formData.site_id : "", staff_designation: role.replace(/_/g, " ") });
        }}>{roles.map((role) => <option key={role} value={role}>{role.replace(/_/g, " ")}</option>)}</select></div>
        <ScopeSelector siteId={formData.site_id} sites={sites} lockedSiteId={lockedSiteId} siteRequired={SITE_ADMIN_ROLES.has(formData.role)} onChange={(site_id) => setFormData({ ...formData, site_id })} />
        <FormInput label="Staff Full Name *" value={formData.staff_full_name} required onChange={(staff_full_name) => setFormData({ ...formData, staff_full_name })} />
        <FormInput label="Designation *" value={formData.staff_designation} required onChange={(staff_designation) => setFormData({ ...formData, staff_designation })} />
        <FormInput label="Staff Country" value={formData.staff_country} onChange={(staff_country) => setFormData({ ...formData, staff_country })} />
        <FormInput label="Institution Name *" value={formData.institution_name} required onChange={(institution_name) => setFormData({ ...formData, institution_name })} />
        <FormInput label="Institution Country" value={formData.institution_country} onChange={(institution_country) => setFormData({ ...formData, institution_country })} />
        <div className={styles.formGroup}><label>Institution Type</label><select value={formData.institution_type} onChange={(event) => setFormData({ ...formData, institution_type: event.target.value })}><option value="study_site">Study Site</option><option value="coordinating_center">Coordinating Center</option><option value="collaborator">Collaborator</option></select></div>
        <FormInput label="Password *" name="create-user-password" autoComplete="new-password" type="password" value={formData.password} required onChange={(password) => setFormData({ ...formData, password })} />
        <FormInput label="Confirm Password *" name="create-user-confirm-password" autoComplete="new-password" type="password" value={formData.confirm_password} required onChange={(confirm_password) => setFormData({ ...formData, confirm_password })} />
        <ModalFooter loading={loading} submitLabel="Create" onClose={onClose} />
      </form>
    </div></div>
  );
}

function EditUserModal({
  user,
  currentUserRole,
  currentUserSiteId,
  sites,
  onClose,
  onSubmit,
}: {
  user: User;
  currentUserRole?: UserRole;
  currentUserSiteId?: number;
  sites: Site[];
  onClose: () => void;
  onSubmit: (data: EditUserFormData) => Promise<void>;
}) {
  const lockedSiteId = currentUserRole === "site_research_scientist" ? currentUserSiteId : undefined;
  const [formData, setFormData] = useState<EditUserFormData>({
    display_name: user.display_name || "", email: user.email || "", role: user.role,
    site_id: user.site_id ?? "",
    new_password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const roles = permittedRoles(currentUserRole);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await onSubmit(formData); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to update user"); }
    finally { setLoading(false); }
  }

  return (
    <div className={styles.modal}><div className={styles.modalContent}>
      <div className={styles.modalHeader}><h2>Edit User: {user.username}</h2><button onClick={onClose} className={styles.closeBtn}>✕</button></div>
      {error && <div className={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit} autoComplete="off">
        <FormInput label="Display Name" value={formData.display_name} onChange={(display_name) => setFormData({ ...formData, display_name })} />
        <FormInput label="Email" name="edit-user-email" autoComplete="off" type="email" value={formData.email} onChange={(email) => setFormData({ ...formData, email })} />
        <div className={styles.formGroup}><label>Role</label><select value={formData.role} onChange={(event) => {
          const role = event.target.value as UserRole;
          const siteRequired = SITE_ADMIN_ROLES.has(role);
          setFormData({ ...formData, role, site_id: siteRequired ? formData.site_id : "" });
        }}>{roles.map((role) => <option key={role} value={role}>{role.replace(/_/g, " ")}</option>)}</select></div>
        <ScopeSelector siteId={formData.site_id} sites={sites} lockedSiteId={lockedSiteId} siteRequired={SITE_ADMIN_ROLES.has(formData.role)} onChange={(site_id) => setFormData({ ...formData, site_id })} />
        <FormInput label="New Password (leave blank to keep current)" name="edit-user-new-password" autoComplete="new-password" type="password" value={formData.new_password} onChange={(new_password) => setFormData({ ...formData, new_password })} />
        <p className={styles.statusHint}>Account status is changed with the switch in the Users table.</p>
        <ModalFooter loading={loading} submitLabel="Update" onClose={onClose} />
      </form>
    </div></div>
  );
}

function FormInput({ label, value, type = "text", required = false, name, autoComplete, onChange }: { label: string; value: string; type?: string; required?: boolean; name?: string; autoComplete?: string; onChange: (value: string) => void }) {
  return <div className={styles.formGroup}><label>{label}</label><input type={type} name={name} autoComplete={autoComplete} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></div>;
}

function ModalFooter({ loading, submitLabel, onClose }: { loading: boolean; submitLabel: string; onClose: () => void }) {
  return <div className={styles.modalFooter}><button type="button" onClick={onClose} className={styles.secondaryBtn}>Cancel</button><button type="submit" disabled={loading} className={styles.primaryBtn}>{loading ? `${submitLabel.slice(0, -1)}ing...` : submitLabel}</button></div>;
}
