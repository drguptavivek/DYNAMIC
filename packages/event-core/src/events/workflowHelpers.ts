import {
  addDays,
  DEFAULT_PROTOCOL_CONFIG,
  generateHrfSchedule,
  generateNffSchedule,
  generatePffSchedule,
  generateVaTask,
  parseISODate,
  toISODate,
  type ProtocolConfig,
  type TaskDescriptor,
} from "@dynamic/shared-workflow";

export {
  DEFAULT_PROTOCOL_CONFIG,
  generateHrfSchedule,
  generateNffSchedule,
  generatePffSchedule,
  generateVaTask,
  type ProtocolConfig,
  type TaskDescriptor,
};

export function buildTaskKey(
  household_id: string,
  subject_type: string,
  subject_id: string,
  task_type: string,
  protocol_visit_label: string,
  target_date: string,
  rules_version: string,
): string {
  return `${household_id}|${subject_type}|${subject_id}|${task_type}|${protocol_visit_label}|${target_date}|${rules_version}`;
}

export function getConfig(config?: ProtocolConfig): ProtocolConfig {
  return config ?? DEFAULT_PROTOCOL_CONFIG;
}

export function getModeRule(
  config: ProtocolConfig,
  form_code: string,
): { default_mode: string; allowed_modes: string[]; strength: string } {
  const rule = config.mode_rules.find((r) => r.form_code === form_code);
  if (!rule) {
    return { default_mode: "face_to_face", allowed_modes: ["face_to_face"], strength: "required" };
  }
  return {
    default_mode: rule.default_mode,
    allowed_modes: rule.allowed_modes,
    strength: rule.strength,
  };
}

export function getAttemptDisposition(
  config: ProtocolConfig,
  task_type: string,
): { max_failed_attempts: number; requires_final_close_reason: boolean } {
  const rule = config.attempt_disposition_rules.find((r) => r.task_type === task_type);
  if (!rule) {
    return { max_failed_attempts: 3, requires_final_close_reason: false };
  }
  return {
    max_failed_attempts: rule.max_failed_attempts,
    requires_final_close_reason: rule.requires_final_close_reason,
  };
}

export function getFormAvailability(
  config: ProtocolConfig,
  form_code: string,
): { availability: string; disabled_reason?: string } {
  const rule = config.form_availability.find((r) => r.form_code === form_code);
  if (!rule) {
    return { availability: "available" };
  }
  return {
    availability: rule.availability,
    disabled_reason: rule.disabled_reason,
  };
}

export function addDaysIso(date: string, days: number): string {
  return toISODate(addDays(parseISODate(date), days));
}

export function noWorkflowForHeldEvent(event: { apply_status: string }): boolean {
  return event.apply_status !== "applied";
}
