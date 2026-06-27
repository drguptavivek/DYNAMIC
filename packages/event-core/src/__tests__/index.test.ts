import {
  evaluateTaskLifecycleTransition,
  getFailedAttemptDisposition,
  isTerminalTaskLifecycleStatus,
  type HouseholdProjection,
  type PregnancyProjection,
  reduceHouseholdProjection,
  reduceHouseholdProjectionEvents,
  reducePregnancyProjection,
  reducePregnancyProjectionEvents,
  decideWorkflowForEvent,
  orchestrateWorkflowForEvent,
} from "../index";
import {
  DEFAULT_PROTOCOL_CONFIG,
  type TaskDescriptor,
} from "@dynamic/shared-workflow";
import { householdBaselineConfirmed } from "../events";

const baselineEvent = {
  event_id: "evt-baseline-1",
  event_type: "household_baseline_confirmed",
  event_version: 1,
  aggregate_type: "household",
  aggregate_id: "hh-001",
  site_id: 1,
  locality_code: "LC-01",
  household_id: "hh-001",
  event_date: "2026-06-01",
  recorded_at: "2026-06-01T08:00:00.000Z",
  rules_version: "v1",
  payload: {
    household_id: "hh-001",
    household_number: "12",
    structure_map_id: "sm-12",
    baseline_date: "2026-06-01",
    occupancy_status: "occupied",
    enrollment_status: "enrolled",
  },
  apply_status: "applied",
  source_response_id: "resp-baseline-1",
} as const;

const notEnrolledEvent = {
  event_id: "evt-not-enrolled-1",
  event_type: "household_not_enrolled_at_baseline",
  event_version: 1,
  aggregate_type: "household",
  aggregate_id: "hh-002",
  site_id: 1,
  locality_code: "LC-01",
  household_id: "hh-002",
  event_date: "2026-06-01",
  recorded_at: "2026-06-01T09:00:00.000Z",
  rules_version: "v1",
  payload: {
    household_id: "hh-002",
  },
  apply_status: "applied",
  source_response_id: "resp-not-enrolled-1",
} as const;

const heldDuplicateEvent = {
  ...baselineEvent,
  event_id: "evt-baseline-duplicate",
  apply_status: "held_duplicate",
} as const;

const rejectedInvalidEvent = {
  ...baselineEvent,
  event_id: "evt-baseline-rejected",
  apply_status: "rejected_invalid",
} as const;

const workflowEvent = {
  event_id: "evt-workflow-1",
  event_type: "household_baseline_confirmed",
  event_version: 1,
  aggregate_type: "household",
  aggregate_id: "hh-900",
  site_id: 1,
  locality_code: "LC-01",
  household_id: "hh-900",
  event_date: "2026-09-01",
  recorded_at: "2026-09-01T08:00:00.000Z",
  rules_version: "v1",
  payload: {
    household_id: "hh-900",
    household_number: "900",
    structure_map_id: "sm-900",
    baseline_date: "2026-09-01",
    occupancy_status: "occupied",
    enrollment_status: "enrolled",
  },
  apply_status: "applied",
  source_event_id: "evt-baseline-900",
} as const;

const workflowProjection: HouseholdProjection = {
  household_id: "hh-900",
  site_id: 1,
  locality_code: "LC-01",
  household_number: "900",
  structure_map_id: "sm-900",
  baseline_date: "2026-09-01",
  occupancy_status: "occupied",
  enrollment_status: "enrolled" as const,
  is_enrolled: true,
  follow_up_enabled: true,
  source_event_id: "evt-workflow-1",
  source_response_id: null,
  rules_version: "v1",
  projection_version: 2,
};

const eligibleWomanEvent = {
  event_id: "evt-eligible-woman-1",
  event_type: "eligible_woman_identified",
  event_version: 1,
  aggregate_type: "woman",
  aggregate_id: "woman-900",
  site_id: 1,
  locality_code: "LC-01",
  household_id: "hh-900",
  subject_type: "woman",
  subject_id: "woman-900",
  event_date: "2026-09-01",
  recorded_at: "2026-09-01T08:05:00.000Z",
  rules_version: "v1",
  payload: {
    household_id: "hh-900",
    woman_id: "woman-900",
    eligibility_start_date: "2026-09-01",
  },
  apply_status: "applied",
  source_response_id: "resp-baseline-900",
} as const;

