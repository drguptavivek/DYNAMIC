import {
  generateNffSchedule,
  generateVaTask,
  type ProtocolConfig,
  type TaskDescriptor,
} from "@dynamic/shared-workflow";
import {
  addDaysIso,
  buildTaskKey,
  getAttemptDisposition,
  getConfig,
  getFormAvailability,
  getModeRule,
} from "./shared";

export interface BirthAssessmentTaskGenerationInput {
  household_id: string;
  woman_id: string;
  child_id: string;
  birth_date: string;
  birth_status: "live_birth" | "stillbirth" | "fetal_loss_20plus";
  current_vital_status: "alive" | "deceased";
  death_date?: string | null;
  source_event_id: string;
  config?: ProtocolConfig;
}

export function generateBirthAssessmentTaskDescriptors(
  input: BirthAssessmentTaskGenerationInput,
): TaskDescriptor[] {
  const config = getConfig(input.config);
  const tasks: TaskDescriptor[] = [];

  if (input.birth_status === "live_birth" && input.current_vital_status === "alive") {
    tasks.push(...generateNffTaskDescriptors(input, config));
  }

  if (input.birth_status === "stillbirth" || input.birth_status === "fetal_loss_20plus") {
    tasks.push(generateStillbirthFormTaskDescriptor(input, config));
    tasks.push(generateVaTaskDescriptor(input, "stillbirth", input.birth_date, config));
  }

  if (input.current_vital_status === "deceased" && input.death_date) {
    tasks.push(generateChildDeathFormTaskDescriptor(input, config));
    tasks.push(generateVaTaskDescriptor(input, "child_death", input.death_date, config));
  }

  return tasks;
}

function generateNffTaskDescriptors(
  input: BirthAssessmentTaskGenerationInput,
  config: ProtocolConfig,
): TaskDescriptor[] {
  const modeRule = getModeRule(config, "NFF");
  const disposition = getAttemptDisposition(config, "NFF");
  const availability = getFormAvailability(config, "NFF");

  return generateNffSchedule({
    birth_date: input.birth_date,
    study_end_date: config.study_end_date,
    rules_version: config.rules_version,
  }).map((schedule) => ({
    task_key: buildTaskKey(
      input.household_id,
      "child",
      input.child_id,
      "NFF",
      schedule.label,
      schedule.target_date,
      config.rules_version,
    ),
    household_id: input.household_id,
    subject_type: "child",
    subject_id: input.child_id,
    woman_id: input.woman_id,
    child_id: input.child_id,
    task_type: "NFF",
    form_code: "NFF",
    protocol_visit_label: schedule.label,
    generation_source: "scheduled",
    source_event_id: input.source_event_id,
    anchor_date: input.birth_date,
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

function generateStillbirthFormTaskDescriptor(
  input: BirthAssessmentTaskGenerationInput,
  config: ProtocolConfig,
): TaskDescriptor {
  const modeRule = getModeRule(config, "SBF");
  const disposition = getAttemptDisposition(config, "SBF");
  const availability = getFormAvailability(config, "SBF");

  return {
    task_key: buildTaskKey(
      input.household_id,
      "child",
      input.child_id,
      "SBF",
      "SBF-stillbirth",
      input.birth_date,
      config.rules_version,
    ),
    household_id: input.household_id,
    subject_type: "child",
    subject_id: input.child_id,
    woman_id: input.woman_id,
    child_id: input.child_id,
    task_type: "SBF",
    form_code: "SBF",
    protocol_visit_label: "SBF-stillbirth",
    generation_source: "event_triggered",
    source_event_id: input.source_event_id,
    anchor_date: input.birth_date,
    window_start: input.birth_date,
    target_date: input.birth_date,
    deadline_date: addDaysIso(input.birth_date, 7),
    default_expected_mode: modeRule.default_mode,
    allowed_modes: modeRule.allowed_modes,
    mode_rule_strength: modeRule.strength,
    max_failed_attempts: disposition.max_failed_attempts,
    requires_final_close_reason: disposition.requires_final_close_reason,
    rules_version: config.rules_version,
    form_availability: availability.availability,
    action_state: "pending",
    disabled_reason: availability.disabled_reason,
  };
}

function generateChildDeathFormTaskDescriptor(
  input: BirthAssessmentTaskGenerationInput,
  config: ProtocolConfig,
): TaskDescriptor {
  const deathDate = input.death_date;
  if (!deathDate) {
    throw new Error("death_date is required to generate CDF task descriptors");
  }
  const modeRule = getModeRule(config, "CDF");
  const disposition = getAttemptDisposition(config, "CDF");
  const availability = getFormAvailability(config, "CDF");

  return {
    task_key: buildTaskKey(
      input.household_id,
      "child",
      input.child_id,
      "CDF",
      "CDF-child-death",
      deathDate,
      config.rules_version,
    ),
    household_id: input.household_id,
    subject_type: "child",
    subject_id: input.child_id,
    woman_id: input.woman_id,
    child_id: input.child_id,
    task_type: "CDF",
    form_code: "CDF",
    protocol_visit_label: "CDF-child-death",
    generation_source: "event_triggered",
    source_event_id: input.source_event_id,
    anchor_date: deathDate,
    window_start: deathDate,
    target_date: deathDate,
    deadline_date: addDaysIso(deathDate, 7),
    default_expected_mode: modeRule.default_mode,
    allowed_modes: modeRule.allowed_modes,
    mode_rule_strength: modeRule.strength,
    max_failed_attempts: disposition.max_failed_attempts,
    requires_final_close_reason: disposition.requires_final_close_reason,
    rules_version: config.rules_version,
    form_availability: availability.availability,
    action_state: "pending",
    disabled_reason: availability.disabled_reason,
  };
}

function generateVaTaskDescriptor(
  input: BirthAssessmentTaskGenerationInput,
  eventType: "stillbirth" | "child_death",
  eventDate: string,
  config: ProtocolConfig,
): TaskDescriptor {
  const vaTask = generateVaTask({
    event_date: eventDate,
    event_type: eventType,
    rules_version: config.rules_version,
  });
  const modeRule = getModeRule(config, "VA");
  const disposition = getAttemptDisposition(config, "VA");
  const label = eventType === "stillbirth" ? "VA-stillbirth" : "VA-child-death";

  return {
    task_key: buildTaskKey(
      input.household_id,
      "child",
      input.child_id,
      "VA",
      label,
      vaTask.target_date,
      config.rules_version,
    ),
    household_id: input.household_id,
    subject_type: "child",
    subject_id: input.child_id,
    woman_id: input.woman_id,
    child_id: input.child_id,
    task_type: "VA",
    form_code: "VA",
    protocol_visit_label: label,
    generation_source: "event_triggered",
    source_event_id: input.source_event_id,
    anchor_date: eventDate,
    window_start: vaTask.window_start,
    target_date: vaTask.target_date,
    deadline_date: vaTask.deadline,
    default_expected_mode: modeRule.default_mode,
    allowed_modes: modeRule.allowed_modes,
    mode_rule_strength: modeRule.strength,
    max_failed_attempts: disposition.max_failed_attempts,
    requires_final_close_reason: disposition.requires_final_close_reason,
    rules_version: config.rules_version,
    form_availability: vaTask.form_availability,
    action_state: "pending",
    disabled_reason: vaTask.disabled_reason,
  };
}
