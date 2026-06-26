import type {
  BirthAssessmentCompletedPayload,
  DomainEventEnvelope,
} from "../types";
import type { BaseEventInput, EventPromotionResult } from "./types";
import {
  buildTaskKey,
  generateNffSchedule,
  generateVaTask,
  getAttemptDisposition,
  getConfig,
  getFormAvailability,
  getModeRule,
  noWorkflowForHeldEvent,
  type ProtocolConfig,
  type TaskDescriptor,
} from "./workflowHelpers";

export const EVENT_TYPE = "birth_assessment_completed";

export interface BirthAssessmentCompletedEventInput extends BaseEventInput {
  pregnancy_id: string;
  woman_id: string;
  child_id: string;
  birth_date: string;
  birth_status: "live_birth" | "stillbirth" | "fetal_loss_20plus";
  current_vital_status: "alive" | "deceased";
  death_date?: string | null;
}

export function buildEvent(
  input: BirthAssessmentCompletedEventInput,
): DomainEventEnvelope<BirthAssessmentCompletedPayload> {
  return {
    event_id: input.event_id,
    event_type: EVENT_TYPE,
    event_version: 1,
    aggregate_type: "child",
    aggregate_id: input.child_id,
    site_id: input.site_id,
    locality_code: input.locality_code,
    household_id: input.household_id,
    subject_type: "child",
    subject_id: input.child_id,
    task_id: input.task_id,
    task_key: input.task_key,
    form_response_id: input.form_response_id,
    source_response_id: input.form_response_id,
    source_task_id: input.task_id,
    event_date: input.event_date ?? input.birth_date,
    recorded_at: input.recorded_at,
    created_offline_at: input.recorded_at,
    device_id: input.device_id,
    user_id: input.user_id,
    rules_version: input.rules_version ?? "v1",
    payload: {
      pregnancy_id: input.pregnancy_id,
      woman_id: input.woman_id,
      child_id: input.child_id,
      household_id: input.household_id,
      birth_date: input.birth_date,
      birth_status: input.birth_status,
      current_vital_status: input.current_vital_status,
      death_date: input.death_date,
    },
    apply_status: input.apply_status ?? "applied",
  };
}

export function reduceEvent(): null {
  return null;
}