const pregnancyEnrolledEvent = {
  event_id: "evt-pregnancy-enrolled-1",
  event_type: "pregnancy_enrolled",
  event_version: 1,
  aggregate_type: "pregnancy",
  aggregate_id: "preg-001",
  site_id: 1,
  locality_code: "LC-01",
  household_id: "hh-001",
  subject_type: "pregnancy",
  subject_id: "preg-001",
  event_date: "2026-10-10",
  recorded_at: "2026-10-10T08:00:00.000Z",
  rules_version: "v1",
  payload: {
    pregnancy_id: "preg-001",
    woman_id: "woman-001",
    household_member_id: "member-001",
    household_id: "hh-001",
    enrollment_date: "2026-10-10",
    pregnancy_status: "enrolled",
    usg_available: true,
  },
  apply_status: "applied",
  source_response_id: "resp-pef-1",
  source_task_id: "task-pef-1",
} as const;

const pregnancyHeldDuplicateEvent = {
  ...pregnancyEnrolledEvent,
  event_id: "evt-pregnancy-enrolled-duplicate",
  source_response_id: "resp-pef-duplicate",
  apply_status: "held_duplicate",
} as const;

const pregnancyRejectedInvalidEvent = {
  ...pregnancyEnrolledEvent,
  event_id: "evt-pregnancy-enrolled-rejected",
  source_response_id: "resp-pef-rejected",
  apply_status: "rejected_invalid",
} as const;

const pregnancyWorkflowProjection: PregnancyProjection = {
  pregnancy_id: "preg-001",
  woman_id: "woman-001",
  household_member_id: "member-001",
  household_id: "hh-001",
  site_id: 1,
  locality_code: "LC-01",
  enrollment_date: "2026-10-10",
  pregnancy_status: "enrolled",
  usg_available: true,
  source_event_id: "evt-pregnancy-enrolled-1",
  source_response_id: "resp-pef-1",
  source_task_id: "task-pef-1",
  rules_version: "v1",
  projection_version: 1,
};

describe("event-core household projection reducer", () => {
  test("HHQ baseline confirmation creates an enrolled projection with provenance", () => {
    const projection = reduceHouseholdProjection(null, baselineEvent);

    expect(projection).toEqual({
      household_id: "hh-001",
      site_id: 1,
      locality_code: "LC-01",
      household_number: "12",
      structure_map_id: "sm-12",
      baseline_date: "2026-06-01",
      occupancy_status: "occupied",
      enrollment_status: "enrolled",
      is_enrolled: true,
      follow_up_enabled: true,
      source_event_id: "evt-baseline-1",
      source_response_id: "resp-baseline-1",
      rules_version: "v1",
      projection_version: 1,
    });
  });

  test("baseline event produces enrolled follow_up_enabled true", () => {
    const projection = reduceHouseholdProjectionEvents([baselineEvent]);

    expect(projection).toEqual({
      household_id: "hh-001",
      site_id: 1,
      locality_code: "LC-01",
      household_number: "12",
      structure_map_id: "sm-12",
      baseline_date: "2026-06-01",
      occupancy_status: "occupied",
      enrollment_status: "enrolled",
      is_enrolled: true,
      follow_up_enabled: true,
      source_event_id: "evt-baseline-1",
      source_response_id: "resp-baseline-1",
      rules_version: "v1",
      projection_version: 1,
    });
  });

  test("not enrolled baseline remains not enrolled and follow_up_enabled false", () => {
    const projection = reduceHouseholdProjection(null, notEnrolledEvent);

    expect(projection).toEqual({
      household_id: "hh-002",
      site_id: 1,
      locality_code: "LC-01",
      household_number: undefined,
      structure_map_id: undefined,
      baseline_date: "2026-06-01",
      occupancy_status: undefined,
      enrollment_status: "not_enrolled",
      is_enrolled: false,
      follow_up_enabled: false,
      source_event_id: "evt-not-enrolled-1",
      source_response_id: "resp-not-enrolled-1",
      rules_version: "v1",
      projection_version: 1,
    });
  });

  test("duplicate application of same event is idempotent", () => {
    const projection = reduceHouseholdProjectionEvents([baselineEvent, baselineEvent]);

    expect(projection).toEqual({
      household_id: "hh-001",
      site_id: 1,
      locality_code: "LC-01",
      household_number: "12",
      structure_map_id: "sm-12",
      baseline_date: "2026-06-01",
      occupancy_status: "occupied",
      enrollment_status: "enrolled",
      is_enrolled: true,
      follow_up_enabled: true,
      source_event_id: "evt-baseline-1",
      source_response_id: "resp-baseline-1",
      rules_version: "v1",
      projection_version: 1,
    });
  });

  test("held_duplicate and rejected_invalid events do not mutate projection", () => {
    const projection = reduceHouseholdProjectionEvents([
      baselineEvent,
      heldDuplicateEvent,
      rejectedInvalidEvent,
    ]);

    expect(projection).toEqual({
      household_id: "hh-001",
      site_id: 1,
      locality_code: "LC-01",
      household_number: "12",
      structure_map_id: "sm-12",
      baseline_date: "2026-06-01",
      occupancy_status: "occupied",
      enrollment_status: "enrolled",
      is_enrolled: true,
      follow_up_enabled: true,
      source_event_id: "evt-baseline-1",
      source_response_id: "resp-baseline-1",
      rules_version: "v1",
      projection_version: 1,
    });
  });

  test("local-vs-backend reducer parity: same event list produces the same projection for two simulated callers", () => {
    const events = [baselineEvent];

    const localProjection = reduceHouseholdProjectionEvents(events);
    const backendProjection = reduceHouseholdProjectionEvents([...events]);

    expect(localProjection).toEqual(backendProjection);
  });
});

