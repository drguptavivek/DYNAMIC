import type { DomainEventEnvelope } from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import { buildTaskKey, getAttemptDisposition, getConfig, getFormAvailability, getModeRule, type ProtocolConfig, type TaskDescriptor } from "./workflowHelpers";
import { addDays, parseISODate, toISODate } from "@dynamic/shared-workflow";

export const EVENT_TYPE = "eligible_woman_identified";

export interface EligibleWomanIdentifiedPayload {
  household_id: string;
  woman_id: string;
  eligibility_start_date: string;
}

export interface EligibleWomanIdentifiedEventInput extends BaseEventInput {
  woman_id: string;
  eligibility_start_date: string;
}

export function buildEvent(input: EligibleWomanIdentifiedEventInput): DomainEventEnvelope<EligibleWomanIdentifiedPayload> {
  return {
    event_id: input.event_id,
    event_type: EVENT_TYPE,
    event_version: 1,
    aggregate_type: "woman",
    aggregate_id: input.woman_id,
    site_id: input.site_id,
    locality_code: input.locality_code,
    household_id: input.household_id,
    subject_type: "woman",
    subject_id: input.woman_id,
    task_id: input.task_id,
    task_key: input.task_key,
    form_response_id: input.form_response_id,
    source_response_id: input.form_response_id,
    source_task_id: input.task_id,
    event_date: input.event_date ?? input.eligibility_start_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      household_id: input.household_id,
      woman_id: input.woman_id,
      eligibility_start_date: input.eligibility_start_date,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: { event: DomainEventEnvelope<EligibleWomanIdentifiedPayload>; config?: ProtocolConfig }): TaskDescriptor[] {
  if (input.event.apply_status !== "applied") return [];
  const config = getConfig(input.config);
  const payload = input.event.payload;
  const scheduleRule = config.task_schedule_rules.find((rule) => rule.task_type === "WQ");
  const modeRule = getModeRule(config, "WQ");
  const disposition = getAttemptDisposition(config, "WQ");
  const availability = getFormAvailability(config, "WQ");
  const target = parseISODate(payload.eligibility_start_date);

  return [{
    task_key: buildTaskKey(payload.household_id, "person", payload.woman_id, "WQ", "baseline", payload.eligibility_start_date, config.rules_version),
    household_id: payload.household_id,
    subject_type: "person",
    subject_id: payload.woman_id,
    woman_id: payload.woman_id,
    task_type: "WQ",
    form_code: "WQ",
    protocol_visit_label: "baseline",
    generation_source: "event_triggered",
    source_event_id: input.event.event_id,
    anchor_date: payload.eligibility_start_date,
    window_start: toISODate(addDays(target, -(scheduleRule?.window_days_before || 0))),
    target_date: payload.eligibility_start_date,
    deadline_date: toISODate(addDays(target, scheduleRule?.window_days_after || 30)),
    default_expected_mode: modeRule.default_mode,
    allowed_modes: modeRule.allowed_modes,
    mode_rule_strength: modeRule.strength,
    max_failed_attempts: disposition.max_failed_attempts,
    requires_final_close_reason: disposition.requires_final_close_reason,
    rules_version: config.rules_version,
    form_availability: availability.availability,
    action_state: availability.availability === "available" ? "enabled" : "disabled",
    disabled_reason: availability.disabled_reason,
  }];
}

export function promoteEvidence(input: EligibleWomanIdentifiedEventInput & { config?: ProtocolConfig }): EventPromotionResult<EligibleWomanIdentifiedPayload> {
  const event = buildEvent(input);
  return { event, projection: reduceEvent(), task_descriptors: planWorkflow({ event, config: input.config }), data_quality_flags: [] };
}
