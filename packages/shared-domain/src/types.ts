// Domain TypeScript types — see Section A of implementation plan

export type {};
// Union types for enums
export type TaskStatus =
  | "planned"
  | "due"
  | "urgent"
  | "overdue"
  | "in_progress"
  | "completed_on_time"
  | "completed_late"
  | "missed"
  | "postponed"
  | "not_reachable_closed"
  | "cancelled"
  | "superseded";
export type FormCode =
  | "HHQ"
  | "WQ"
  | "HRF"
  | "PEF"
  | "UF"
  | "PFF"
  | "POF"
  | "BAF"
  | "SBF"
  | "NFF"
  | "CDF"
  | "VA";
export type SubjectType = "household" | "person" | "woman" | "pregnancy" | "child";
export type ActualMode = "face_to_face" | "telephonic";
export type EventType =
  | "household_baseline_confirmed"
  | "household_round_completed"
  | "woman_eligible"
  | "wq_completed"
  | "pregnancy_detected"
  | "pregnancy_enrolled"
  | "usg_report_available"
  | "pregnancy_followup_completed"
  | "delivery_reported"
  | "pregnancy_outcome_recorded"
  | "birth_assessment_completed"
  | "stillbirth_recorded"
  | "newborn_followup_completed"
  | "child_death_recorded"
  | "verbal_autopsy_due"
  | "verbal_autopsy_completed"
  | "person_dob_updated"
  | "member_in_migrated"
  | "member_married_in"
  | "member_out_migrated"
  | "member_deceased"
  | "new_eligible_woman_found";
export type UserRole =
  | "field_worker"
  | "field_supervisor"
  | "site_research_scientist"
  | "central_admin"
  | "site_data_manager"
  | "central_data_manager"
  | "us_collaborator";
export type DobPrecision = "exact_date" | "inferred_from_age" | "estimated_year" | "unknown";
export type LmpPrecision = "exact_date" | "days_ago" | "weeks_ago" | "months_ago" | "unknown";
export type OutcomeType = "live_birth" | "stillbirth" | "miscarriage" | "abortion" | "ectopic";
export type SyncStatus = "local" | "synced" | "pending";
export type GenerationSource = "scheduled" | "event_triggered" | "unscheduled_opportunity";
export type ModeRuleStrength = "default" | "required" | "flexible";

// Domain entities
export interface StudySite {
  site_id: number;
  site_code: string;
  site_name: string;
}

export interface StudyLocality {
  site_id: number;
  locality_code: string;
  locality_name: string;
  locality_type: string;
}

export interface MappingFrame {
  household_id: string;
  site_id: number;
  locality_code: string;
  structure_map_id: string;
  household_number: string;
  structure_id: string;
  mapping_status: string;
  baseline_enrollment_status: string;
}