describe("event-core task lifecycle rules", () => {
  const baseState = {
    task_id: "task-001",
    status: "due" as const,
    failed_attempt_count: 0,
    max_failed_attempts: 2,
  };

  test("field cannot open a disabled task, complete a terminal task, or complete with a duplicate response", () => {
    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "disabled" },
        { event_type: "task_opened", actor_type: "field" },
      ),
    ).toEqual({
      allowed: false,
      reason: "disabled_task",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "completed_on_time" },
        {
          event_type: "task_completed",
          actor_type: "field",
          response_status: "primary",
          response_id: "resp-001",
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "terminal_task",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "in_progress" },
        {
          event_type: "task_completed",
          actor_type: "field",
          response_status: "duplicate_task_completion",
          response_id: "resp-002",
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "response_not_primary",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });
  });

  test("task_completed with a primary response returns completed_on_time or completed_late", () => {
    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "in_progress" },
        {
          event_type: "task_completed",
          actor_type: "backend",
          response_status: "primary",
          response_id: "resp-003",
        },
      ),
    ).toEqual({
      allowed: true,
      next_status: "completed_on_time",
      reason: "completed",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "in_progress" },
        {
          event_type: "task_completed",
          actor_type: "backend",
          response_status: "primary",
          response_id: "resp-004",
          occurred_late: true,
        },
      ),
    ).toEqual({
      allowed: true,
      next_status: "completed_late",
      reason: "completed",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });
  });

  test("failed attempts increment and prompt final close reason without auto-closing", () => {
    const disposition = getFailedAttemptDisposition(1, 2);

    expect(disposition).toEqual({
      next_failed_attempt_count: 2,
      should_prompt_final_close_reason: true,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "due", failed_attempt_count: 1, max_failed_attempts: 2 },
        { event_type: "task_attempt_recorded", actor_type: "field" },
      ),
    ).toEqual({
      allowed: true,
      next_status: "due",
      reason: "attempt_recorded",
      should_increment_failed_attempts: true,
      should_prompt_final_close_reason: true,
    });
  });

  test("field close final reason requires due, urgent, or overdue status and a close reason", () => {
    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "in_progress" },
        {
          event_type: "task_closed_final_reason",
          actor_type: "field",
          close_reason: "not_available",
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "invalid_transition",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "due" },
        {
          event_type: "task_closed_final_reason",
          actor_type: "field",
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "missing_close_reason",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });
  });

  test("backend or admin can miss, cancel, or supersede from allowed statuses and field cannot", () => {
    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "urgent" },
        { event_type: "task_missed", actor_type: "field" },
      ),
    ).toEqual({
      allowed: false,
      reason: "field_task_event_not_allowed",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "overdue" },
        { event_type: "task_cancelled", actor_type: "admin" },
      ),
    ).toEqual({
      allowed: true,
      next_status: "cancelled",
      reason: "cancelled",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "due" },
        { event_type: "task_superseded", actor_type: "backend" },
      ),
    ).toEqual({
      allowed: true,
      next_status: "superseded",
      reason: "superseded",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });
  });

  test("admin can reopen disabled or terminal tasks to due", () => {
    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "disabled" },
        { event_type: "task_reopened_by_admin", actor_type: "admin" },
      ),
    ).toEqual({
      allowed: true,
      next_status: "due",
      reason: "reopened_by_admin",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "completed_late" },
        { event_type: "task_reopened_by_admin", actor_type: "admin" },
      ),
    ).toEqual({
      allowed: true,
      next_status: "due",
      reason: "reopened_by_admin",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });
  });

  test("task_generated is idempotent for planned backend or admin events", () => {
    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "planned" },
        { event_type: "task_generated", actor_type: "backend" },
      ),
    ).toEqual({
      allowed: true,
      next_status: "planned",
      reason: "generated",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });

    expect(
      evaluateTaskLifecycleTransition(
        { ...baseState, status: "planned" },
        { event_type: "task_generated", actor_type: "admin" },
      ),
    ).toEqual({
      allowed: true,
      next_status: "planned",
      reason: "generated",
      should_increment_failed_attempts: false,
      should_prompt_final_close_reason: false,
    });
  });

  test("terminal status helper includes closed and not_reachable_closed", () => {
    expect(isTerminalTaskLifecycleStatus("closed")).toBe(true);
    expect(isTerminalTaskLifecycleStatus("not_reachable_closed")).toBe(true);
    expect(isTerminalTaskLifecycleStatus("due")).toBe(false);
  });
});

