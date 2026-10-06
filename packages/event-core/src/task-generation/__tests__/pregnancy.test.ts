import { DEFAULT_PROTOCOL_CONFIG } from "@dynamic/shared-workflow";
import { generatePregnancyDetectedTaskDescriptors, generatePregnancyEnrollmentTaskDescriptors } from "../pregnancy";

describe("pregnancy task generation", () => {
  it("alternates planned PFF modes by round while preserving task identity and both allowed modes", () => {
    const tasks = generatePregnancyEnrollmentTaskDescriptors({
      household_id: "hh-001",
      pregnancy_id: "pregnancy-001",
      woman_id: "woman-001",
      enrollment_date: "2026-09-15",
      usg_available: false,
      source_event_id: "evt-pregnancy-enrolled-1",
      config: { ...DEFAULT_PROTOCOL_CONFIG, study_end_date: "2027-03-15" },
    });

    expect(tasks.map((task) => task.default_expected_mode)).toEqual([
      "face_to_face", "telephonic", "face_to_face", "telephonic", "face_to_face", "telephonic",
    ]);
    expect(tasks.map((task) => task.task_key)).toEqual([
      "hh-001|pregnancy|pregnancy-001|PFF|PFF-M1|2026-10-15|v1",
      "hh-001|pregnancy|pregnancy-001|PFF|PFF-M2|2026-11-15|v1",
      "hh-001|pregnancy|pregnancy-001|PFF|PFF-M3|2026-12-15|v1",
      "hh-001|pregnancy|pregnancy-001|PFF|PFF-M4|2027-01-15|v1",
      "hh-001|pregnancy|pregnancy-001|PFF|PFF-M5|2027-02-15|v1",
      "hh-001|pregnancy|pregnancy-001|PFF|PFF-M6|2027-03-15|v1",
    ]);
    for (const task of tasks) {
      expect(task.allowed_modes).toEqual(["telephonic", "face_to_face"]);
      expect(task.mode_rule_strength).toBe("flexible");
    }
  });

  it("generates deterministic PEF descriptors from pregnancy detection facts", () => {
    const tasks = generatePregnancyDetectedTaskDescriptors({
      household_id: "hh-001",
      woman_id: "woman-001",
      detected_date: "2026-09-15",
      source_event_id: "evt-pregnancy-detected-1",
      config: DEFAULT_PROTOCOL_CONFIG,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual(expect.objectContaining({
      task_key: "hh-001|woman|woman-001|PEF|PEF-pregnancy-detected|2026-09-15|v1",
      household_id: "hh-001",
      subject_type: "woman",
      subject_id: "woman-001",
      woman_id: "woman-001",
      task_type: "PEF",
      form_code: "PEF",
      protocol_visit_label: "PEF-pregnancy-detected",
      generation_source: "event_triggered",
      source_event_id: "evt-pregnancy-detected-1",
      anchor_date: "2026-09-15",
      window_start: "2026-09-15",
      target_date: "2026-09-15",
      deadline_date: "2026-09-29",
      rules_version: "v1",
      form_availability: "available",
      action_state: "pending",
    }));
  });
});
