export type EventApplyStatus =
  | "applied"
  | "held_duplicate"
  | "rejected_invalid"
  | "superseded";

export type EventAggregateType = "household" | "pregnancy" | (string & {});

export interface DomainEventEnvelope<TPayload = Record<string, unknown>> {
  event_id: string;
  event_type: string;
  event_version: number;
  aggregate_type: EventAggregateType;
  aggregate_id: string;
  site_id: number;
  locality_code: string;
  household_id: string;
  subject_type?: string | null;
  subject_id?: string | null;
  task_id?: string | null;
  task_key?: string | null;
  form_response_id?: string | null;
  source_event_id?: string | null;
  source_response_id?: string | null;
  source_task_id?: string | null;
  event_date: string;
  recorded_at: string;
  server_commit_sequence?: number | null;
  created_offline_at?: string | null;
  device_id?: string | null;
  user_id?: string | null;
  rules_version: string;
  payload: TPayload;
  apply_status: EventApplyStatus;
}

export type HouseholdOccupancyStatus =
  | "occupied"
  | "empty"
  | "vacant"
  | "not_occupied"
  | "other_unknown";

export type HouseholdEnrollmentStatus = "enrolled" | "not_enrolled";

export interface HouseholdBaselineConfirmedPayload {
  household_id: string;
  household_number: string;
  structure_map_id: string;
  baseline_date: string;
  occupancy_status: HouseholdOccupancyStatus;
  enrollment_status: HouseholdEnrollmentStatus;
}

export interface HouseholdProjection {
  household_id: string;
  site_id: number;
  locality_code: string;
  household_number?: string | null;
  structure_map_id?: string | null;
  baseline_date?: string | null;
  occupancy_status?: HouseholdOccupancyStatus | null;
  enrollment_status: HouseholdEnrollmentStatus;
  is_enrolled: boolean;
  follow_up_enabled: boolean;
  source_event_id: string;
  source_response_id?: string | null;
  rules_version: string;
  projection_version: number;
}

export type PregnancyStatus =
  | "active"
  | "enrolled"
  | "closed"
  | (string & {});

export interface PregnancyEnrolledPayload {
  pregnancy_id: string;
  woman_id: string;
  household_member_id: string;
  household_id: string;
  enrollment_date: string;
  pregnancy_status: PregnancyStatus;
  usg_available: boolean;
}

export interface PregnancyProjection {
  pregnancy_id: string;
  woman_id: string;
  household_member_id: string;
  household_id: string;
  site_id: number;
  locality_code: string;
  enrollment_date?: string | null;
  pregnancy_status: PregnancyStatus;
  usg_available: boolean;
  source_event_id: string;
  source_response_id?: string | null;
  source_task_id?: string | null;
  rules_version: string;
  projection_version: number;
}

export interface PregnancyFollowupCompletedPayload {
  pregnancy_id: string;
  woman_id: string;
  household_id: string;
  visit_date: string;
  pregnancy_status?: string | null;
}

export interface PregnancyOutcomeRecordedPayload {
  pregnancy_id: string;
  woman_id: string;
  household_id: string;
  outcome_date: string;
  outcome_type: string;
  live_birth_count: number;
  stillbirth_count: number;
}

export interface BirthAssessmentCompletedPayload {
  pregnancy_id: string;
  woman_id: string;
  child_id: string;
  household_id: string;
  birth_date: string;
  birth_status: "live_birth" | "stillbirth" | "fetal_loss_20plus";
  current_vital_status: "alive" | "deceased";
  death_date?: string | null;
}
