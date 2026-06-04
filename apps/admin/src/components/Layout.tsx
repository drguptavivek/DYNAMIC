import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import styles from "./Layout.module.css";

const ROLE_COLORS: Record<string, string> = {
  central_admin: "purple",
  site_research_scientist: "blue",
  field_supervisor: "green",
  field_worker: "gray",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isAdmin = user?.role === "central_admin" || user?.role === "site_research_scientist";
  const links = [
    { path: "/", label: "Dashboard" },
    ...(isAdmin ? [{ path: "/users", label: "Users" }] : []),
    { path: "/masters", label: "Study Masters" },
    { path: "/households", label: "Households" },
    { path: "/tasks", label: "Tasks" },
    { path: "/data-quality", label: "Data Quality" },
    { path: "/sync-logs", label: "Sync Logs" },
    { path: "/eligible-women", label: "Eligible Women" },
    { path: "/pregnant-women", label: "Pregnant Women" },
    { path: "/children", label: "Children" },
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
