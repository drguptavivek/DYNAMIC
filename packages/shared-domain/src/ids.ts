// ID construction utilities

export interface HouseholdIdParams {
  site_id: number;
  locality_code: string;
  structure_map_id: string;
  household_number: string;
}

export interface MemberIdParams {
  household_id: string;
  member_number: number;
}

export interface ChildIdParams {
  pregnancy_id: string;
  birth_rank: number;
}

export interface TaskKeyParams {
  household_id: string;
  subject_type: string;
  subject_id: string;
  task_type: string;
  protocol_visit_label: string;
  target_date: string;
  rules_version: string;
}

export const buildHouseholdId = (params: HouseholdIdParams): string => {
  return `${params.site_id}-${params.locality_code}-${params.structure_map_id}-${params.household_number}`;
};

export const buildMemberID = (params: MemberIdParams): string => {
  return `${params.household_id}-${String(params.member_number).padStart(2, "0")}`;
};

export const buildChildId = (params: ChildIdParams): string => {
  return `${params.pregnancy_id}-B${params.birth_rank}`;
};

export const buildTaskKey = (params: TaskKeyParams): string => {
  return `${params.household_id}|${params.subject_type}|${params.subject_id}|${params.task_type}|${params.protocol_visit_label}|${params.target_date}|${params.rules_version}`;
};
