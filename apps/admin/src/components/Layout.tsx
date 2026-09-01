import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import styles from "./Layout.module.css";

const ROLE_COLORS: Record<string, string> = {
  central_admin: "purple",
  site_research_scientist: "blue",
  site_investigator: "cyan",
  field_supervisor: "green",
  field_worker: "gray",
  site_data_manager: "teal",
  central_data_manager: "indigo",
  us_collaborator: "orange",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isAdmin = user?.role === "central_admin" || user?.role === "site_research_scientist";
  const canManageFormLanguage =
    user?.role === "central_admin" ||
    user?.role === "site_research_scientist" ||
    user?.role === "site_data_manager";
  const links = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/tasks", label: "Tasks" },
    { path: "/data-quality", label: "Data Quality" },
    { path: "/sync-logs", label: "Sync Logs" },
    ...(canManageFormLanguage
      ? [{ path: "/form-language-management", label: "Form Language Management" }]
      : []),
    { path: "/form-data-export", label: "Form Data Export" },
    { path: "/households", label: "Households" },
    { path: "/household-members", label: "Household Members" },
    { path: "/eligible-women", label: "Eligible Women" },
    { path: "/eligible-pregnancy-tracking", label: "Eligible for Pregnancy Tracking" },
    { path: "/pregnant-women", label: "Pregnant Women" },
    { path: "/children", label: "Children" },
    { path: "/masters", label: "Study Masters" },
    ...(isAdmin ? [{ path: "/users", label: "Users" }] : []),
    ...(isAdmin
      ? [{ path: "/field-worker-household-assignment", label: "Field Worker Household Assignment" }]
      : []),
  ];

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>DYNAMIC</div>
        <nav>
          {links.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`${styles.navLink} ${location.pathname === link.path ? styles.active : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.topBar}>
          <div className={styles.userInfo}>
            <span className={styles.displayName}>{user?.display_name || user?.username}</span>
            <span
              className={styles.roleBadge}
              style={{
                backgroundColor: ROLE_COLORS[user?.role || "field_worker"] || "#999",
              }}
            >
              {user?.role?.replace(/_/g, " ")}
            </span>
            <button onClick={logout} className={styles.logoutBtn}>
              Logout
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
