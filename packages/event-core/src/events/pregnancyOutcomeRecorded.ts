import type {
  DomainEventEnvelope,
  PregnancyOutcomeRecordedPayload,
} from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import {
  buildTaskKey,
  getAttemptDisposition,
  getConfig,
  getFormAvailability,
  getModeRule,
  noWorkflowForHeldEvent,
  type ProtocolConfig,
  type TaskDescriptor,
} from "./workflowHelpers";

export const EVENT_TYPE = "pregnancy_outcome_recorded";

export interface PregnancyOutcomeRecordedEventInput extends BaseEventInput {
  pregnancy_id: string;
  woman_id: string;
  outcome_date: string;
  outcome_type: string;
  live_birth_count: number;
  stillbirth_count: number;
}

export function buildEvent(
  input: PregnancyOutcomeRecordedEventInput,
): DomainEventEnvelope<PregnancyOutcomeRecordedPayload> {
  return {
    event_id: input.event_id,
    event_type: EVENT_TYPE,
    event_version: 1,
    aggregate_type: "pregnancy",
    aggregate_id: input.pregnancy_id,
    site_id: input.site_id,
    locality_code: input.locality_code,
    household_id: input.household_id,
    subject_type: "pregnancy",
    subject_id: input.pregnancy_id,
    task_id: input.task_id,
    task_key: input.task_key,
    form_response_id: input.form_response_id,
    source_response_id: input.form_response_id,
    source_task_id: input.task_id,
    event_date: input.event_date ?? input.outcome_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      pregnancy_id: input.pregnancy_id,
      woman_id: input.woman_id,
      household_id: input.household_id,
      outcome_date: input.outcome_date,
      outcome_type: input.outcome_type,
      live_birth_count: input.live_birth_count,
      stillbirth_count: input.stillbirth_count,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: {
  event: DomainEventEnvelope<PregnancyOutcomeRecordedPayload>;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  if (noWorkflowForHeldEvent(input.event)) return [];
  const config = getConfig(input.config);
  const payload = input.event.payload;
  const tasks: TaskDescriptor[] = [];
  const bafModeRule = getModeRule(config, "BAF");
  const bafDisposition = getAttemptDisposition(config, "BAF");
  const bafAvailability = getFormAvailability(config, "BAF");

  for (let index = 0; index < payload.live_birth_count; index += 1) {
    const deadlineDate = new Date(
      new Date(payload.outcome_date + "T00:00:00Z").getTime() + 7 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    tasks.push({
      task_key: buildTaskKey(
        payload.household_id,
        "pregnancy",
        payload.pregnancy_id,
        "BAF",
        `BAF-birth-${index + 1}`,
        payload.outcome_date,
        config.rules_version,
      ),
      household_id: payload.household_id,
      subject_type: "pregnancy",
      subject_id: payload.pregnancy_id,
      woman_id: payload.woman_id,
      pregnancy_id: payload.pregnancy_id,
      task_type: "BAF",
      form_code: "BAF",
      protocol_visit_label: `BAF-birth-${index + 1}`,
      generation_source: "event_triggered",
      source_event_id: input.event.event_id,
      anchor_date: payload.outcome_date,
      window_start: payload.outcome_date,
      target_date: payload.outcome_date,
      deadline_date: deadlineDate,
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

export function promoteEvidence(
  input: PregnancyOutcomeRecordedEventInput & { config?: ProtocolConfig },
): EventPromotionResult<PregnancyOutcomeRecordedPayload> {
  const event = buildEvent(input);
  return {
    event,
    projection: reduceEvent(),
    task_descriptors: planWorkflow({ event, config: input.config }),
    data_quality_flags: [],
  };
}
