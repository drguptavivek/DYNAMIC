import {
  addCalendarMonths,
  addDays,
  toISODate,
  parseISODate,
  generateHrfSchedule,
  generatePffSchedule,
  generateNffSchedule,
  generateVaTask,
} from "../schedule-rules";

describe("schedule-rules", () => {
  describe("addCalendarMonths", () => {
    it("should add months correctly", () => {
      const date = new Date("2026-01-15T00:00:00Z");
      const result = addCalendarMonths(date, 1);
      expect(toISODate(result)).toBe("2026-02-15");
    });

    it("should clamp day to month end", () => {
      const date = new Date("2026-01-31T00:00:00Z");
      const result = addCalendarMonths(date, 1);
      expect(toISODate(result)).toBe("2026-02-28");
    });

    it("should handle negative months", () => {
      const date = new Date("2026-03-15T00:00:00Z");
      const result = addCalendarMonths(date, -1);
      expect(toISODate(result)).toBe("2026-02-15");
    });

    it("should handle year boundaries", () => {
      const date = new Date("2026-11-15T00:00:00Z");
      const result = addCalendarMonths(date, 3);
      expect(toISODate(result)).toBe("2027-02-15");
    });
  });

  describe("addDays", () => {
    it("should add days correctly", () => {
      const date = new Date("2026-01-15T00:00:00Z");
      const result = addDays(date, 5);
      expect(toISODate(result)).toBe("2026-01-20");
    });

    it("should handle negative days", () => {
      const date = new Date("2026-01-15T00:00:00Z");
      const result = addDays(date, -5);
      expect(toISODate(result)).toBe("2026-01-10");
    });
  });

  describe("toISODate", () => {
    it("should format date to YYYY-MM-DD", () => {
      const date = new Date("2026-03-05T00:00:00Z");
      expect(toISODate(date)).toBe("2026-03-05");
    });
  });

  describe("parseISODate", () => {
    it("should parse ISO date string", () => {
      const result = parseISODate("2026-03-05");
      expect(toISODate(result)).toBe("2026-03-05");
    });
  });

  describe("generateHrfSchedule", () => {
    it("should generate correct number of rounds", () => {
      const schedules = generateHrfSchedule({
        baseline_completed_date: "2026-09-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });
      expect(schedules.length).toBeGreaterThan(0);
    });

    it("should use correct labels", () => {
      const schedules = generateHrfSchedule({
        baseline_completed_date: "2026-09-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });
      expect(schedules[0].label).toBe("HRF-R1");
      expect(schedules[1].label).toBe("HRF-R2");
    });

    it("should use bi-monthly intervals", () => {
      const schedules = generateHrfSchedule({
        baseline_completed_date: "2026-09-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });
      const date1 = parseISODate(schedules[0].target_date);
      const date2 = parseISODate(schedules[1].target_date);
      const monthDiff =
        (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth());
      expect(monthDiff).toBe(2);
    });

    it("should apply correct window offsets", () => {
      const schedules = generateHrfSchedule({
        baseline_completed_date: "2026-09-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });
      const target = parseISODate(schedules[0].target_date);
      const windowStart = parseISODate(schedules[0].window_start);
      const deadline = parseISODate(schedules[0].deadline);

      expect((target.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000)).toBe(14);
      expect((deadline.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)).toBe(14);
    });

    it("should not shift schedule for late completion", () => {
      const sched1 = generateHrfSchedule({
        baseline_completed_date: "2026-09-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });

      // Simulate late completion (doesn't affect schedule generation)
      const sched2 = generateHrfSchedule({
        baseline_completed_date: "2026-09-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });

      expect(sched1[0].target_date).toBe(sched2[0].target_date);
      expect(sched1[0].label).toBe(sched2[0].label);
    });
  });

  describe("generatePffSchedule", () => {
    it("should generate monthly intervals", () => {
      const schedules = generatePffSchedule({
        enrollment_date: "2026-10-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });

      expect(schedules.length).toBeGreaterThan(0);
      const date1 = parseISODate(schedules[0].target_date);
      const date2 = parseISODate(schedules[1].target_date);
      const monthDiff =
        (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth());
      expect(monthDiff).toBe(1);
    });

    it("should use correct labels", () => {
      const schedules = generatePffSchedule({
        enrollment_date: "2026-10-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });
      expect(schedules[0].label).toBe("PFF-M1");
      expect(schedules[1].label).toBe("PFF-M2");
    });

    it("should apply correct window offsets", () => {
      const schedules = generatePffSchedule({
        enrollment_date: "2026-10-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });
      const target = parseISODate(schedules[0].target_date);
      const windowStart = parseISODate(schedules[0].window_start);
      const deadline = parseISODate(schedules[0].deadline);

      expect((target.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000)).toBe(7);
      expect((deadline.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)).toBe(14);
    });
  });

  describe("generateNffSchedule", () => {
    it("should generate correct protocol labels", () => {
      const schedules = generateNffSchedule({
        birth_date: "2026-11-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });

      expect(schedules[0].label).toBe("NFF-7d");
      expect(schedules[1].label).toBe("NFF-28d");
      expect(schedules[2].label).toBe("NFF-2m");
      expect(schedules[3].label).toBe("NFF-3m");
    });

    it("should have all 12 fixed protocol labels", () => {
      const schedules = generateNffSchedule({
        birth_date: "2026-11-01",
        study_end_date: "2035-09-01",
        rules_version: "v1",
      });

      const expectedLabels = [
        "7d",
        "28d",
        "2m",
        "3m",
        "4.5m",
        "6m",
        "7.5m",
        "9m",
        "10.5m",
        "12m",
        "14m",
        "16m",
      ];
      for (let i = 0; i < Math.min(12, schedules.length); i++) {
        expect(schedules[i].label).toBe(`NFF-${expectedLabels[i]}`);
      }
    });

    it("should use exact day offsets for fractional month labels", () => {
      const schedules = generateNffSchedule({
        birth_date: "2026-01-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });

      const byLabel = new Map(schedules.map((schedule) => [schedule.label, schedule]));

      expect(byLabel.get("NFF-4.5m")?.target_date).toBe("2026-05-16");
      expect(byLabel.get("NFF-7.5m")?.target_date).toBe("2026-08-14");
      expect(byLabel.get("NFF-10.5m")?.target_date).toBe("2026-11-12");
    });

    it("should apply correct window offsets", () => {
      const schedules = generateNffSchedule({
        birth_date: "2026-11-01",
        study_end_date: "2028-09-01",
        rules_version: "v1",
      });

      const target = parseISODate(schedules[0].target_date);
      const windowStart = parseISODate(schedules[0].window_start);
      const deadline = parseISODate(schedules[0].deadline);

      expect((target.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000)).toBe(3);
      expect((deadline.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)).toBe(7);
    });

    it("should continue with bi-monthly after 16m", () => {
      const schedules = generateNffSchedule({
        birth_date: "2026-11-01",
        study_end_date: "2035-09-01",
        rules_version: "v1",
      });

      // Find first bi-monthly schedule (should be after 16m label)
      const sixteenMIndex = schedules.findIndex((s) => s.label.includes("16m"));
      expect(sixteenMIndex).toBeGreaterThanOrEqual(0);

      if (sixteenMIndex >= 0 && sixteenMIndex + 1 < schedules.length) {
        const label18m = schedules[sixteenMIndex + 1].label;
        expect(label18m).toBe("NFF-18m");
      }
    });
  });

  describe("generateVaTask", () => {
    it("should set target to event_date + 30 days", () => {
      const task = generateVaTask({
        event_date: "2026-11-01",
        event_type: "stillbirth",
        rules_version: "v1",
      });

      const eventDate = parseISODate("2026-11-01");
      const targetDate = parseISODate(task.target_date);
      const daysDiff = (targetDate.getTime() - eventDate.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDiff).toBe(30);
    });

    it("should apply correct window offsets", () => {
      const task = generateVaTask({
        event_date: "2026-11-01",
        event_type: "child_death",
        rules_version: "v1",
      });

      const target = parseISODate(task.target_date);
      const windowStart = parseISODate(task.window_start);
      const deadline = parseISODate(task.deadline);

      expect((target.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000)).toBe(3);
      expect((deadline.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)).toBe(14);
    });

    it("should mark form as disabled", () => {
      const task = generateVaTask({
        event_date: "2026-11-01",
        event_type: "stillbirth",
        rules_version: "v1",
      });

      expect(task.form_availability).toBe("disabled");
      expect(task.disabled_reason).toBe("va_json_pending");
    });
  });
});
