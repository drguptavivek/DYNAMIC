import { z } from "zod";

// Task schedule rule — controls windows, deadlines, mode
export const TaskScheduleRuleSchema = z.object({
  task_type: z.string(),
  window_days_before: z.number().int(),
  window_days_after: z.number().int(),
  default_mode: z.enum(["face_to_face", "telephonic", "flexible"]),
  allowed_modes: z.array(z.enum(["face_to_face", "telephonic"])),
  mode_rule_strength: z.enum(["default", "required", "flexible"]),
});
export type TaskScheduleRule = z.infer<typeof TaskScheduleRuleSchema>;

// Per-task-type attempt disposition rules
export const AttemptDispositionRuleSchema = z.object({
  task_type: z.string(),
  max_failed_attempts: z.number().int(),
  requires_final_close_reason: z.boolean(),
  close_reason_options: z.array(z.string()),
});
export type AttemptDispositionRule = z.infer<typeof AttemptDispositionRuleSchema>;

// Mode rule per form
export const ModeRuleSchema = z.object({
  form_code: z.string(),
  default_mode: z.enum(["face_to_face", "telephonic", "flexible"]),
  allowed_modes: z.array(z.enum(["face_to_face", "telephonic"])),
  strength: z.enum(["default", "required", "flexible"]),
  exception_reason_required: z.boolean(),
});
export type ModeRule = z.infer<typeof ModeRuleSchema>;

// Contextual action definition (Section E of implementation plan)
export const ContextualActionDefSchema = z.object({
  action_key: z.string(),
  label: z.string(),
  subject_type: z.enum(["household", "person", "woman", "pregnancy", "child"]),
  allowed_when: z.array(z.string()),
  creates_event: z.string().optional(),
  opens_form: z.string().optional(),
});
export type ContextualActionDef = z.infer<typeof ContextualActionDefSchema>;

// Form availability rule
export const FormAvailabilityRuleSchema = z.object({
  form_code: z.string(),
  availability: z.enum(["available", "disabled"]),
  disabled_reason: z.string().optional(),
});
export type FormAvailabilityRule = z.infer<typeof FormAvailabilityRuleSchema>;

// Full protocol config
export const ProtocolConfigSchema = z.object({
  rules_version: z.string(),
  study_end_date: z.string(),
  enrollment_start_date: z.string(),
  task_schedule_rules: z.array(TaskScheduleRuleSchema),
  attempt_disposition_rules: z.array(AttemptDispositionRuleSchema),
  mode_rules: z.array(ModeRuleSchema),
  form_availability: z.array(FormAvailabilityRuleSchema),
  contextual_actions: z.array(ContextualActionDefSchema),
});
export type ProtocolConfig = z.infer<typeof ProtocolConfigSchema>;

