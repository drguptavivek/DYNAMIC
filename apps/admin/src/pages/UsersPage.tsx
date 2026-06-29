import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { UserRole } from "../lib/auth-context";
import styles from "./UsersPage.module.css";

interface User {
  user_id: string;
  username: string;
  display_name?: string;
  email?: string;
  role: UserRole;
  site_id?: number;
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

const ROLES = [
  "field_worker",
  "field_supervisor",
  "site_research_scientist",
  "central_admin",
  "site_data_manager",
  "central_data_manager",
  "us_collaborator",
] as const;

interface CreateUserFormData extends Partial<User> {
  password: string;
  confirm_password: string;
  staff_full_name: string;
  staff_designation: string;
  staff_country: string;
  institution_name: string;
  institution_country: string;
  institution_type: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [assignmentsByUser, setAssignmentsByUser] = useState<Record<string, AreaAssignment[]>>({});
  const [localityNamesByKey, setLocalityNamesByKey] = useState<Record<string, string>>({});
  const [siteNamesById, setSiteNamesById] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<boolean | "">("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
  }, [search, roleFilter, activeFilter]);

  useEffect(() => {
    loadSiteNames();
    loadLocalityNames();
  }, []);

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
      await loadAreaAssignments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadAreaAssignments(usersToLoad: User[]) {
    const entries = await Promise.all(
      usersToLoad.map(async (user) => {
        try {
          const assignments = await api.get<AreaAssignment[]>(
            `/users/${user.user_id}/area-assignments`,
          );
          return [user.user_id, assignments] as const;
        } catch {
          return [user.user_id, []] as const;
        }
      }),
    );
    setAssignmentsByUser(Object.fromEntries(entries));
  }

  async function loadLocalityNames() {
    try {
      const localities = await api.get<Locality[]>("/masters/localities");
      setLocalityNamesByKey(
        Object.fromEntries(
          localities.map((locality) => [
            `${locality.site_id}-${locality.locality_code}`,
            locality.locality_name,
          ]),
        ),
      );
    } catch {
      setLocalityNamesByKey({});
    }
  }

  async function loadSiteNames() {
    try {
      const sites = await api.get<Site[]>("/masters/sites");
      setSiteNamesById(
        Object.fromEntries(
          sites.map((site) => [site.site_id, `${site.site_name} (${site.site_code})`]),
        ),
      );
    } catch {
      setSiteNamesById({});
    }
  }

