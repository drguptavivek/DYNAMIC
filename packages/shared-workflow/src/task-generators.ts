import {
  generateHrfSchedule,
  generatePffSchedule,
  generateNffSchedule,
  generateVaTask,
} from "./schedule-rules";
import { ProtocolConfig, DEFAULT_PROTOCOL_CONFIG } from "./protocol-config";

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

function buildTaskKey(
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

function getModeRule(
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

function getAttemptDisposition(
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

function getFormAvailability(
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

export function onHouseholdEnrolled(params: {
  event_id: string;
  household_id: string;
  baseline_completed_date: string;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  const config = params.config || DEFAULT_PROTOCOL_CONFIG;
  const schedules = generateHrfSchedule({
    baseline_completed_date: params.baseline_completed_date,
    study_end_date: config.study_end_date,
    rules_version: config.rules_version,
  });

  const modeRule = getModeRule(config, "HRF");
  const disposition = getAttemptDisposition(config, "HRF");
  const availability = getFormAvailability(config, "HRF");

  return schedules.map((schedule) => ({
    task_key: buildTaskKey(
      params.household_id,
      "household",
      params.household_id,
      "HRF",
      schedule.label,
      schedule.target_date,
      config.rules_version,
    ),
    household_id: params.household_id,
    subject_type: "household",
    subject_id: params.household_id,
    task_type: "HRF",
    form_code: "HRF",
    protocol_visit_label: schedule.label,
    generation_source: "scheduled",
    source_event_id: params.event_id,
    anchor_date: params.baseline_completed_date,
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

export function onWqCompleted(params: {
  event_id: string;
  household_id: string;
  woman_id: string;
  wq_pregnant: boolean;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  const config = params.config || DEFAULT_PROTOCOL_CONFIG;

  if (!params.wq_pregnant) {
    return [];
  }

  const modeRule = getModeRule(config, "PEF");
  const disposition = getAttemptDisposition(config, "PEF");
  const availability = getFormAvailability(config, "PEF");

  return [
    {
      task_key: buildTaskKey(
        params.household_id,
        "woman",
        params.woman_id,
        "PEF",
        "PEF-pregnancy-detected",
        new Date().toISOString().split("T")[0],
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "woman",
      subject_id: params.woman_id,
      woman_id: params.woman_id,
      task_type: "PEF",
      form_code: "PEF",
      protocol_visit_label: "PEF-pregnancy-detected",
      generation_source: "event_triggered",
      source_event_id: params.event_id,
      anchor_date: new Date().toISOString().split("T")[0],
      window_start: new Date().toISOString().split("T")[0],
      target_date: new Date().toISOString().split("T")[0],
      deadline_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      default_expected_mode: modeRule.default_mode,
      allowed_modes: modeRule.allowed_modes,
      mode_rule_strength: modeRule.strength,
      max_failed_attempts: disposition.max_failed_attempts,
      requires_final_close_reason: disposition.requires_final_close_reason,
      rules_version: config.rules_version,
      form_availability: availability.availability,
      action_state: "pending",
      disabled_reason: availability.disabled_reason,
    },
  ];
}

export function onPregnancyDetected(params: {
  event_id: string;
  household_id: string;
  woman_id: string;
  detected_date: string;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  const config = params.config || DEFAULT_PROTOCOL_CONFIG;

  const modeRule = getModeRule(config, "PEF");
  const disposition = getAttemptDisposition(config, "PEF");
  const availability = getFormAvailability(config, "PEF");

  return [
    {
      task_key: buildTaskKey(
        params.household_id,
        "woman",
        params.woman_id,
        "PEF",
        "PEF-pregnancy-detected",
        params.detected_date,
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "woman",
      subject_id: params.woman_id,
      woman_id: params.woman_id,
      task_type: "PEF",
      form_code: "PEF",
      protocol_visit_label: "PEF-pregnancy-detected",
      generation_source: "event_triggered",
      source_event_id: params.event_id,
      anchor_date: params.detected_date,
      window_start: params.detected_date,
      target_date: params.detected_date,
      deadline_date: new Date(
        new Date(params.detected_date + "T00:00:00Z").getTime() + 14 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0],
      default_expected_mode: modeRule.default_mode,
      allowed_modes: modeRule.allowed_modes,
      mode_rule_strength: modeRule.strength,
      max_failed_attempts: disposition.max_failed_attempts,
      requires_final_close_reason: disposition.requires_final_close_reason,
      rules_version: config.rules_version,
      form_availability: availability.availability,
      action_state: "pending",
      disabled_reason: availability.disabled_reason,
    },
  ];
}

export function onPregnancyEnrolled(params: {
  event_id: string;
  household_id: string;
  woman_id: string;
  pregnancy_id: string;
  enrollment_date: string;
  usg_available: boolean;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  const config = params.config || DEFAULT_PROTOCOL_CONFIG;
  const tasks: TaskDescriptor[] = [];

  // Generate PFF schedule
  const pffSchedules = generatePffSchedule({
    enrollment_date: params.enrollment_date,
    study_end_date: config.study_end_date,
    rules_version: config.rules_version,
  });

  const pffModeRule = getModeRule(config, "PFF");
  const pffDisposition = getAttemptDisposition(config, "PFF");
  const pffAvailability = getFormAvailability(config, "PFF");

  pffSchedules.forEach((schedule) => {
    tasks.push({
      task_key: buildTaskKey(
        params.household_id,
        "pregnancy",
        params.pregnancy_id,
        "PFF",
        schedule.label,
        schedule.target_date,
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "pregnancy",
      subject_id: params.pregnancy_id,
      woman_id: params.woman_id,
      pregnancy_id: params.pregnancy_id,
      task_type: "PFF",
      form_code: "PFF",
      protocol_visit_label: schedule.label,
      generation_source: "scheduled",
      source_event_id: params.event_id,
      anchor_date: params.enrollment_date,
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

  // Generate UF task if usg_available
  if (params.usg_available) {
    const ufModeRule = getModeRule(config, "UF");
    const ufDisposition = getAttemptDisposition(config, "UF");
    const ufAvailability = getFormAvailability(config, "UF");

    const deadlineDate = new Date(
      new Date(params.enrollment_date + "T00:00:00Z").getTime() + 14 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    tasks.push({
      task_key: buildTaskKey(
        params.household_id,
        "pregnancy",
        params.pregnancy_id,
        "UF",
        "UF-pregnancy-enrolled",
        params.enrollment_date,
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "pregnancy",
      subject_id: params.pregnancy_id,
      woman_id: params.woman_id,
      pregnancy_id: params.pregnancy_id,
      task_type: "UF",
      form_code: "UF",
      protocol_visit_label: "UF-pregnancy-enrolled",
      generation_source: "event_triggered",
      source_event_id: params.event_id,
      anchor_date: params.enrollment_date,
      window_start: params.enrollment_date,
      target_date: params.enrollment_date,
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

export function onPregnancyOutcomeRecorded(params: {
  event_id: string;
  household_id: string;
  woman_id: string;
  pregnancy_id: string;
  outcome_type: string;
  live_birth_count: number;
  stillbirth_count: number;
  outcome_date: string;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  const config = params.config || DEFAULT_PROTOCOL_CONFIG;
  const tasks: TaskDescriptor[] = [];

  // Generate BAF tasks for each live birth
  const bafModeRule = getModeRule(config, "BAF");
  const bafDisposition = getAttemptDisposition(config, "BAF");
  const bafAvailability = getFormAvailability(config, "BAF");

  for (let i = 0; i < params.live_birth_count; i++) {
    const deadlineDate = new Date(
      new Date(params.outcome_date + "T00:00:00Z").getTime() + 7 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    tasks.push({
      task_key: buildTaskKey(
        params.household_id,
        "pregnancy",
        params.pregnancy_id,
        "BAF",
        `BAF-birth-${i + 1}`,
        params.outcome_date,
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "pregnancy",
      subject_id: params.pregnancy_id,
      woman_id: params.woman_id,
      pregnancy_id: params.pregnancy_id,
      task_type: "BAF",
      form_code: "BAF",
      protocol_visit_label: `BAF-birth-${i + 1}`,
      generation_source: "event_triggered",
      source_event_id: params.event_id,
      anchor_date: params.outcome_date,
      window_start: params.outcome_date,
      target_date: params.outcome_date,
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

export function onBirthAssessmentCompleted(params: {
  event_id: string;
  household_id: string;
  pregnancy_id: string;
  woman_id: string;
  child_id: string;
  birth_date: string;
  birth_status: "live_birth" | "stillbirth" | "fetal_loss_20plus";
  current_vital_status: "alive" | "deceased";
  death_date?: string;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  const config = params.config || DEFAULT_PROTOCOL_CONFIG;
  const tasks: TaskDescriptor[] = [];

  // Generate NFF schedule for live births
  if (params.birth_status === "live_birth" && params.current_vital_status === "alive") {
    const nffSchedules = generateNffSchedule({
      birth_date: params.birth_date,
      study_end_date: config.study_end_date,
      rules_version: config.rules_version,
    });

    const nffModeRule = getModeRule(config, "NFF");
    const nffDisposition = getAttemptDisposition(config, "NFF");
    const nffAvailability = getFormAvailability(config, "NFF");

    nffSchedules.forEach((schedule) => {
      tasks.push({
        task_key: buildTaskKey(
          params.household_id,
          "child",
          params.child_id,
          "NFF",
          schedule.label,
          schedule.target_date,
          config.rules_version,
        ),
        household_id: params.household_id,
        subject_type: "child",
        subject_id: params.child_id,
        woman_id: params.woman_id,
        child_id: params.child_id,
        task_type: "NFF",
        form_code: "NFF",
        protocol_visit_label: schedule.label,
        generation_source: "scheduled",
        source_event_id: params.event_id,
        anchor_date: params.birth_date,
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

  // Generate SBF for stillbirths
  if (params.birth_status === "stillbirth" || params.birth_status === "fetal_loss_20plus") {
    const sbfModeRule = getModeRule(config, "SBF");
    const sbfDisposition = getAttemptDisposition(config, "SBF");
    const sbfAvailability = getFormAvailability(config, "SBF");

    const deadlineDate = new Date(
      new Date(params.birth_date + "T00:00:00Z").getTime() + 7 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    tasks.push({
      task_key: buildTaskKey(
        params.household_id,
        "child",
        params.child_id,
        "SBF",
        "SBF-stillbirth",
        params.birth_date,
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "child",
      subject_id: params.child_id,
      woman_id: params.woman_id,
      child_id: params.child_id,
      task_type: "SBF",
      form_code: "SBF",
      protocol_visit_label: "SBF-stillbirth",
      generation_source: "event_triggered",
      source_event_id: params.event_id,
      anchor_date: params.birth_date,
      window_start: params.birth_date,
      target_date: params.birth_date,
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

    // Generate VA task for stillbirth
    const vaTask = generateVaTask({
      event_date: params.birth_date,
      event_type: "stillbirth",
      rules_version: config.rules_version,
    });

    const vaModeRule = getModeRule(config, "VA");
    const vaDisposition = getAttemptDisposition(config, "VA");

    tasks.push({
      task_key: buildTaskKey(
        params.household_id,
        "child",
        params.child_id,
        "VA",
        "VA-stillbirth",
        vaTask.target_date,
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "child",
      subject_id: params.child_id,
      woman_id: params.woman_id,
      child_id: params.child_id,
      task_type: "VA",
      form_code: "VA",
      protocol_visit_label: "VA-stillbirth",
      generation_source: "event_triggered",
      source_event_id: params.event_id,
      anchor_date: params.birth_date,
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
    });
  }

  // Generate CDF + VA for child death
  if (params.current_vital_status === "deceased" && params.death_date) {
    const cdfModeRule = getModeRule(config, "CDF");
    const cdfDisposition = getAttemptDisposition(config, "CDF");
    const cdfAvailability = getFormAvailability(config, "CDF");

    const cdfDeadlineDate = new Date(
      new Date(params.death_date + "T00:00:00Z").getTime() + 7 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    tasks.push({
      task_key: buildTaskKey(
        params.household_id,
        "child",
        params.child_id,
        "CDF",
        "CDF-child-death",
        params.death_date,
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "child",
      subject_id: params.child_id,
      woman_id: params.woman_id,
      child_id: params.child_id,
      task_type: "CDF",
      form_code: "CDF",
      protocol_visit_label: "CDF-child-death",
      generation_source: "event_triggered",
      source_event_id: params.event_id,
      anchor_date: params.death_date,
      window_start: params.death_date,
      target_date: params.death_date,
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

    // Generate VA task for child death
    const vaTask = generateVaTask({
      event_date: params.death_date,
      event_type: "child_death",
      rules_version: config.rules_version,
    });

    const vaModeRule = getModeRule(config, "VA");
    const vaDisposition = getAttemptDisposition(config, "VA");

    tasks.push({
      task_key: buildTaskKey(
        params.household_id,
        "child",
        params.child_id,
        "VA",
        "VA-child-death",
        vaTask.target_date,
        config.rules_version,
      ),
      household_id: params.household_id,
      subject_type: "child",
      subject_id: params.child_id,
      woman_id: params.woman_id,
      child_id: params.child_id,
      task_type: "VA",
      form_code: "VA",
      protocol_visit_label: "VA-child-death",
      generation_source: "event_triggered",
      source_event_id: params.event_id,
      anchor_date: params.death_date,
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
    });
  }

  return tasks;
}

export function onChildDeath(params: {
  event_id: string;
  household_id: string;
  woman_id: string;
  child_id: string;
  death_date: string;
  config?: ProtocolConfig;
}): TaskDescriptor[] {
  const config = params.config || DEFAULT_PROTOCOL_CONFIG;

  return onBirthAssessmentCompleted({
    event_id: params.event_id,
    household_id: params.household_id,
    pregnancy_id: "", // Not used for child death CDF/VA
    woman_id: params.woman_id,
    child_id: params.child_id,
    birth_date: params.death_date,
    birth_status: "live_birth",
    current_vital_status: "deceased",
    death_date: params.death_date,
    config,
  });
}