export interface Household {
  household_id: string;
  site_id: number;
  locality_code: string;
  structure_map_id: string;
  household_number: string;
  residence_area_type?: string | null;
  address?: string | null;
  household_head_name?: string | null;
  contact_mobile?: string | null;
  consent_status?: string | null;
  result_interview?: string | null;
  language_questionnaire?: string | null;
  baseline_enrollment_status?: string | null;
  baseline_completed_date?: Date | string | null;
  cohort_status?: string | null;
  closed_reason?: string | null;
  religion_head?: string | null;
  caste_category?: string | null;
  household_characteristics?: Record<string, unknown> | null;
  sync_status?: SyncStatus;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface HouseholdMember {
  household_member_id: string;
  household_id: string;
  member_number: number;
  site_id: number;
  locality_code: string;
  name?: string | null;
  relationship_to_head?: string | null;
  sex?: string | null;
  last_residence_place?: string | null;
  residence_months?: number | null;
  residence_years?: number | null;
  date_of_birth?: Date | string | null;
  date_of_birth_precision?: DobPrecision | null;
  reported_age_years?: number | null;
  reported_age_as_of_date?: Date | string | null;
  dob_inference_rule_version?: string | null;
  marital_status?: string | null;
  woman_questionnaire_eligible?: boolean | null;
  birth_registration_status?: string | null;
  ever_attended_school?: boolean | null;
  highest_grade_completed?: string | null;
  member_status?: string | null;
  usual_resident?: boolean | null;
  member_source?: string | null;
  sync_status?: SyncStatus;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface EligibleWoman {
  woman_id: string;
  household_member_id: string;
  household_id: string;
  site_id: number;
  locality_code: string;
  eligibility_start_date?: Date | string | null;
  eligibility_source_event_id?: string | null;
  wq_status?: string | null;
  tracking_status?: string | null;
  current_eligibility_status?: string | null;
  eligibility_basis?: string | null;
  woman_permanent_id?: string | null;
  analysis_eligibility_flag?: string | null;
  sync_status?: SyncStatus;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface EligibilityAssessment {
  assessment_id: string;
  person_id: string;
  household_id: string;
  assessment_date?: Date | string | null;
  age_years_used?: number | null;
  age_source?: string | null;
  sex_used?: string | null;
  marital_status_used?: string | null;
  usual_resident_used?: boolean | null;
  eligible_wq?: boolean | null;
  eligible_pregnancy_tracking?: boolean | null;
  created_event_id?: string | null;
}

export interface Pregnancy {
  pregnancy_id: string;
  woman_id: string;
  household_member_id: string;
  household_id: string;
  site_id: number;
  locality_code: string;
  pregnancy_sequence?: number | null;
  pregnancy_status?: string | null;
  detected_date?: Date | string | null;
  enrollment_date?: Date | string | null;
  detection_source?: string | null;
  lmp_date?: Date | string | null;
  lmp_precision?: LmpPrecision | null;
  edd_date?: Date | string | null;
  outcome_recorded_date?: Date | string | null;
  gestational_age_at_enrollment?: number | null;
  current_conditions?: Record<string, unknown> | null;
  current_symptoms?: Record<string, unknown> | null;
  anthropometrics?: Record<string, unknown> | null;
  source_event_id?: string | null;
  sync_status?: SyncStatus;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface UltrasoundRecord {
  ultrasound_id: string;
  pregnancy_id: string;
  woman_id: string;
  household_id: string;
  site_id: number;
  report_date?: Date | string | null;
  report_sequence?: number | null;
  gestational_age?: number | null;
  attachment_reference?: string | null;
  source_form_response_id?: string | null;
  created_at?: Date | string;
}

export interface PregnancyOutcome {
  pregnancy_outcome_id: string;
  pregnancy_id: string;
  outcome_date?: Date | string | null;
  outcome_type?: OutcomeType | null;
  gestational_age_at_outcome?: number | null;
  live_birth_count?: number | null;
  fetal_loss_count?: number | null;
  source_form_response_id?: string | null;
  created_at?: Date | string;
}

export interface Child {
  child_id: string;
  birth_id?: string | null;
  pregnancy_id: string;
  woman_id: string;
  household_id: string;
  site_id: number;
  birth_rank?: number | null;
  birth_date?: Date | string | null;
  birth_status?: string | null;
  live_birth_status?: string | null;
  current_vital_status?: string | null;
  death_date?: Date | string | null;
  gestational_age_at_birth?: number | null;
  sex?: string | null;
  birth_weight_grams?: number | null;
  source_event_id?: string | null;
  sync_status?: SyncStatus;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface Visit {
  visit_id: string;
  session_id?: string | null;
  site_id: number;
  locality_code: string;
  household_id: string;
  primary_subject_type?: SubjectType | null;
  primary_subject_id?: string | null;
  started_at?: Date | string | null;
  completed_at?: Date | string | null;
  interviewer_id?: string | null;
  device_id?: string | null;
  actual_mode?: ActualMode | null;
  gps_metadata?: Record<string, unknown> | null;
  sync_status?: SyncStatus;
  created_at?: Date | string;
}

export interface FormResponse {
  form_response_id: string;
  response_id?: string | null;
  site_id: number;
  locality_code: string;
  household_id: string;
  visit_id?: string | null;
  task_id?: string | null;
  series_id?: string | null;
  sequence_number?: number | null;
  form_code?: FormCode | null;
  form_version?: string | null;
  subject_type?: SubjectType | null;
  subject_id?: string | null;
  lineage_ids_json?: Record<string, unknown> | null;
  prefill_snapshot_json?: Record<string, unknown> | null;
  prefill_mapper_version?: string | null;
  answers_json?: Record<string, unknown> | null;
  created_offline_at?: Date | string | null;
  updated_offline_at?: Date | string | null;
  device_id?: string | null;
  synced_at?: Date | string | null;
  response_status?: string | null;
  created_at?: Date | string;
}

export interface DomainEvent {
  event_id: string;
  event_type?: EventType | null;
  site_id: number;
  locality_code: string;
  household_id: string;
  subject_type?: SubjectType | null;
  subject_id?: string | null;
  visit_id?: string | null;
  task_id?: string | null;
  form_response_id?: string | null;
  event_datetime?: Date | string | null;
  created_offline_at?: Date | string | null;
  device_id?: string | null;
  sync_status?: SyncStatus;
  apply_status?: string | null;
  created_at?: Date | string;
}

export interface FollowUpTask {
  task_id: string;
  task_key: string;
  site_id: number;
  locality_code: string;
  household_id: string;
  subject_type?: SubjectType | null;
  subject_id?: string | null;
  woman_id?: string | null;
  pregnancy_id?: string | null;
  child_id?: string | null;
  task_type?: FormCode | null;
  form_code?: FormCode | null;
  expected_forms?: string[] | null;
  series_id?: string | null;
  sequence_number?: number | null;
  protocol_visit_label?: string | null;
  generation_source?: GenerationSource | null;
  source_event_id?: string | null;
  anchor_event_id?: string | null;
  anchor_date?: Date | string | null;
  window_start?: Date | string | null;
  target_date?: Date | string | null;
  deadline_date?: Date | string | null;
  status?: TaskStatus | null;
  priority?: string | null;
  default_expected_mode?: ActualMode | null;
  allowed_modes?: string[] | null;
  mode_rule_strength?: ModeRuleStrength | null;
  max_failed_attempts?: number | null;
  failed_attempt_count?: number | null;
  requires_final_close_reason?: boolean | null;
  task_context_json?: Record<string, unknown> | null;
  context_builder_version?: string | null;
  prefill_mapper_version?: string | null;
  rules_version?: string | null;
  form_availability?: string | null;
  action_state?: string | null;
  disabled_reason?: string | null;
  completed_visit_id?: string | null;
  completed_at?: Date | string | null;
  closed_at?: Date | string | null;
  closed_reason?: string | null;
  superseded_by_event_id?: string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface TaskAttempt {
  attempt_id: string;
  task_id: string;
  attempt_number?: number | null;
  visit_id?: string | null;
  attempted_at?: Date | string | null;
  attempted_by_user_id?: string | null;
  device_id?: string | null;
  attempted_mode?: ActualMode | null;
  outcome?: string | null;
  reason_code?: string | null;
  notes?: string | null;
  next_attempt_date?: Date | string | null;
  created_at?: Date | string;
}

export interface AdminCorrectionEvent {
  correction_event_id: string;
  site_id: number;
  subject_type?: SubjectType | null;
  subject_id?: string | null;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  old_precision?: string | null;
  new_precision?: string | null;
  reason_code?: string | null;
  reason_text?: string | null;
  source_reference?: string | null;
  corrected_by_user_id?: string | null;
  corrected_at?: Date | string | null;
  created_at?: Date | string;
}

export interface DataQualityFlag {
  flag_id: string;
  site_id: number;
  flag_type?: string | null;
  subject_type?: SubjectType | null;
  subject_id?: string | null;
  task_id?: string | null;
  primary_response_id?: string | null;
  duplicate_response_id?: string | null;
  severity?: string | null;
  status?: string | null;
  created_at?: Date | string;
  reviewed_by_user_id?: string | null;
  reviewed_at?: Date | string | null;
  review_note?: string | null;
}

export interface PersonAttributeHistory {
  history_id: string;
  person_id: string;
  field_name?: string | null;
  old_value?: string | null;
  old_precision?: string | null;
  new_value?: string | null;
  new_precision?: string | null;
  source_form_response_id?: string | null;
  source_event_id?: string | null;
  changed_at?: Date | string | null;
  changed_by_user_id?: string | null;
  device_id?: string | null;
}

export interface User {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  email?: string | null;
  role?: UserRole | null;
  site_id?: number | null;
  password_hash?: string | null;
  active?: boolean | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface Device {
  device_id: string;
  device_name?: string | null;
  user_id?: string | null;
  last_sync_at?: Date | string | null;
  registered_at?: Date | string;
}

export interface UserAreaAssignment {
  assignment_id: string;
  user_id: string;
  site_id: number;
  locality_code: string;
  role?: UserRole | null;
  active_from?: Date | string | null;
  active_to?: Date | string | null;
  created_at?: Date | string;
}

export interface SyncLog {
  sync_log_id: string;
  device_id: string;
  user_id?: string | null;
  direction?: string | null;
  records_sent?: number | null;
  records_received?: number | null;
  conflicts_detected?: number | null;
  started_at?: Date | string | null;
  completed_at?: Date | string | null;
  status?: string | null;
  error_detail?: string | null;
}