  async function handleCreateUser(formData: CreateUserFormData) {
    try {
      if (formData.password !== formData.confirm_password) {
        throw new Error("Passwords do not match");
      }
      if (!formData.staff_full_name.trim()) {
        throw new Error("Staff full name is required");
      }
      if (!formData.staff_designation.trim()) {
        throw new Error("Staff designation is required");
      }
      if (!formData.institution_name.trim()) {
        throw new Error("Institution name is required");
      }
      await api.post("/users", {
        username: formData.username,
        display_name: formData.display_name,
        email: formData.email,
        role: formData.role,
        site_id: formData.site_id,
        password: formData.password,
        staff: {
          full_name: formData.staff_full_name,
          email: formData.email,
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
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    }
  }

  async function handleEditUser(formData: Partial<User> & { new_password?: string }) {
    try {
      if (!editingUser) return;
      await api.patch(`/users/${editingUser.user_id}`, {
        display_name: formData.display_name,
        email: formData.email,
        role: formData.role,
        site_id: formData.site_id,
        active: formData.active,
        ...(formData.new_password && { password: formData.new_password }),
      });
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    }
  }

  async function handleDeactivateUser(userId: string) {
    try {
      await api.delete(`/users/${userId}`);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate user");
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Users</h1>
        <button onClick={() => setShowCreateModal(true)} className={styles.primaryBtn}>
          Create User
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Search username or display name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Roles</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={activeFilter as any}
          onChange={(e) => setActiveFilter(e.target.value === "" ? "" : e.target.value === "true")}
          className={styles.filterSelect}
        >
          <option value="">All Statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Site ID</th>
                <th>Assigned Localities</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td>{user.username}</td>
                  <td>{user.display_name || "—"}</td>
                  <td>{user.role.replace(/_/g, " ")}</td>
                  <td>
                    <SiteId siteId={user.site_id} siteNamesById={siteNamesById} />
                  </td>
                  <td>
                    <AssignmentBadges
                      assignments={assignmentsByUser[user.user_id] ?? []}
                      localityNamesByKey={localityNamesByKey}
                    />
                  </td>
                  <td>{user.active ? "Yes" : "No"}</td>
                  <td>
                    <button onClick={() => setEditingUser(user)} className={styles.actionBtn}>
                      Edit
                    </button>
                    {user.active && (
                      <button
                        onClick={() => handleDeactivateUser(user.user_id)}
                        className={`${styles.actionBtn} ${styles.dangerBtn}`}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreateUser} />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={handleEditUser}
        />
      )}
    </div>
  );
}

function SiteId({
  siteId,
  siteNamesById,
}: {
  siteId?: number;
  siteNamesById: Record<number, string>;
}) {
  if (!siteId) {
    return <span className={styles.muted}>—</span>;
  }

  return (
    <span className={styles.siteId} title={siteNamesById[siteId] ?? String(siteId)}>
      {siteId}
    </span>
  );
}

function AssignmentBadges({
  assignments,
  localityNamesByKey,
}: {
  assignments: AreaAssignment[];
  localityNamesByKey: Record<string, string>;
}) {
  const now = new Date();
  const activeAssignments = assignments.filter((assignment) => {
    const activeFrom = assignment.active_from ? new Date(assignment.active_from) : null;
    const activeTo = assignment.active_to ? new Date(assignment.active_to) : null;
    return (!activeFrom || activeFrom <= now) && (!activeTo || activeTo >= now);
  });

  if (activeAssignments.length === 0) {
    return <span className={styles.muted}>—</span>;
  }

  return (
    <div className={styles.assignmentList}>
      {activeAssignments.map((assignment) => {
        const key = `${assignment.site_id}-${assignment.locality_code}`;
        const localityName = localityNamesByKey[key];
        const title = localityName ? `${localityName} (${key})` : key;

        return (
          <span key={assignment.assignment_id} className={styles.assignmentBadge} title={title}>
            {key}
          </span>
        );
      })}
    </div>
  );
}

function CreateUserModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    username: "",
    display_name: "",
    email: "",
    role: "field_worker",
    site_id: "",
    staff_full_name: "",
    staff_designation: "Field Worker",
    staff_country: "India",
    institution_name: "",
    institution_country: "India",
    institution_type: "study_site",
    password: "",
    confirm_password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Create User</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            ✕
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Username *</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Role *</label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value,
                  staff_designation:
                    formData.staff_designation || e.target.value.replace(/_/g, " "),
                })
              }
              required
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Site ID</label>
            <input
              type="number"
              value={formData.site_id}
              onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Staff Full Name *</label>
            <input
              type="text"
              value={formData.staff_full_name}
              onChange={(e) => setFormData({ ...formData, staff_full_name: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Designation *</label>
            <input
              type="text"
              value={formData.staff_designation}
              onChange={(e) => setFormData({ ...formData, staff_designation: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Staff Country</label>
            <input
              type="text"
              value={formData.staff_country}
              onChange={(e) => setFormData({ ...formData, staff_country: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Institution Name *</label>
            <input
              type="text"
              value={formData.institution_name}
              onChange={(e) => setFormData({ ...formData, institution_name: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Institution Country</label>
            <input
              type="text"
              value={formData.institution_country}
              onChange={(e) => setFormData({ ...formData, institution_country: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Institution Type</label>
            <select
              value={formData.institution_type}
              onChange={(e) => setFormData({ ...formData, institution_type: e.target.value })}
            >
              <option value="study_site">Study Site</option>
              <option value="coordinating_center">Coordinating Center</option>
              <option value="collaborator">Collaborator</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Password *</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Confirm Password *</label>
            <input
              type="password"
              value={formData.confirm_password}
              onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
              required
            />
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={styles.primaryBtn}>
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onSubmit,
}: {
  user: User;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    display_name: user.display_name || "",
    email: user.email || "",
    role: user.role,
    site_id: user.site_id || "",
    active: user.active,
    new_password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Edit User: {user.username}</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            ✕
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Site ID</label>
            <input
              type="number"
              value={formData.site_id}
              onChange={(e) => setFormData({ ...formData, site_id: e.target.value as any })}
            />
          </div>

          <div className={styles.formGroup}>
            <label>
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              Active
            </label>
          </div>

          <div className={styles.formGroup}>
            <label>New Password (leave blank to keep current)</label>
            <input
              type="password"
              value={formData.new_password}
              onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
            />
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={styles.primaryBtn}>
              {loading ? "Updating..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
