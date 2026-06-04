import { z } from "zod";
import {
  Household,
  HouseholdMember,
  EligibleWoman,
  FollowUpTask,
  FormResponse,
  SyncStatus,
  TaskStatus,
  FormCode,
  SubjectType,
  DobPrecision,
  ActualMode,
} from "./types";

// Base schema for sync status
const SyncStatusSchema = z.enum(["local", "synced", "pending"]).optional();

// Household schema
export const HouseholdSchema = z.object({
  household_id: z.string(),
  site_id: z.number().int(),
  locality_code: z.string(),
  structure_map_id: z.string(),
  household_number: z.string(),
  residence_area_type: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  household_head_name: z.string().nullable().optional(),
  contact_mobile: z.string().nullable().optional(),
  consent_status: z.string().nullable().optional(),
  result_interview: z.string().nullable().optional(),
  language_questionnaire: z.string().nullable().optional(),
  baseline_enrollment_status: z.string().nullable().optional(),
  baseline_completed_date: z.union([z.date(), z.string()]).nullable().optional(),
  cohort_status: z.string().nullable().optional(),
  closed_reason: z.string().nullable().optional(),
  religion_head: z.string().nullable().optional(),
  caste_category: z.string().nullable().optional(),
  household_characteristics: z.record(z.unknown()).nullable().optional(),
  sync_status: SyncStatusSchema,
  created_at: z.union([z.date(), z.string()]).optional(),
  updated_at: z.union([z.date(), z.string()]).optional(),
}) satisfies z.ZodType<Household>;

// HouseholdMember schema
export const HouseholdMemberSchema = z.object({
  household_member_id: z.string(),
  household_id: z.string(),
  member_number: z.number().int(),
  site_id: z.number().int(),
  locality_code: z.string(),
  name: z.string().nullable().optional(),
  relationship_to_head: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  last_residence_place: z.string().nullable().optional(),
  residence_months: z.number().int().nullable().optional(),
  residence_years: z.number().int().nullable().optional(),
  date_of_birth: z.union([z.date(), z.string()]).nullable().optional(),
  date_of_birth_precision: z
    .enum(["exact_date", "inferred_from_age", "estimated_year", "unknown"])
    .nullable()
    .optional(),
  reported_age_years: z.number().int().nullable().optional(),
  reported_age_as_of_date: z.union([z.date(), z.string()]).nullable().optional(),
  dob_inference_rule_version: z.string().nullable().optional(),
  marital_status: z.string().nullable().optional(),
  woman_questionnaire_eligible: z.boolean().nullable().optional(),
  birth_registration_status: z.string().nullable().optional(),
  ever_attended_school: z.boolean().nullable().optional(),
  highest_grade_completed: z.string().nullable().optional(),
  member_status: z.string().nullable().optional(),
  usual_resident: z.boolean().nullable().optional(),
  member_source: z.string().nullable().optional(),
  sync_status: SyncStatusSchema,
  created_at: z.union([z.date(), z.string()]).optional(),
  updated_at: z.union([z.date(), z.string()]).optional(),
}) satisfies z.ZodType<HouseholdMember>;

// EligibleWoman schema
export const EligibleWomanSchema = z.object({
  woman_id: z.string(),
  household_member_id: z.string(),
  household_id: z.string(),
  site_id: z.number().int(),
  locality_code: z.string(),
  eligibility_start_date: z.union([z.date(), z.string()]).nullable().optional(),
  eligibility_source_event_id: z.string().nullable().optional(),
  wq_status: z.string().nullable().optional(),
  tracking_status: z.string().nullable().optional(),
  current_eligibility_status: z.string().nullable().optional(),
  eligibility_basis: z.string().nullable().optional(),
  woman_permanent_id: z.string().nullable().optional(),
  analysis_eligibility_flag: z.string().nullable().optional(),
  sync_status: SyncStatusSchema,
  created_at: z.union([z.date(), z.string()]).optional(),
  updated_at: z.union([z.date(), z.string()]).optional(),
}) satisfies z.ZodType<EligibleWoman>;