export function planWorkflow(input: {
  event: DomainEventEnvelope<BirthAssessmentCompletedPayload>;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  if (noWorkflowForHeldEvent(input.event)) return [];
  const config = getConfig(input.config);
  const payload = input.event.payload;
  const tasks: TaskDescriptor[] = [];

  if (payload.birth_status === "live_birth" && payload.current_vital_status === "alive") {
    const nffModeRule = getModeRule(config, "NFF");
    const nffDisposition = getAttemptDisposition(config, "NFF");
    const nffAvailability = getFormAvailability(config, "NFF");

    generateNffSchedule({
      birth_date: payload.birth_date,
      study_end_date: config.study_end_date,
      rules_version: config.rules_version,
    }).forEach((schedule) => {
      tasks.push({
        task_key: buildTaskKey(
          payload.household_id,
          "child",
          payload.child_id,
          "NFF",
          schedule.label,
          schedule.target_date,
          config.rules_version,
        ),
        household_id: payload.household_id,
        subject_type: "child",
        subject_id: payload.child_id,
        woman_id: payload.woman_id,
        child_id: payload.child_id,
        task_type: "NFF",
        form_code: "NFF",
        protocol_visit_label: schedule.label,
        generation_source: "scheduled",
        source_event_id: input.event.event_id,
        anchor_date: payload.birth_date,
        window_start: schedule.window_start,
        target_date: schedule.target_date,
        deadline_date: schedule.deadline,
        default_expected_mode: nffModeRule.default_mode,
        allowed_modes: nffModeRule.allowed_modes,
        mode_rule_strength: nffModeRule.strength,
        max_failed_attempts: nffDisposition.max_failed_attempts,
        requires_final_close_reason: nffDisposition.requires_final_close_reason,
        rules_version: config.rules_version,
        form_availability: nffAvailability.availability,
        action_state: "pending",
        disabled_reason: nffAvailability.disabled_reason,
      });
    });
  }

  if (payload.birth_status === "stillbirth" || payload.birth_status === "fetal_loss_20plus") {
    const sbfModeRule = getModeRule(config, "SBF");
    const sbfDisposition = getAttemptDisposition(config, "SBF");
    const sbfAvailability = getFormAvailability(config, "SBF");
    const deadlineDate = new Date(
      new Date(payload.birth_date + "T00:00:00Z").getTime() + 7 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    tasks.push({
      task_key: buildTaskKey(
        payload.household_id,
        "child",
        payload.child_id,
        "SBF",
        "SBF-stillbirth",
        payload.birth_date,
        config.rules_version,
      ),
      household_id: payload.household_id,
      subject_type: "child",
      subject_id: payload.child_id,
      woman_id: payload.woman_id,
      child_id: payload.child_id,
      task_type: "SBF",
      form_code: "SBF",
      protocol_visit_label: "SBF-stillbirth",
      generation_source: "event_triggered",
      source_event_id: input.event.event_id,
      anchor_date: payload.birth_date,
      window_start: payload.birth_date,
      target_date: payload.birth_date,
      deadline_date: deadlineDate,
      default_expected_mode: sbfModeRule.default_mode,
      allowed_modes: sbfModeRule.allowed_modes,
      mode_rule_strength: sbfModeRule.strength,
      max_failed_attempts: sbfDisposition.max_failed_attempts,
      requires_final_close_reason: sbfDisposition.requires_final_close_reason,
      rules_version: config.rules_version,
      form_availability: sbfAvailability.availability,
      action_state: "pending",
      disabled_reason: sbfAvailability.disabled_reason,
    });

    tasks.push(buildVaTask(input.event.event_id, payload, "stillbirth", payload.birth_date, config));
  }

  if (payload.current_vital_status === "deceased" && payload.death_date) {
    const cdfModeRule = getModeRule(config, "CDF");
    const cdfDisposition = getAttemptDisposition(config, "CDF");
    const cdfAvailability = getFormAvailability(config, "CDF");
    const cdfDeadlineDate = new Date(
      new Date(payload.death_date + "T00:00:00Z").getTime() + 7 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    tasks.push({
      task_key: buildTaskKey(
        payload.household_id,
        "child",
        payload.child_id,
        "CDF",
        "CDF-child-death",
        payload.death_date,
        config.rules_version,
      ),
      household_id: payload.household_id,
      subject_type: "child",
      subject_id: payload.child_id,
      woman_id: payload.woman_id,
      child_id: payload.child_id,
      task_type: "CDF",
      form_code: "CDF",
      protocol_visit_label: "CDF-child-death",
      generation_source: "event_triggered",
      source_event_id: input.event.event_id,
      anchor_date: payload.death_date,
      window_start: payload.death_date,
      target_date: payload.death_date,
      deadline_date: cdfDeadlineDate,
      default_expected_mode: cdfModeRule.default_mode,
      allowed_modes: cdfModeRule.allowed_modes,
      mode_rule_strength: cdfModeRule.strength,
      max_failed_attempts: cdfDisposition.max_failed_attempts,
      requires_final_close_reason: cdfDisposition.requires_final_close_reason,
      rules_version: config.rules_version,
      form_availability: cdfAvailability.availability,
      action_state: "pending",
      disabled_reason: cdfAvailability.disabled_reason,
    });

    tasks.push(buildVaTask(input.event.event_id, payload, "child_death", payload.death_date, config));
  }

  return tasks;
}

function buildVaTask(
  eventId: string,
  payload: BirthAssessmentCompletedPayload,
  eventType: "stillbirth" | "child_death",
  eventDate: string,
  config: ProtocolConfig,
): TaskDescriptor {
  const vaTask = generateVaTask({
    event_date: eventDate,
    event_type: eventType,
    rules_version: config.rules_version,
  });
  const vaModeRule = getModeRule(config, "VA");
  const vaDisposition = getAttemptDisposition(config, "VA");
  const label = eventType === "stillbirth" ? "VA-stillbirth" : "VA-child-death";

  return {
    task_key: buildTaskKey(
      payload.household_id,
      "child",
      payload.child_id,
      "VA",
      label,
      vaTask.target_date,
      config.rules_version,
    ),
    household_id: payload.household_id,
    subject_type: "child",
    subject_id: payload.child_id,
    woman_id: payload.woman_id,
    child_id: payload.child_id,
    task_type: "VA",
    form_code: "VA",
    protocol_visit_label: label,
    generation_source: "event_triggered",
    source_event_id: eventId,
    anchor_date: eventDate,
    window_start: vaTask.window_start,
    target_date: vaTask.target_date,
    deadline_date: vaTask.deadline,
    default_expected_mode: vaModeRule.default_mode,
    allowed_modes: vaModeRule.allowed_modes,
    mode_rule_strength: vaModeRule.strength,
    max_failed_attempts: vaDisposition.max_failed_attempts,
    requires_final_close_reason: vaDisposition.requires_final_close_reason,
    rules_version: config.rules_version,
    form_availability: vaTask.form_availability,
    action_state: "pending",
    disabled_reason: vaTask.disabled_reason,
  };
}

export function promoteEvidence(
  input: BirthAssessmentCompletedEventInput & { config?: ProtocolConfig },
): EventPromotionResult<BirthAssessmentCompletedPayload> {
  const event = buildEvent(input);
  return {
    event,
    projection: reduceEvent(),
    task_descriptors: planWorkflow({ event, config: input.config }),
    data_quality_flags: [],
  };
}
