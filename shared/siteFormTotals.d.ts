export interface DashboardWorkload {
  completed: number;
  draft: number;
  pending: number;
  upcoming: number;
  closed: number;
  overdue: number;
}

export interface SiteOperationalProgress {
  households: { total: number; assigned: number; completed: number; draft: number; pending: number; closed: number };
  tasks: DashboardWorkload;
  tasks_by_code: Record<string, DashboardWorkload>;
  active_field_workers: number;
  eligible_women: number;
  active_pregnancies: number;
}

export interface SiteFormTotals {
  generated_at: string;
  sites: {
    site_id: number;
    site_name: string;
    total: number;
    forms_by_code: Record<string, number>;
    progress: SiteOperationalProgress;
  }[];
}
