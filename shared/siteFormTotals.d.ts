export interface SiteFormTotals {
  generated_at: string;
  sites: {
    site_id: number;
    site_name: string;
    total: number;
    forms_by_code: Record<string, number>;
  }[];
}
