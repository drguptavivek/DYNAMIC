import { buildHouseholdId, buildMemberID, buildChildId, buildTaskKey } from "../ids";

describe("ID construction functions", () => {
  describe("buildHouseholdId", () => {
    it("produces correct format", () => {
      const result = buildHouseholdId({
        site_id: 1,
        locality_code: "LC01",
        structure_map_id: "0023",
        household_number: "01",
      });
      expect(result).toBe("1-LC01-0023-01");
    });

    it("handles different site IDs", () => {
      const result = buildHouseholdId({
        site_id: 42,
        locality_code: "LC02",
        structure_map_id: "0100",
        household_number: "05",
      });
      expect(result).toBe("42-LC02-0100-05");
    });

    it("is deterministic - same inputs always produce same output", () => {
      const params = {
        site_id: 1,
        locality_code: "LC01",
        structure_map_id: "0023",
        household_number: "01",
      };
      const result1 = buildHouseholdId(params);
      const result2 = buildHouseholdId(params);
      expect(result1).toBe(result2);
    });
  });

  describe("buildMemberID", () => {
    it("zero-pads member_number to 2 digits", () => {
      const result = buildMemberID({
        household_id: "1-LC01-0023-01",
        member_number: 3,
      });
      expect(result).toBe("1-LC01-0023-01-03");
    });

    it("does not pad already 2-digit numbers", () => {
      const result = buildMemberID({
        household_id: "1-LC01-0023-01",
        member_number: 12,
      });
      expect(result).toBe("1-LC01-0023-01-12");
    });

    it("pads single digit numbers with leading zero", () => {
      const result = buildMemberID({
        household_id: "1-LC01-0023-01",
        member_number: 1,
      });
      expect(result).toBe("1-LC01-0023-01-01");
    });

    it("is deterministic - same inputs always produce same output", () => {
      const params = {
        household_id: "1-LC01-0023-01",
        member_number: 3,
      };
      const result1 = buildMemberID(params);
      const result2 = buildMemberID(params);
      expect(result1).toBe(result2);
    });
  });

  describe("buildChildId", () => {
    it("uses correct format with birth_rank", () => {
      const result = buildChildId({
        pregnancy_id: "preg-uuid-123",
        birth_rank: 1,
      });
      expect(result).toBe("preg-uuid-123-B1");
    });

    it("handles different birth ranks", () => {
      const result = buildChildId({
        pregnancy_id: "preg-uuid-456",
        birth_rank: 3,
      });
      expect(result).toBe("preg-uuid-456-B3");
    });

    it("is deterministic - same inputs always produce same output", () => {
      const params = {
        pregnancy_id: "preg-uuid-123",
        birth_rank: 1,
      };
      const result1 = buildChildId(params);
      const result2 = buildChildId(params);
      expect(result1).toBe(result2);
    });
  });

  describe("buildTaskKey", () => {
    it("produces pipe-delimited deterministic key", () => {
      const result = buildTaskKey({
        household_id: "1-LC01-0023-01",
        subject_type: "woman",
        subject_id: "1-LC01-0023-01-03",
        task_type: "HRF",
        protocol_visit_label: "HRF-R1",
        target_date: "2026-09-01",
        rules_version: "v1",
      });
      expect(result).toBe("1-LC01-0023-01|woman|1-LC01-0023-01-03|HRF|HRF-R1|2026-09-01|v1");
    });

    it("includes all parameters in correct order", () => {
      const result = buildTaskKey({
        household_id: "hid123",
        subject_type: "pregnancy",
        subject_id: "preg456",
        task_type: "PFF",
        protocol_visit_label: "PFF-Visit1",
        target_date: "2026-10-15",
        rules_version: "v2",
      });
      expect(result).toBe("hid123|pregnancy|preg456|PFF|PFF-Visit1|2026-10-15|v2");
    });

    it("is deterministic - same inputs always produce same output", () => {
      const params = {
        household_id: "1-LC01-0023-01",
        subject_type: "woman",
        subject_id: "1-LC01-0023-01-03",
        task_type: "HRF",
        protocol_visit_label: "HRF-R1",
        target_date: "2026-09-01",
        rules_version: "v1",
      };
      const result1 = buildTaskKey(params);
      const result2 = buildTaskKey(params);
      expect(result1).toBe(result2);
    });
  });
});
