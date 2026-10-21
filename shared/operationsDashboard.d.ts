export type OperationFormCode = "HHQ" | "WQ" | "HRF" | "PEF" | "UF" | "PFF" | "POF" | "BAF" | "SBF" | "NFF" | "CDF" | "PSF";
export interface DashboardLocality { site_id: number; locality_code: string; locality_name: string; }
export interface DashboardMetrics {
  assigned_households: number;
  forms_completed: number;
  forms_received: number;
  backed_up_drafts: number;
  pending_tasks: number;
  overdue_tasks: number;
  sync_errors: number;
  forms_by_code: Record<string, number>;
}
export interface DashboardStaffRow extends DashboardMetrics {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  active: boolean;
  site_id: number | null;
  site_name: string;
  assigned_localities: DashboardLocality[];
  completed_localities: DashboardLocality[];
  last_sync_at: string | null;
  last_sync_status: string | null;
}
export interface OperationsDashboard {
  cohort: { households: number; members: number; eligible_women: number; tracking_eligible_women: number; active_pregnancies: number; children: number };
  date: string;
  timezone: "Asia/Kolkata";
  generated_at: string;
  scope: { all_sites: boolean; site_id: number | null; locality_code: string | null };
  sites: { site_id: number; site_name: string }[];
  localities: DashboardLocality[];
  totals: DashboardMetrics & { users: number; active_users: number; unattributed_forms: number; open_data_quality_flags: number };
  users: DashboardStaffRow[];
  sites_summary: (DashboardMetrics & { site_id: number; site_name: string; users: number })[];
  localities_summary: (DashboardMetrics & DashboardLocality & { users: number })[];
  notes: string[];
}