export const DEFAULT_PROTOCOL_CONFIG: ProtocolConfig = {
  rules_version: "v1",
  study_end_date: "2030-08-31",
  enrollment_start_date: "2026-09-01",
  task_schedule_rules: [
    {
      task_type: "HRF",
      window_days_before: 14,
      window_days_after: 14,
      default_mode: "telephonic",
      allowed_modes: ["telephonic", "face_to_face"],
      mode_rule_strength: "default",
    },
    {
      task_type: "WQ",
      window_days_before: 0,
      window_days_after: 30,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      mode_rule_strength: "required",
    },
    {
      task_type: "PEF",
      window_days_before: 0,
      window_days_after: 14,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      mode_rule_strength: "required",
    },
    {
      task_type: "UF",
      window_days_before: 0,
      window_days_after: 14,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      mode_rule_strength: "required",
    },
    {
      task_type: "PFF",
      window_days_before: 7,
      window_days_after: 14,
      default_mode: "telephonic",
      allowed_modes: ["telephonic", "face_to_face"],
      mode_rule_strength: "flexible",
    },
    {
      task_type: "POF",
      window_days_before: 0,
      window_days_after: 7,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face", "telephonic"],
      mode_rule_strength: "default",
    },
    {
      task_type: "BAF",
      window_days_before: 0,
      window_days_after: 7,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      mode_rule_strength: "required",
    },
    {
      task_type: "SBF",
      window_days_before: 0,
      window_days_after: 7,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      mode_rule_strength: "required",
    },
    {
      task_type: "NFF",
      window_days_before: 3,
      window_days_after: 7,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face", "telephonic"],
      mode_rule_strength: "default",
    },
    {
      task_type: "CDF",
      window_days_before: 0,
      window_days_after: 7,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      mode_rule_strength: "required",
    },
    {
      task_type: "VA",
      window_days_before: 3,
      window_days_after: 14,
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      mode_rule_strength: "required",
    },
  ],
  attempt_disposition_rules: [
    {
      task_type: "HRF",
      max_failed_attempts: 5,
      requires_final_close_reason: true,
      close_reason_options: ["not_reachable", "refused", "moved_out", "deceased"],
    },
    {
      task_type: "WQ",
      max_failed_attempts: 5,
      requires_final_close_reason: true,
      close_reason_options: ["not_reachable", "refused", "moved_out", "deceased", "not_applicable"],
    },
    {
      task_type: "PEF",
      max_failed_attempts: 5,
      requires_final_close_reason: true,
      close_reason_options: ["not_reachable", "refused", "pregnancy_lost", "moved_out"],
    },
    {
      task_type: "PFF",
      max_failed_attempts: 5,
      requires_final_close_reason: true,
      close_reason_options: [
        "not_reachable",
        "refused",
        "moved_out",
        "deceased",
        "pregnancy_ended",
      ],
    },
    {
      task_type: "NFF",
      max_failed_attempts: 5,
      requires_final_close_reason: true,
      close_reason_options: ["not_reachable", "refused", "moved_out", "child_deceased"],
    },
    {
      task_type: "VA",
      max_failed_attempts: 5,
      requires_final_close_reason: true,
      close_reason_options: ["not_reachable", "refused", "moved_out"],
    },
    {
      task_type: "UF",
      max_failed_attempts: 3,
      requires_final_close_reason: false,
      close_reason_options: [],
    },
    {
      task_type: "POF",
      max_failed_attempts: 3,
      requires_final_close_reason: false,
      close_reason_options: [],
    },
    {
      task_type: "BAF",
      max_failed_attempts: 3,
      requires_final_close_reason: false,
      close_reason_options: [],
    },
    {
      task_type: "SBF",
      max_failed_attempts: 3,
      requires_final_close_reason: false,
      close_reason_options: [],
    },
    {
      task_type: "CDF",
      max_failed_attempts: 3,
      requires_final_close_reason: false,
      close_reason_options: [],
    },
  ],
  mode_rules: [
    {
      form_code: "HHQ",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      strength: "required",
      exception_reason_required: false,
    },
    {
      form_code: "WQ",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      strength: "required",
      exception_reason_required: false,
    },
    {
      form_code: "PEF",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      strength: "required",
      exception_reason_required: false,
    },
    {
      form_code: "BAF",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      strength: "required",
      exception_reason_required: false,
    },
    {
      form_code: "SBF",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      strength: "required",
      exception_reason_required: false,
    },
    {
      form_code: "CDF",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      strength: "required",
      exception_reason_required: false,
    },
    {
      form_code: "VA",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      strength: "required",
      exception_reason_required: false,
    },
    {
      form_code: "UF",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face"],
      strength: "required",
      exception_reason_required: false,
    },
    {
      form_code: "HRF",
      default_mode: "telephonic",
      allowed_modes: ["telephonic", "face_to_face"],
      strength: "default",
      exception_reason_required: false,
    },
    {
      form_code: "PFF",
      default_mode: "flexible",
      allowed_modes: ["telephonic", "face_to_face"],
      strength: "flexible",
      exception_reason_required: false,
    },
    {
      form_code: "POF",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face", "telephonic"],
      strength: "default",
      exception_reason_required: true,
    },
    {
      form_code: "NFF",
      default_mode: "face_to_face",
      allowed_modes: ["face_to_face", "telephonic"],
      strength: "default",
      exception_reason_required: true,
    },
  ],
  form_availability: [
    { form_code: "HHQ", availability: "available" },
    { form_code: "WQ", availability: "available" },
    { form_code: "PEF", availability: "available" },
    { form_code: "BAF", availability: "available" },
    { form_code: "SBF", availability: "available" },
    { form_code: "CDF", availability: "available" },
    { form_code: "UF", availability: "available" },
    { form_code: "HRF", availability: "available" },
    { form_code: "PFF", availability: "available" },
    { form_code: "POF", availability: "available" },
    { form_code: "NFF", availability: "available" },
    { form_code: "VA", availability: "disabled", disabled_reason: "va_json_pending" },
  ],
  contextual_actions: [
    {
      action_key: "open_hhq",
      label: "Open HHQ",
      subject_type: "household",
      allowed_when: ["baseline_enrollment_status=pending"],
      opens_form: "HHQ",
    },
    {
      action_key: "open_wq",
      label: "Open WQ",
      subject_type: "person",
      allowed_when: ["woman_questionnaire_eligible=true", "wq_status=pending"],
      opens_form: "WQ",
    },
    {
      action_key: "open_pef",
      label: "Open PEF",
      subject_type: "woman",
      allowed_when: ["pregnancy_detected=true", "pef_not_yet_done"],
      opens_form: "PEF",
    },
    {
      action_key: "report_pregnancy",
      label: "Report Pregnancy",
      subject_type: "woman",
      allowed_when: ["tracking_status=tracked", "no_active_pregnancy"],
      creates_event: "pregnancy_detected",
    },
    {
      action_key: "record_delivery",
      label: "Record Delivery",
      subject_type: "pregnancy",
      allowed_when: ["pregnancy_status=active"],
      creates_event: "delivery_reported",
    },
  ],
};
