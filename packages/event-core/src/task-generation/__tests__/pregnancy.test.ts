import { DEFAULT_PROTOCOL_CONFIG } from "@dynamic/shared-workflow";
import { generatePregnancyDetectedTaskDescriptors } from "../pregnancy";

describe("pregnancy task generation", () => {
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
