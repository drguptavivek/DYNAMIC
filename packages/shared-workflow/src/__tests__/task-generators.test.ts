import {
  onHouseholdEnrolled,
  onWqCompleted,
  onPregnancyDetected,
  onPregnancyEnrolled,
  onPregnancyOutcomeRecorded,
  onBirthAssessmentCompleted,
  onChildDeath,
  TaskDescriptor,
} from "../task-generators";
import { DEFAULT_PROTOCOL_CONFIG } from "../protocol-config";

describe("task-generators", () => {
  describe("onHouseholdEnrolled", () => {
    it("should generate HRF tasks through study end", () => {
      const tasks = onHouseholdEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        baseline_completed_date: "2026-09-01",
      });

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].task_type).toBe("HRF");
      expect(tasks[0].form_code).toBe("HRF");
      expect(tasks.every((t) => t.household_id === "hh-001")).toBe(true);
      expect(tasks.every((t) => t.subject_type === "household")).toBe(true);
    });

    it("should have deterministic task keys", () => {
      const tasks1 = onHouseholdEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        baseline_completed_date: "2026-09-01",
      });

      const tasks2 = onHouseholdEnrolled({
        event_id: "evt-2",
        household_id: "hh-001",
        baseline_completed_date: "2026-09-01",
      });

      expect(tasks1[0].task_key).toBe(tasks2[0].task_key);
    });
  });

  describe("onWqCompleted", () => {
    it("should generate PEF task if wq_pregnant=true", () => {
      const tasks = onWqCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        wq_pregnant: true,
      });

      expect(tasks.length).toBe(1);
      expect(tasks[0].task_type).toBe("PEF");
      expect(tasks[0].form_code).toBe("PEF");
      expect(tasks[0].woman_id).toBe("w-001");
    });

    it("should generate no tasks if wq_pregnant=false", () => {
      const tasks = onWqCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        wq_pregnant: false,
      });

      expect(tasks.length).toBe(0);
    });
  });

  describe("onPregnancyDetected", () => {
    it("should generate PEF task", () => {
      const tasks = onPregnancyDetected({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        detected_date: "2026-10-15",
      });

      expect(tasks.length).toBe(1);
      expect(tasks[0].task_type).toBe("PEF");
      expect(tasks[0].form_code).toBe("PEF");
    });
  });

  describe("onPregnancyEnrolled", () => {
    it("should generate PFF schedule and UF task if usg_available=true", () => {
      const tasks = onPregnancyEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        pregnancy_id: "p-001",
        enrollment_date: "2026-10-15",
        usg_available: true,
      });

      const pffTasks = tasks.filter((t) => t.task_type === "PFF");
      const ufTasks = tasks.filter((t) => t.task_type === "UF");

      expect(pffTasks.length).toBeGreaterThan(0);
      expect(ufTasks.length).toBe(1);
    });

    it("should generate only PFF tasks if usg_available=false", () => {
      const tasks = onPregnancyEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        pregnancy_id: "p-001",
        enrollment_date: "2026-10-15",
        usg_available: false,
      });

      const pffTasks = tasks.filter((t) => t.task_type === "PFF");
      const ufTasks = tasks.filter((t) => t.task_type === "UF");

      expect(pffTasks.length).toBeGreaterThan(0);
      expect(ufTasks.length).toBe(0);
    });

    it("should have deterministic task keys", () => {
      const tasks1 = onPregnancyEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        pregnancy_id: "p-001",
        enrollment_date: "2026-10-15",
        usg_available: true,
      });

      const tasks2 = onPregnancyEnrolled({
        event_id: "evt-2",
        household_id: "hh-001",
        woman_id: "w-001",
        pregnancy_id: "p-001",
        enrollment_date: "2026-10-15",
        usg_available: true,
      });

      expect(tasks1[0].task_key).toBe(tasks2[0].task_key);
    });
  });

  describe("onPregnancyOutcomeRecorded", () => {
    it("should generate BAF tasks for live births", () => {
      const tasks = onPregnancyOutcomeRecorded({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        pregnancy_id: "p-001",
        outcome_type: "live_birth",
        live_birth_count: 2,
        stillbirth_count: 0,
        outcome_date: "2026-11-01",
      });

      const bafTasks = tasks.filter((t) => t.task_type === "BAF");
      expect(bafTasks.length).toBe(2);
    });
  });

  describe("onBirthAssessmentCompleted", () => {
    it("should generate NFF schedule for live birth, alive", () => {
      const tasks = onBirthAssessmentCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        pregnancy_id: "p-001",
        woman_id: "w-001",
        child_id: "c-001",
        birth_date: "2026-11-01",
        birth_status: "live_birth",
        current_vital_status: "alive",
      });

      const nffTasks = tasks.filter((t) => t.task_type === "NFF");
      expect(nffTasks.length).toBeGreaterThan(0);
      expect(nffTasks[0].form_code).toBe("NFF");
    });

    it("should generate SBF task for stillbirth", () => {
      const tasks = onBirthAssessmentCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        pregnancy_id: "p-001",
        woman_id: "w-001",
        child_id: "c-001",
        birth_date: "2026-11-01",
        birth_status: "stillbirth",
        current_vital_status: "deceased",
      });

      const sbfTasks = tasks.filter((t) => t.task_type === "SBF");
      const vaTasks = tasks.filter((t) => t.task_type === "VA");

      expect(sbfTasks.length).toBe(1);
      expect(sbfTasks[0].form_code).toBe("SBF");
      expect(vaTasks.length).toBe(1);
      expect(vaTasks[0].form_availability).toBe("disabled");
      expect(vaTasks[0].disabled_reason).toBe("va_json_pending");
    });

    it("should generate CDF and VA task for child death", () => {
      const tasks = onBirthAssessmentCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        pregnancy_id: "p-001",
        woman_id: "w-001",
        child_id: "c-001",
        birth_date: "2026-11-01",
        birth_status: "live_birth",
        current_vital_status: "deceased",
        death_date: "2026-12-15",
      });

      const cdfTasks = tasks.filter((t) => t.task_type === "CDF");
      const vaTasks = tasks.filter((t) => t.task_type === "VA");

      expect(cdfTasks.length).toBe(1);
      expect(cdfTasks[0].form_code).toBe("CDF");
      expect(vaTasks.length).toBe(1);
      expect(vaTasks[0].form_availability).toBe("disabled");
      expect(vaTasks[0].disabled_reason).toBe("va_json_pending");
    });

    it("should have deterministic task keys", () => {
      const tasks1 = onBirthAssessmentCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        pregnancy_id: "p-001",
        woman_id: "w-001",
        child_id: "c-001",
        birth_date: "2026-11-01",
        birth_status: "live_birth",
        current_vital_status: "alive",
      });

      const tasks2 = onBirthAssessmentCompleted({
        event_id: "evt-2",
        household_id: "hh-001",
        pregnancy_id: "p-001",
        woman_id: "w-001",
        child_id: "c-001",
        birth_date: "2026-11-01",
        birth_status: "live_birth",
        current_vital_status: "alive",
      });

      expect(tasks1[0].task_key).toBe(tasks2[0].task_key);
    });
  });

  describe("onChildDeath", () => {
    it("should generate CDF and VA tasks", () => {
      const tasks = onChildDeath({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        child_id: "c-001",
        death_date: "2026-12-15",
      });

      const cdfTasks = tasks.filter((t) => t.task_type === "CDF");
      const vaTasks = tasks.filter((t) => t.task_type === "VA");

      expect(cdfTasks.length).toBe(1);
      expect(vaTasks.length).toBe(1);
      expect(vaTasks[0].form_availability).toBe("disabled");
      expect(vaTasks[0].disabled_reason).toBe("va_json_pending");
    });
  });

  describe("task descriptor validation", () => {
    it("should have all required fields for HRF task", () => {
      const tasks = onHouseholdEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        baseline_completed_date: "2026-09-01",
      });

      const task = tasks[0];
      expect(task.task_key).toBeDefined();
      expect(task.household_id).toBe("hh-001");
      expect(task.subject_type).toBe("household");
      expect(task.subject_id).toBe("hh-001");
      expect(task.task_type).toBe("HRF");
      expect(task.form_code).toBe("HRF");
      expect(task.protocol_visit_label).toBeDefined();
      expect(task.generation_source).toBe("scheduled");
      expect(task.source_event_id).toBeDefined();
      expect(task.anchor_date).toBeDefined();
      expect(task.window_start).toBeDefined();
      expect(task.target_date).toBeDefined();
      expect(task.deadline_date).toBeDefined();
      expect(task.default_expected_mode).toBeDefined();
      expect(task.allowed_modes).toBeDefined();
      expect(task.mode_rule_strength).toBeDefined();
      expect(task.max_failed_attempts).toBeDefined();
      expect(task.requires_final_close_reason).toBeDefined();
      expect(task.rules_version).toBeDefined();
      expect(task.form_availability).toBeDefined();
      expect(task.action_state).toBe("pending");
    });

    it("should have all required fields for PEF task", () => {
      const tasks = onWqCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        wq_pregnant: true,
      });

      const task = tasks[0];
      expect(task.task_key).toBeDefined();
      expect(task.household_id).toBe("hh-001");
      expect(task.subject_type).toBe("woman");
      expect(task.subject_id).toBe("w-001");
      expect(task.woman_id).toBe("w-001");
      expect(task.task_type).toBe("PEF");
      expect(task.form_code).toBe("PEF");
      expect(task.generation_source).toBe("event_triggered");
    });

    it("should have all required fields for NFF task", () => {
      const tasks = onBirthAssessmentCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        pregnancy_id: "p-001",
        woman_id: "w-001",
        child_id: "c-001",
        birth_date: "2026-11-01",
        birth_status: "live_birth",
        current_vital_status: "alive",
      });

      const task = tasks.find((t) => t.task_type === "NFF");
      expect(task).toBeDefined();
      if (task) {
        expect(task.subject_type).toBe("child");
        expect(task.subject_id).toBe("c-001");
        expect(task.child_id).toBe("c-001");
        expect(task.woman_id).toBe("w-001");
      }
    });
  });

  describe("mode rules", () => {
    it("should apply correct mode rule for HRF", () => {
      const tasks = onHouseholdEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        baseline_completed_date: "2026-09-01",
      });

      const task = tasks[0];
      expect(task.default_expected_mode).toBe("telephonic");
      expect(task.allowed_modes).toContain("telephonic");
      expect(task.allowed_modes).toContain("face_to_face");
      expect(task.mode_rule_strength).toBe("default");
    });

    it("should apply correct mode rule for PEF", () => {
      const tasks = onWqCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        wq_pregnant: true,
      });

      const task = tasks[0];
      expect(task.default_expected_mode).toBe("face_to_face");
      expect(task.allowed_modes).toEqual(["face_to_face"]);
      expect(task.mode_rule_strength).toBe("required");
    });
  });

  describe("attempt disposition rules", () => {
    it("should apply correct disposition for HRF", () => {
      const tasks = onHouseholdEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        baseline_completed_date: "2026-09-01",
      });

      const task = tasks[0];
      expect(task.max_failed_attempts).toBe(5);
      expect(task.requires_final_close_reason).toBe(true);
    });

    it("should apply correct disposition for UF", () => {
      const tasks = onPregnancyEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        woman_id: "w-001",
        pregnancy_id: "p-001",
        enrollment_date: "2026-10-15",
        usg_available: true,
      });

      const ufTask = tasks.find((t) => t.task_type === "UF");
      expect(ufTask?.max_failed_attempts).toBe(3);
      expect(ufTask?.requires_final_close_reason).toBe(false);
    });
  });

  describe("form availability", () => {
    it("should mark VA tasks as disabled", () => {
      const tasks = onBirthAssessmentCompleted({
        event_id: "evt-1",
        household_id: "hh-001",
        pregnancy_id: "p-001",
        woman_id: "w-001",
        child_id: "c-001",
        birth_date: "2026-11-01",
        birth_status: "stillbirth",
        current_vital_status: "deceased",
      });

      const vaTask = tasks.find((t) => t.task_type === "VA");
      expect(vaTask?.form_availability).toBe("disabled");
      expect(vaTask?.disabled_reason).toBe("va_json_pending");
    });

    it("should mark other forms as available", () => {
      const tasks = onHouseholdEnrolled({
        event_id: "evt-1",
        household_id: "hh-001",
        baseline_completed_date: "2026-09-01",
      });

      const task = tasks[0];
      expect(task.form_availability).toBe("available");
      expect(task.disabled_reason).toBeUndefined();
    });
  });
});
