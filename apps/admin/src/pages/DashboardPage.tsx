import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import styles from "./DashboardPage.module.css";

type DashboardStats = { households: number; members: number; eligible_women: number; tracking_eligible_women: number; active_pregnancies: number; children: number; tasks: number; open_data_quality_flags: number };

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  useEffect(() => { api.get<DashboardStats>("/dashboard").then(setStats).catch(() => setStats(null)); }, []);
  return (
    <div className={styles.container}>
      <h1>Dashboard</h1>
      <p className={styles.subtitle}>DYNAMIC - PreTESTING Study - Admin Console</p>
      <div className={styles.userCard}>
        <h2>Welcome, {user?.display_name || user?.username}!</h2>
        <p>User ID: {user?.user_id}</p><p>Role: {user?.role?.replace(/_/g, " ")}</p>
        {user?.site_id && <p>Site ID: {user.site_id}</p>}
      </div>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}><div className={styles.statLabel}>Households Enrolled</div><div className={styles.statValue}>{stats?.households ?? "-"}</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Active Pregnancies</div><div className={styles.statValue}>{stats?.active_pregnancies ?? "-"}</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Household Members</div><div className={styles.statValue}>{stats?.members ?? "-"}</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Eligible Women</div><div className={styles.statValue}>{stats?.eligible_women ?? "-"}</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Tracking Eligible</div><div className={styles.statValue}>{stats?.tracking_eligible_women ?? "-"}</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Children</div><div className={styles.statValue}>{stats?.children ?? "-"}</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Tasks</div><div className={styles.statValue}>{stats?.tasks ?? "-"}</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Open Data Quality Flags</div><div className={styles.statValue}>{stats?.open_data_quality_flags ?? "-"}</div></div>
      </div>
    </div>
  );
}
