import {
  birthAssessmentCompleted,
  fieldEventRegistry,
  pregnancyEnrolled,
  pregnancyOutcomeRecorded,
} from "../index";
import { promoteFormSubmission } from "../../index";

describe("field event modules", () => {
  it("routes forms to owning event modules", () => {
    expect(fieldEventRegistry.PEF).toBe(pregnancyEnrolled);
    expect(fieldEventRegistry.POF).toBe(pregnancyOutcomeRecorded);
    expect(fieldEventRegistry.BAF).toBe(birthAssessmentCompleted);
  });

  it("promotes HHQ submission evidence through the shared trigger", () => {
    const promotion = promoteFormSubmission({
      form_code: "HHQ",
      event_id: "evt-hhq-1",
      site_id: 1,
      locality_code: "02",
      household_id: "1-02-0042-03",
      form_response_id: "resp-hhq-1",
      recorded_at: "2026-09-01T10:00:00.000Z",
      answers_json: {
        hhq_interview_date: "2026-09-01",
        hhq_household_number: "03",
        hhq_structure_map_id: "0042",
      },
    });

    expect(promotion?.event.event_type).toBe("household_baseline_confirmed");
    expect(promotion?.event.payload).toMatchObject({
      household_id: "1-02-0042-03",
      household_number: "03",
      structure_map_id: "0042",
      baseline_date: "2026-09-01",
    });
    expect(promotion?.task_descriptors.some((task) => task.task_type === "HRF")).toBe(true);
  });

  it("promotes PEF submission evidence through the shared trigger", () => {
    const promotion = promoteFormSubmission({
      form_code: "PEF",
      event_id: "evt-pef-trigger-1",
      site_id: 1,
      locality_code: "02",
      household_id: "1-02-0042-03",
      subject_id: "1-02-0042-03-02",
      form_response_id: "resp-pef-1",
      recorded_at: "2026-09-15T10:00:00.000Z",
      answers_json: {
        pef_enrollment_date: "2026-09-15",
        pef_any_time_during_pregnancy_ultrasound: 1,
      },
      context: {
        pregnancy_id: "preg-1",
        woman_id: "1-02-0042-03-02",
        household_member_id: "1-02-0042-03-02",
      },
    });

    expect(promotion?.event.event_type).toBe("pregnancy_enrolled");
    expect(promotion?.event.payload).toMatchObject({
      pregnancy_id: "preg-1",
      enrollment_date: "2026-09-15",
      usg_available: true,
    });
    expect(promotion?.task_descriptors.some((task) => task.task_type === "PFF")).toBe(true);
    expect(promotion?.task_descriptors.some((task) => task.task_type === "UF")).toBe(true);
  });

  it("plans PEF follow-up workflow from pregnancy_enrolled", () => {
    const event = pregnancyEnrolled.buildEvent({
      event_id: "evt-pef-1",
      site_id: 1,
      locality_code: "DEV001",
      household_id: "1-DEV001-0001-01",
      pregnancy_id: "preg-1",
      woman_id: "woman-1",
      household_member_id: "member-1",
      enrollment_date: "2026-09-15",
      usg_available: true,
      recorded_at: "2026-09-15T10:00:00.000Z",
      form_response_id: "resp-pef-1",
      task_id: "task-pef-1",
    });

    const tasks = pregnancyEnrolled.planWorkflow({ event });

    expect(event.event_type).toBe("pregnancy_enrolled");
    expect(event.payload).toMatchObject({
      pregnancy_id: "preg-1",
      enrollment_date: "2026-09-15",
      usg_available: true,
    });
    expect(tasks.some((task) => task.task_type === "PFF")).toBe(true);
    expect(tasks.some((task) => task.task_type === "UF")).toBe(true);
    expect(tasks.every((task) => task.source_event_id === "evt-pef-1")).toBe(true);
  });

  it("plans BAF tasks from pregnancy_outcome_recorded", () => {
    const event = pregnancyOutcomeRecorded.buildEvent({
      event_id: "evt-pof-1",
      site_id: 1,
      locality_code: "DEV001",
      household_id: "1-DEV001-0001-01",
      pregnancy_id: "preg-1",
      woman_id: "woman-1",
      outcome_date: "2027-01-10",
      outcome_type: "live_birth",
      live_birth_count: 2,
      stillbirth_count: 0,
      recorded_at: "2027-01-10T10:00:00.000Z",
      form_response_id: "resp-pof-1",
      task_id: "task-pof-1",
    });

    const tasks = pregnancyOutcomeRecorded.planWorkflow({ event });

    expect(event.event_type).toBe("pregnancy_outcome_recorded");
    expect(tasks).toHaveLength(2);
    expect(tasks.every((task) => task.task_type === "BAF")).toBe(true);
    expect(tasks.every((task) => task.source_event_id === "evt-pof-1")).toBe(true);
  });

  it("plans NFF and mortality workflow from birth_assessment_completed", () => {
    const event = birthAssessmentCompleted.buildEvent({
      event_id: "evt-baf-1",
      site_id: 1,
      locality_code: "DEV001",
      household_id: "1-DEV001-0001-01",
      pregnancy_id: "preg-1",
      woman_id: "woman-1",
      child_id: "child-1",
      birth_date: "2027-01-10",
      birth_status: "live_birth",
      current_vital_status: "deceased",
      death_date: "2027-02-01",
      recorded_at: "2027-02-01T10:00:00.000Z",
      form_response_id: "resp-baf-1",
      task_id: "task-baf-1",
    });

    const tasks = birthAssessmentCompleted.planWorkflow({ event });

    expect(event.event_type).toBe("birth_assessment_completed");
    expect(tasks.some((task) => task.task_type === "CDF")).toBe(true);
    expect(tasks.some((task) => task.task_type === "VA")).toBe(true);
    expect(tasks.every((task) => task.source_event_id === "evt-baf-1")).toBe(true);
  });

  it("does not plan workflow for held duplicate events", () => {
    const event = pregnancyEnrolled.buildEvent({
      event_id: "evt-pef-duplicate",
      site_id: 1,
      locality_code: "DEV001",
      household_id: "1-DEV001-0001-01",
      pregnancy_id: "preg-1",
      woman_id: "woman-1",
      household_member_id: "member-1",
      enrollment_date: "2026-09-15",
      usg_available: false,
      recorded_at: "2026-09-15T10:00:00.000Z",
      apply_status: "held_duplicate",
    });

    expect(pregnancyEnrolled.planWorkflow({ event })).toEqual([]);
  });
});