describe("event-core pregnancy projection reducer", () => {
  test("PEF pregnancy enrollment creates a projection with source provenance", () => {
    const projection = reducePregnancyProjection(null, pregnancyEnrolledEvent);

    expect(projection).toEqual(pregnancyWorkflowProjection);
  });

  test("held_duplicate and rejected_invalid pregnancy events do not mutate projection", () => {
    const projection = reducePregnancyProjectionEvents([
      pregnancyEnrolledEvent,
      pregnancyHeldDuplicateEvent,
      pregnancyRejectedInvalidEvent,
    ]);

    expect(projection).toEqual(pregnancyWorkflowProjection);
  });

  test("duplicate application of the same pregnancy event is idempotent", () => {
    const projection = reducePregnancyProjectionEvents([
      pregnancyEnrolledEvent,
      pregnancyEnrolledEvent,
    ]);

    expect(projection).toEqual(pregnancyWorkflowProjection);
  });

  test("local-vs-backend reducer parity: same pregnancy event list produces the same projection", () => {
    const events = [pregnancyEnrolledEvent];

    const localProjection = reducePregnancyProjectionEvents(events);
    const backendProjection = reducePregnancyProjectionEvents([...events]);

    expect(localProjection).toEqual(backendProjection);
  });
});

describe("event-core workflow orchestration", () => {
  test("household Workflow Decision generates deterministic task descriptors for backend and Expo callers", () => {
    const backendDecision = decideWorkflowForEvent({
      event: workflowEvent,
      household_projection: workflowProjection,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });
    const expoDecision = decideWorkflowForEvent({
      event: workflowEvent,
      household_projection: workflowProjection,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(backendDecision).toEqual(expoDecision);
    expect(backendDecision.decisions).toHaveLength(1);
    expect(backendDecision.decisions[0].kind).toBe("tasks_generated");
    expect(
      backendDecision.decisions[0].task_descriptors.every((task: TaskDescriptor) =>
        task.task_key.endsWith(`|${task.target_date}|v1`),
      ),
    ).toBe(true);
    expect(
      backendDecision.decisions[0].task_descriptors.every((task: TaskDescriptor) => (
        task.household_id === workflowProjection.household_id &&
        task.subject_type === "household" &&
        task.subject_id === workflowProjection.household_id &&
        task.task_type === "HRF" &&
        task.form_code === "HRF" &&
        task.generation_source === "scheduled" &&
        task.source_event_id === workflowEvent.event_id &&
        task.anchor_date === workflowProjection.baseline_date &&
        task.rules_version === "v1"
      )),
    ).toBe(true);
  });

  test("household_baseline_confirmed orchestration task keys match owning event module output", () => {
    const directEvent = householdBaselineConfirmed.buildEvent({
      event_id: workflowEvent.event_id,
      site_id: workflowEvent.site_id,
      locality_code: workflowEvent.locality_code,
      household_id: workflowProjection.household_id,
      household_number: workflowProjection.household_number ?? "",
      structure_map_id: workflowProjection.structure_map_id ?? "",
      baseline_date: workflowProjection.baseline_date!,
      recorded_at: workflowEvent.recorded_at,
    });
    const directTasks = householdBaselineConfirmed.planWorkflow({
      event: directEvent,
      config: DEFAULT_PROTOCOL_CONFIG,
    });

    const orchestration = orchestrateWorkflowForEvent({
      event: workflowEvent,
      household_projection: workflowProjection,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(orchestration.decisions).toHaveLength(1);
    expect(orchestration.decisions[0].kind).toBe("tasks_generated");
    expect(
      orchestration.decisions[0].task_descriptors.map(
        (task: TaskDescriptor) => task.task_key,
      ),
    ).toEqual(
      directTasks.map((task) => task.task_key),
    );
  });

  test("eligible woman Workflow Decision generates deterministic WQ task descriptors", () => {
    const decision = decideWorkflowForEvent({
      event: eligibleWomanEvent,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(decision.decisions).toHaveLength(1);
    expect(decision.decisions[0].kind).toBe("tasks_generated");
    expect(decision.decisions[0].task_descriptors).toEqual([
      expect.objectContaining({
        task_key: "hh-900|person|woman-900|WQ|baseline|2026-09-01|v1",
        household_id: "hh-900",
        subject_type: "person",
        subject_id: "woman-900",
        woman_id: "woman-900",
        task_type: "WQ",
        form_code: "WQ",
        protocol_visit_label: "baseline",
        generation_source: "event_triggered",
        source_event_id: "evt-eligible-woman-1",
        anchor_date: "2026-09-01",
        target_date: "2026-09-01",
        rules_version: "v1",
      }),
    ]);
  });

  test("held household Workflow Decision suppresses task descriptors", () => {
    const decision = decideWorkflowForEvent({
      event: {
        ...workflowEvent,
        event_id: "evt-workflow-held",
        apply_status: "held_duplicate",
      },
      household_projection: workflowProjection,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(decision.decisions).toEqual([
      {
        kind: "tasks_suppressed",
        source_event_id: "evt-workflow-held",
        task_descriptors: [],
        reason: "held_duplicate",
      },
    ]);
  });

  test("local and backend callers produce the same orchestration result", () => {
    const local = orchestrateWorkflowForEvent({
      event: workflowEvent,
      household_projection: workflowProjection,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });
    const backend = orchestrateWorkflowForEvent({
      event: workflowEvent,
      household_projection: workflowProjection,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(local).toEqual(backend);
  });

  test("missing household projection returns no tasks and a workflow_projection_missing flag", () => {
    const result = orchestrateWorkflowForEvent({
      event: workflowEvent,
      household_projection: null,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(result.decisions).toEqual([]);
    expect(result.data_quality_flags).toEqual([
      {
        flag_type: "workflow_projection_missing",
        source_event_id: workflowEvent.event_id,
        message: "household projection required for household_baseline_confirmed workflow generation",
      },
    ]);
  });

  test("pregnancy_enrolled generates PFF and UF tasks anchored to pregnancy enrollment date", () => {
    const orchestration = orchestrateWorkflowForEvent({
      event: pregnancyEnrolledEvent,
      pregnancy_projection: pregnancyWorkflowProjection,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(orchestration.decisions).toHaveLength(1);
    expect(orchestration.decisions[0].kind).toBe("tasks_generated");
    expect(orchestration.decisions[0].source_event_id).toBe("evt-pregnancy-enrolled-1");
    expect(orchestration.decisions[0].task_descriptors.map((task) => task.task_type)).toContain(
      "PFF",
    );
    expect(orchestration.decisions[0].task_descriptors.map((task) => task.task_type)).toContain(
      "UF",
    );
    expect(
      orchestration.decisions[0].task_descriptors.every(
        (task) => task.anchor_date === "2026-10-10",
      ),
    ).toBe(true);
  });

  test("pregnancy_enrolled missing projection returns no tasks and a workflow_projection_missing flag", () => {
    const result = orchestrateWorkflowForEvent({
      event: pregnancyEnrolledEvent,
      pregnancy_projection: null,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(result.decisions).toEqual([]);
    expect(result.data_quality_flags).toEqual([
      {
        flag_type: "workflow_projection_missing",
        source_event_id: pregnancyEnrolledEvent.event_id,
        message: "pregnancy projection required for pregnancy_enrolled workflow generation",
      },
    ]);
  });

  test("rules_version mismatch suppresses tasks and emits a data-quality flag", () => {
    const result = orchestrateWorkflowForEvent({
      event: workflowEvent,
      household_projection: workflowProjection,
      config: {
        ...DEFAULT_PROTOCOL_CONFIG,
        rules_version: "v2",
      },
      rules_version: "v1",
    });

    expect(result.decisions).toEqual([]);
    expect(result.data_quality_flags).toEqual([
      {
        flag_type: "workflow_rules_version_mismatch",
        source_event_id: workflowEvent.event_id,
        message: "workflow rules_version v1 does not match config rules_version v2",
      },
    ]);
  });

  test("unknown event types return an empty orchestration result", () => {
    const result = orchestrateWorkflowForEvent({
      event: {
        ...workflowEvent,
        event_type: "unknown_event_type",
      },
      household_projection: workflowProjection,
      config: DEFAULT_PROTOCOL_CONFIG,
      rules_version: "v1",
    });

    expect(result).toEqual({
      decisions: [],
      data_quality_flags: [],
    });
  });
});
