import { generatePffSchedule, type ProtocolConfig, type TaskDescriptor } from "@dynamic/shared-workflow";
import {
  addDaysIso,
  buildTaskKey,
  getAttemptDisposition,
  getConfig,
  getFormAvailability,
  getModeRule,
} from "./shared";

export interface PregnancyEnrollmentTaskGenerationInput {
  household_id: string;
  pregnancy_id: string;
  woman_id: string;
  enrollment_date: string;
  usg_available: boolean;
  source_event_id: string;
  config?: ProtocolConfig;
}

export function generatePregnancyEnrollmentTaskDescriptors(
  input: PregnancyEnrollmentTaskGenerationInput,
): TaskDescriptor[] {
  const config = getConfig(input.config);
  const tasks: TaskDescriptor[] = [];
  const pffModeRule = getModeRule(config, "PFF");
  const pffDisposition = getAttemptDisposition(config, "PFF");
  const pffAvailability = getFormAvailability(config, "PFF");

  generatePffSchedule({
    enrollment_date: input.enrollment_date,
    study_end_date: config.study_end_date,
    rules_version: config.rules_version,
  }).forEach((schedule) => {
    tasks.push({
      task_key: buildTaskKey(
        input.household_id,
        "pregnancy",
        input.pregnancy_id,
        "PFF",
        schedule.label,
        schedule.target_date,
        config.rules_version,
      ),
      household_id: input.household_id,
      subject_type: "pregnancy",
      subject_id: input.pregnancy_id,
      woman_id: input.woman_id,
      pregnancy_id: input.pregnancy_id,
      task_type: "PFF",
      form_code: "PFF",
      protocol_visit_label: schedule.label,
      generation_source: "scheduled",
      source_event_id: input.source_event_id,
      anchor_date: input.enrollment_date,
      window_start: schedule.window_start,
      target_date: schedule.target_date,
      deadline_date: schedule.deadline,
      default_expected_mode: pffModeRule.default_mode,
      allowed_modes: pffModeRule.allowed_modes,
      mode_rule_strength: pffModeRule.strength,
      max_failed_attempts: pffDisposition.max_failed_attempts,
      requires_final_close_reason: pffDisposition.requires_final_close_reason,
      rules_version: config.rules_version,
      form_availability: pffAvailability.availability,
      action_state: "pending",
      disabled_reason: pffAvailability.disabled_reason,
    });
  });

  if (input.usg_available) {
    const ufModeRule = getModeRule(config, "UF");
    const ufDisposition = getAttemptDisposition(config, "UF");
    const ufAvailability = getFormAvailability(config, "UF");

    tasks.push({
      task_key: buildTaskKey(
        input.household_id,
        "pregnancy",
        input.pregnancy_id,
        "UF",
        "UF-pregnancy-enrolled",
        input.enrollment_date,
        config.rules_version,
      ),
      household_id: input.household_id,
      subject_type: "pregnancy",
      subject_id: input.pregnancy_id,
      woman_id: input.woman_id,
      pregnancy_id: input.pregnancy_id,
      task_type: "UF",
      form_code: "UF",
      protocol_visit_label: "UF-pregnancy-enrolled",
      generation_source: "event_triggered",
      source_event_id: input.source_event_id,
      anchor_date: input.enrollment_date,
      window_start: input.enrollment_date,
      target_date: input.enrollment_date,
      deadline_date: addDaysIso(input.enrollment_date, 14),
      default_expected_mode: ufModeRule.default_mode,
      allowed_modes: ufModeRule.allowed_modes,
      mode_rule_strength: ufModeRule.strength,
      max_failed_attempts: ufDisposition.max_failed_attempts,
      requires_final_close_reason: ufDisposition.requires_final_close_reason,
      rules_version: config.rules_version,
      form_availability: ufAvailability.availability,
      action_state: "pending",
      disabled_reason: ufAvailability.disabled_reason,
    });
  }

  return tasks;
}

export interface PregnancyOutcomeTaskGenerationInput {
  household_id: string;
  pregnancy_id: string;
  woman_id: string;
  outcome_date: string;
  live_birth_count: number;
  source_event_id: string;
  config?: ProtocolConfig;
}

export function generatePregnancyOutcomeTaskDescriptors(
  input: PregnancyOutcomeTaskGenerationInput,
): TaskDescriptor[] {
  const config = getConfig(input.config);
  const bafModeRule = getModeRule(config, "BAF");
  const bafDisposition = getAttemptDisposition(config, "BAF");
  const bafAvailability = getFormAvailability(config, "BAF");
  const tasks: TaskDescriptor[] = [];

  for (let index = 0; index < input.live_birth_count; index += 1) {
    const protocolVisitLabel = `BAF-birth-${index + 1}`;
    tasks.push({
      task_key: buildTaskKey(
        input.household_id,
        "pregnancy",
        input.pregnancy_id,
        "BAF",
        protocolVisitLabel,
        input.outcome_date,
        config.rules_version,
      ),
      household_id: input.household_id,
      subject_type: "pregnancy",
      subject_id: input.pregnancy_id,
      woman_id: input.woman_id,
      pregnancy_id: input.pregnancy_id,
      task_type: "BAF",
      form_code: "BAF",
      protocol_visit_label: protocolVisitLabel,
      generation_source: "event_triggered",
      source_event_id: input.source_event_id,
      anchor_date: input.outcome_date,
      window_start: input.outcome_date,
      target_date: input.outcome_date,
      deadline_date: addDaysIso(input.outcome_date, 7),
      default_expected_mode: bafModeRule.default_mode,
      allowed_modes: bafModeRule.allowed_modes,
      mode_rule_strength: bafModeRule.strength,
      max_failed_attempts: bafDisposition.max_failed_attempts,
      requires_final_close_reason: bafDisposition.requires_final_close_reason,
      rules_version: config.rules_version,
      form_availability: bafAvailability.availability,
      action_state: "pending",
      disabled_reason: bafAvailability.disabled_reason,
    });
  }

  return tasks;
}
