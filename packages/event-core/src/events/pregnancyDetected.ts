import type { DomainEventEnvelope } from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import { buildTaskKey, getAttemptDisposition, getConfig, getFormAvailability, getModeRule, type ProtocolConfig, type TaskDescriptor } from "./workflowHelpers";

export const EVENT_TYPE = "pregnancy_detected";

export interface PregnancyDetectedPayload {
  household_id: string;
  woman_id: string;
  detected_date: string;
}

export interface PregnancyDetectedEventInput extends BaseEventInput {
  woman_id: string;
  detected_date: string;
}

export function buildEvent(input: PregnancyDetectedEventInput): DomainEventEnvelope<PregnancyDetectedPayload> {
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
    event_date: input.event_date ?? input.detected_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      household_id: input.household_id,
      woman_id: input.woman_id,
      detected_date: input.detected_date,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: { event: DomainEventEnvelope<PregnancyDetectedPayload>; config?: ProtocolConfig }): TaskDescriptor[] {
  if (input.event.apply_status !== "applied") return [];
  const config = getConfig(input.config);
  const payload = input.event.payload;
  const modeRule = getModeRule(config, "PEF");
  const disposition = getAttemptDisposition(config, "PEF");
  const availability = getFormAvailability(config, "PEF");
  const deadlineDate = new Date(new Date(payload.detected_date + "T00:00:00Z").getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  return [{
    task_key: buildTaskKey(payload.household_id, "woman", payload.woman_id, "PEF", "PEF-pregnancy-detected", payload.detected_date, config.rules_version),
    household_id: payload.household_id,
    subject_type: "woman",
    subject_id: payload.woman_id,
    woman_id: payload.woman_id,
    task_type: "PEF",
    form_code: "PEF",
    protocol_visit_label: "PEF-pregnancy-detected",
    generation_source: "event_triggered",
    source_event_id: input.event.event_id,
    anchor_date: payload.detected_date,
    window_start: payload.detected_date,
    target_date: payload.detected_date,
    deadline_date: deadlineDate,
    default_expected_mode: modeRule.default_mode,
    allowed_modes: modeRule.allowed_modes,
    mode_rule_strength: modeRule.strength,
    max_failed_attempts: disposition.max_failed_attempts,
    requires_final_close_reason: disposition.requires_final_close_reason,
    rules_version: config.rules_version,
    form_availability: availability.availability,
    action_state: "pending",
    disabled_reason: availability.disabled_reason,
  }];
}

export function promoteEvidence(input: PregnancyDetectedEventInput & { config?: ProtocolConfig }): EventPromotionResult<PregnancyDetectedPayload> {
  const event = buildEvent(input);
  return { event, projection: reduceEvent(), task_descriptors: planWorkflow({ event, config: input.config }), data_quality_flags: [] };
}
