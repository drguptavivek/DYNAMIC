import { DEFAULT_PROTOCOL_CONFIG } from "@dynamic/shared-workflow";
import { generateBirthAssessmentTaskDescriptors } from "../birth";

const baseInput = {
  household_id: "hh-001",
  woman_id: "woman-001",
  child_id: "child-001",
  birth_date: "2027-01-10",
  source_event_id: "evt-baf-1",
  config: DEFAULT_PROTOCOL_CONFIG,
} as const;

describe("birth assessment task generation", () => {
  it("generates deterministic NFF descriptors for live surviving children", () => {
    const tasks = generateBirthAssessmentTaskDescriptors({
      ...baseInput,
      birth_status: "live_birth",
      current_vital_status: "alive",
    });

    expect(tasks.length).toBeGreaterThan(1);
    expect(tasks[0]).toEqual(expect.objectContaining({
      task_key: "hh-001|child|child-001|NFF|NFF-7d|2027-01-17|v1",
      household_id: "hh-001",
      subject_type: "child",
      subject_id: "child-001",
      woman_id: "woman-001",
      child_id: "child-001",
      task_type: "NFF",
      form_code: "NFF",
      protocol_visit_label: "NFF-7d",
      generation_source: "scheduled",
      source_event_id: "evt-baf-1",
      anchor_date: "2027-01-10",
      target_date: "2027-01-17",
      rules_version: "v1",
      action_state: "pending",
    }));
    expect(new Set(tasks.map((task) => task.task_key)).size).toBe(tasks.length);
  });

  it("generates SBF and disabled VA descriptors for stillbirth events", () => {
    const tasks = generateBirthAssessmentTaskDescriptors({
      ...baseInput,
      birth_status: "stillbirth",
      current_vital_status: "deceased",
      death_date: "2027-01-10",
    });

    expect(tasks.map((task) => task.task_type)).toEqual(["SBF", "VA", "CDF", "VA"]);
    expect(tasks[0]).toEqual(expect.objectContaining({
      task_key: "hh-001|child|child-001|SBF|SBF-stillbirth|2027-01-10|v1",
      deadline_date: "2027-01-17",
      source_event_id: "evt-baf-1",
    }));
    expect(tasks[1]).toEqual(expect.objectContaining({
      task_key: "hh-001|child|child-001|VA|VA-stillbirth|2027-02-09|v1",
      anchor_date: "2027-01-10",
      target_date: "2027-02-09",
      form_availability: "disabled",
      disabled_reason: "va_json_pending",
    }));
  });

  it("generates CDF and disabled VA descriptors for child death events", () => {
    const tasks = generateBirthAssessmentTaskDescriptors({
      ...baseInput,
      birth_status: "live_birth",
      current_vital_status: "deceased",
      death_date: "2027-02-01",
    });

    expect(tasks.map((task) => task.task_type)).toEqual(["CDF", "VA"]);
    expect(tasks[0]).toEqual(expect.objectContaining({
      task_key: "hh-001|child|child-001|CDF|CDF-child-death|2027-02-01|v1",
      deadline_date: "2027-02-08",
      source_event_id: "evt-baf-1",
    }));
    expect(tasks[1]).toEqual(expect.objectContaining({
      task_key: "hh-001|child|child-001|VA|VA-child-death|2027-03-03|v1",
      anchor_date: "2027-02-01",
      target_date: "2027-03-03",
      form_availability: "disabled",
      disabled_reason: "va_json_pending",
    }));
  });
});