// FollowUpTask schema
export const FollowUpTaskSchema = z.object({
  task_id: z.string(),
  task_key: z.string(),
  site_id: z.number().int(),
  locality_code: z.string(),
  household_id: z.string(),
  subject_type: z
    .enum(["household", "person", "woman", "pregnancy", "child"])
    .nullable()
    .optional(),
  subject_id: z.string().nullable().optional(),
  woman_id: z.string().nullable().optional(),
  pregnancy_id: z.string().nullable().optional(),
  child_id: z.string().nullable().optional(),
  task_type: z
    .enum(["HHQ", "WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "VA"])
    .nullable()
    .optional(),
  form_code: z
    .enum(["HHQ", "WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "VA"])
    .nullable()
    .optional(),
  expected_forms: z.array(z.string()).nullable().optional(),
  series_id: z.string().nullable().optional(),
  sequence_number: z.number().int().nullable().optional(),
  protocol_visit_label: z.string().nullable().optional(),
  generation_source: z
    .enum(["scheduled", "event_triggered", "unscheduled_opportunity"])
    .nullable()
    .optional(),
  source_event_id: z.string().nullable().optional(),
  anchor_event_id: z.string().nullable().optional(),
  anchor_date: z.union([z.date(), z.string()]).nullable().optional(),
  window_start: z.union([z.date(), z.string()]).nullable().optional(),
  target_date: z.union([z.date(), z.string()]).nullable().optional(),
  deadline_date: z.union([z.date(), z.string()]).nullable().optional(),
  status: z
    .enum([
      "planned",
      "due",
      "urgent",
      "overdue",
      "in_progress",
      "completed_on_time",
      "completed_late",
      "missed",
      "postponed",
      "not_reachable_closed",
      "cancelled",
      "superseded",
    ])
    .nullable()
    .optional(),
  priority: z.string().nullable().optional(),
  default_expected_mode: z.enum(["face_to_face", "telephonic"]).nullable().optional(),
  allowed_modes: z.array(z.string()).nullable().optional(),
  mode_rule_strength: z.enum(["default", "required", "flexible"]).nullable().optional(),
  max_failed_attempts: z.number().int().nullable().optional(),
  failed_attempt_count: z.number().int().nullable().optional(),
  requires_final_close_reason: z.boolean().nullable().optional(),
  task_context_json: z.record(z.unknown()).nullable().optional(),
  context_builder_version: z.string().nullable().optional(),
  prefill_mapper_version: z.string().nullable().optional(),
  rules_version: z.string().nullable().optional(),
  form_availability: z.string().nullable().optional(),
  action_state: z.string().nullable().optional(),
  disabled_reason: z.string().nullable().optional(),
  completed_visit_id: z.string().nullable().optional(),
  completed_at: z.union([z.date(), z.string()]).nullable().optional(),
  closed_at: z.union([z.date(), z.string()]).nullable().optional(),
  closed_reason: z.string().nullable().optional(),
  superseded_by_event_id: z.string().nullable().optional(),
  created_at: z.union([z.date(), z.string()]).optional(),
  updated_at: z.union([z.date(), z.string()]).optional(),
}) satisfies z.ZodType<FollowUpTask>;

// FormResponse schema
export const FormResponseSchema = z.object({
  form_response_id: z.string(),
  response_id: z.string().nullable().optional(),
  site_id: z.number().int(),
  locality_code: z.string(),
  household_id: z.string(),
  visit_id: z.string().nullable().optional(),
  task_id: z.string().nullable().optional(),
  series_id: z.string().nullable().optional(),
  sequence_number: z.number().int().nullable().optional(),
  form_code: z
    .enum(["HHQ", "WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "VA"])
    .nullable()
    .optional(),
  form_version: z.string().nullable().optional(),
  subject_type: z
    .enum(["household", "person", "woman", "pregnancy", "child"])
    .nullable()
    .optional(),
  subject_id: z.string().nullable().optional(),
  lineage_ids_json: z.record(z.unknown()).nullable().optional(),
  prefill_snapshot_json: z.record(z.unknown()).nullable().optional(),
  prefill_mapper_version: z.string().nullable().optional(),
  answers_json: z.record(z.unknown()).nullable().optional(),
  created_offline_at: z.union([z.date(), z.string()]).nullable().optional(),
  updated_offline_at: z.union([z.date(), z.string()]).nullable().optional(),
  device_id: z.string().nullable().optional(),
  synced_at: z.union([z.date(), z.string()]).nullable().optional(),
  response_status: z.string().nullable().optional(),
  created_at: z.union([z.date(), z.string()]).optional(),
}) satisfies z.ZodType<FormResponse>;

// Export inferred types
export type HouseholdInput = z.infer<typeof HouseholdSchema>;
export type HouseholdMemberInput = z.infer<typeof HouseholdMemberSchema>;
export type EligibleWomanInput = z.infer<typeof EligibleWomanSchema>;
export type FollowUpTaskInput = z.infer<typeof FollowUpTaskSchema>;
export type FormResponseInput = z.infer<typeof FormResponseSchema>;
