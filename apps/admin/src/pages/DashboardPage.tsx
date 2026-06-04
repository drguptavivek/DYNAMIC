import { useAuth } from "../lib/auth-context";
import styles from "./DashboardPage.module.css";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className={styles.container}>
      <h1>Dashboard</h1>
      <p className={styles.subtitle}>DYNAMIC PreTSING Study — Admin Console</p>

      <div className={styles.userCard}>
        <h2>Welcome, {user?.display_name || user?.username}!</h2>
        <p>User ID: {user?.user_id}</p>
        <p>Role: {user?.role?.replace(/_/g, " ")}</p>
        {user?.site_id && <p>Site ID: {user.site_id}</p>}
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Households Enrolled</div>
          <div className={styles.statValue}>—</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Pregnancies</div>
          <div className={styles.statValue}>—</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Tasks Overdue</div>
          <div className={styles.statValue}>—</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Open Data Quality Flags</div>
          <div className={styles.statValue}>—</div>
        </div>
      </div>
    </div>
  );
}
