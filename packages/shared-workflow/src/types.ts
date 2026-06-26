export interface TaskDescriptor {
  task_key: string;
  household_id: string;
  subject_type: string;
  subject_id: string;
  woman_id?: string;
  pregnancy_id?: string;
  child_id?: string;
  task_type: string;
  form_code: string;
  protocol_visit_label: string;
  generation_source: "scheduled" | "event_triggered";
  source_event_id: string;
  anchor_date: string;
  window_start: string;
  target_date: string;
  deadline_date: string;
  default_expected_mode: string;
  allowed_modes: string[];
  mode_rule_strength: string;
  max_failed_attempts: number;
  requires_final_close_reason: boolean;
  rules_version: string;
  form_availability: string;
  action_state: string;
  disabled_reason?: string;
}
