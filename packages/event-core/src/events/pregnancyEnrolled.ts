import { reducePregnancyProjectionEvents } from "../pregnancy-projection";
import type {
  DomainEventEnvelope,
  PregnancyEnrolledPayload,
  PregnancyProjection,
} from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import {
  buildTaskKey,
  generatePffSchedule,
  getAttemptDisposition,
  getConfig,
  getFormAvailability,
  getModeRule,
  noWorkflowForHeldEvent,
  type ProtocolConfig,
  type TaskDescriptor,
} from "./workflowHelpers";

export const EVENT_TYPE = "pregnancy_enrolled";

export interface PregnancyEnrolledEventInput extends BaseEventInput {
  pregnancy_id: string;
  woman_id: string;
  household_member_id: string;
  enrollment_date: string;
  usg_available: boolean;
}

export function buildEvent(
  input: PregnancyEnrolledEventInput,
): DomainEventEnvelope<PregnancyEnrolledPayload> {
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
    event_date: input.event_date ?? input.enrollment_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      pregnancy_id: input.pregnancy_id,
      woman_id: input.woman_id,
      household_member_id: input.household_member_id,
      household_id: input.household_id,
      enrollment_date: input.enrollment_date,
      pregnancy_status: "enrolled",
      usg_available: input.usg_available,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(input: {
  event: DomainEventEnvelope<PregnancyEnrolledPayload>;
  current?: PregnancyProjection | null;
}): PregnancyProjection | null {
  return reducePregnancyProjectionEvents(
    [input.event as unknown as DomainEventEnvelope],
    input.current ?? null,
  );
}

export function planWorkflow(input: {
  event: DomainEventEnvelope<PregnancyEnrolledPayload>;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  if (noWorkflowForHeldEvent(input.event)) return [];
  const config = getConfig(input.config);
  const payload = input.event.payload;
  const tasks: TaskDescriptor[] = [];
  const pffModeRule = getModeRule(config, "PFF");
  const pffDisposition = getAttemptDisposition(config, "PFF");
  const pffAvailability = getFormAvailability(config, "PFF");

  generatePffSchedule({
    enrollment_date: payload.enrollment_date,
    study_end_date: config.study_end_date,
    rules_version: config.rules_version,
  }).forEach((schedule) => {
    tasks.push({
      task_key: buildTaskKey(
        payload.household_id,
        "pregnancy",
        payload.pregnancy_id,
        "PFF",
        schedule.label,
        schedule.target_date,
        config.rules_version,
      ),
      household_id: payload.household_id,
      subject_type: "pregnancy",
      subject_id: payload.pregnancy_id,
      woman_id: payload.woman_id,
      pregnancy_id: payload.pregnancy_id,
      task_type: "PFF",
      form_code: "PFF",
      protocol_visit_label: schedule.label,
      generation_source: "scheduled",
      source_event_id: input.event.event_id,
      anchor_date: payload.enrollment_date,
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

  if (payload.usg_available) {
    const ufModeRule = getModeRule(config, "UF");
    const ufDisposition = getAttemptDisposition(config, "UF");
    const ufAvailability = getFormAvailability(config, "UF");
    const deadlineDate = new Date(
      new Date(payload.enrollment_date + "T00:00:00Z").getTime() + 14 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    tasks.push({
      task_key: buildTaskKey(
        payload.household_id,
        "pregnancy",
        payload.pregnancy_id,
        "UF",
        "UF-pregnancy-enrolled",
        payload.enrollment_date,
        config.rules_version,
      ),
      household_id: payload.household_id,
      subject_type: "pregnancy",
      subject_id: payload.pregnancy_id,
      woman_id: payload.woman_id,
      pregnancy_id: payload.pregnancy_id,
      task_type: "UF",
      form_code: "UF",
      protocol_visit_label: "UF-pregnancy-enrolled",
      generation_source: "event_triggered",
      source_event_id: input.event.event_id,
      anchor_date: payload.enrollment_date,
      window_start: payload.enrollment_date,
      target_date: payload.enrollment_date,
      deadline_date: deadlineDate,
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

export function promoteEvidence(
  input: PregnancyEnrolledEventInput & { config?: ProtocolConfig },
): EventPromotionResult<PregnancyEnrolledPayload> {
  const event = buildEvent(input);
  return {
    event,
    projection: reduceEvent({ event }),
    task_descriptors: planWorkflow({ event, config: input.config }),
    data_quality_flags: [],
  };
}
