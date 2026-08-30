import { generateHrfSchedule, generatePsfSchedule, type ProtocolConfig, type TaskDescriptor } from "@dynamic/shared-workflow";
import {
  addDaysIso,
  buildTaskKey,
  getAttemptDisposition,
  getConfig,
  getFormAvailability,
  getModeRule,
} from "./shared";

export interface HouseholdBaselineTaskGenerationInput {
  household_id: string;
  baseline_date: string;
  source_event_id: string;
  config?: ProtocolConfig;
}

export function generateHouseholdBaselineTaskDescriptors(
  input: HouseholdBaselineTaskGenerationInput,
): TaskDescriptor[] {
  const config = getConfig(input.config);
  const modeRule = getModeRule(config, "HRF");
  const disposition = getAttemptDisposition(config, "HRF");
  const availability = getFormAvailability(config, "HRF");

  return generateHrfSchedule({
    baseline_completed_date: input.baseline_date,
    study_end_date: config.study_end_date,
    rules_version: config.rules_version,
  }).map((schedule) => ({
    task_key: buildTaskKey(
      input.household_id,
      "household",
      input.household_id,
      "HRF",
      schedule.label,
      schedule.target_date,
      config.rules_version,
    ),
    household_id: input.household_id,
    subject_type: "household",
    subject_id: input.household_id,
    task_type: "HRF",
    form_code: "HRF",
    protocol_visit_label: schedule.label,
    generation_source: "scheduled",
    source_event_id: input.source_event_id,
    anchor_date: input.baseline_date,
    window_start: schedule.window_start,
    target_date: schedule.target_date,
    deadline_date: schedule.deadline,
    default_expected_mode: modeRule.default_mode,
    allowed_modes: modeRule.allowed_modes,
    mode_rule_strength: modeRule.strength,
    max_failed_attempts: disposition.max_failed_attempts,
    requires_final_close_reason: disposition.requires_final_close_reason,
    rules_version: config.rules_version,
    form_availability: availability.availability,
    action_state: "pending",
    disabled_reason: availability.disabled_reason,
  }));
}

export interface EligibleWomanWqTaskGenerationInput {
  household_id: string;
  woman_id: string;
  eligibility_start_date: string;
  source_event_id: string;
  config?: ProtocolConfig;
}

export function generateEligibleWomanWqTaskDescriptors(
  input: EligibleWomanWqTaskGenerationInput,
): TaskDescriptor[] {
  const config = getConfig(input.config);
  const scheduleRule = config.task_schedule_rules.find((rule) => rule.task_type === "WQ");
  const modeRule = getModeRule(config, "WQ");
  const disposition = getAttemptDisposition(config, "WQ");
  const availability = getFormAvailability(config, "WQ");
  const windowDaysBefore = scheduleRule?.window_days_before ?? 0;
  const windowDaysAfter = scheduleRule?.window_days_after ?? 30;

  return [
    {
      task_key: buildTaskKey(
        input.household_id,
        "person",
        input.woman_id,
        "WQ",
        "baseline",
        input.eligibility_start_date,
        config.rules_version,
      ),
      household_id: input.household_id,
      subject_type: "person",
      subject_id: input.woman_id,
      woman_id: input.woman_id,
      task_type: "WQ",
      form_code: "WQ",
      protocol_visit_label: "baseline",
      generation_source: "event_triggered",
      source_event_id: input.source_event_id,
      anchor_date: input.eligibility_start_date,
      window_start: addDaysIso(input.eligibility_start_date, -windowDaysBefore),
      target_date: input.eligibility_start_date,
      deadline_date: addDaysIso(input.eligibility_start_date, windowDaysAfter),
      default_expected_mode: modeRule.default_mode,
      allowed_modes: modeRule.allowed_modes,
      mode_rule_strength: modeRule.strength,
      max_failed_attempts: disposition.max_failed_attempts,
      requires_final_close_reason: disposition.requires_final_close_reason,
      rules_version: config.rules_version,
      form_availability: availability.availability,
      action_state: availability.availability === "available" ? "enabled" : "disabled",
      disabled_reason: availability.disabled_reason,
    },
  ];
}

export function generatePregnancySurveillanceTaskDescriptors(input: { household_id: string; woman_id: string; eligibility_date: string; source_event_id: string; config?: ProtocolConfig }): TaskDescriptor[] {
  const config = getConfig(input.config);
  const modeRule = getModeRule(config, "PSF");
  const disposition = getAttemptDisposition(config, "PSF");
  const availability = getFormAvailability(config, "PSF");
  return generatePsfSchedule({ eligibility_date: input.eligibility_date, study_end_date: config.study_end_date, rules_version: config.rules_version }).map((schedule) => ({
    task_key: buildTaskKey(input.household_id, "woman", input.woman_id, "PSF", schedule.label, schedule.target_date, config.rules_version), household_id: input.household_id, subject_type: "woman", subject_id: input.woman_id, woman_id: input.woman_id, task_type: "PSF", form_code: "PSF", protocol_visit_label: schedule.label, generation_source: "scheduled", source_event_id: input.source_event_id, anchor_date: input.eligibility_date, window_start: schedule.window_start, target_date: schedule.target_date, deadline_date: schedule.deadline, default_expected_mode: modeRule.default_mode, allowed_modes: modeRule.allowed_modes, mode_rule_strength: modeRule.strength, max_failed_attempts: disposition.max_failed_attempts, requires_final_close_reason: disposition.requires_final_close_reason, rules_version: config.rules_version, form_availability: availability.availability, action_state: availability.availability === "available" ? "enabled" : "disabled", disabled_reason: availability.disabled_reason,
  }));
}
