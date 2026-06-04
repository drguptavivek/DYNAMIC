import { inferDob } from "../dob";

describe("DOB inference", () => {
  describe("inferDob", () => {
    it("exact date input → precision = exact_date", () => {
      const exactDate = new Date("1990-05-15");
      const result = inferDob({ date_of_birth: exactDate });
      expect(result.date_of_birth).toEqual(exactDate);
      expect(result.date_of_birth_precision).toBe("exact_date");
      expect(result.dob_inference_rule_version).toBe("v1");
    });

    it("exact date as ISO string input → precision = exact_date", () => {
      const result = inferDob({ date_of_birth: "1990-05-15" });
      expect(result.date_of_birth.toISOString()).toContain("1990-05-15");
      expect(result.date_of_birth_precision).toBe("exact_date");
      expect(result.dob_inference_rule_version).toBe("v1");
    });

    it("age + as_of_date → precision = inferred_from_age, year correct", () => {
      const asOfDate = new Date("2026-09-01");
      const result = inferDob({
        reported_age_years: 25,
        reported_age_as_of_date: asOfDate,
      });
      // Expected DOB year: 2026 - 25 = 2001, mid-year (July 1)
      expect(result.date_of_birth.getFullYear()).toBe(2001);
      expect(result.date_of_birth.getMonth()).toBe(6); // July (0-indexed)
      expect(result.date_of_birth.getDate()).toBe(1);
      expect(result.date_of_birth_precision).toBe("inferred_from_age");
      expect(result.dob_inference_rule_version).toBe("v1");
    });

    it("age only → uses today → precision = inferred_from_age", () => {
      const result = inferDob({ reported_age_years: 30 });
      const now = new Date();
      const expectedYear = now.getFullYear() - 30;
      expect(result.date_of_birth.getFullYear()).toBe(expectedYear);
      expect(result.date_of_birth.getMonth()).toBe(6); // July
      expect(result.date_of_birth.getDate()).toBe(1);
      expect(result.date_of_birth_precision).toBe("inferred_from_age");
      expect(result.dob_inference_rule_version).toBe("v1");
    });

    it("handles age 0", () => {
      const asOfDate = new Date("2026-09-01");
      const result = inferDob({
        reported_age_years: 0,
        reported_age_as_of_date: asOfDate,
      });
      // Expected DOB year: 2026 - 0 = 2026, mid-year (July 1)
      expect(result.date_of_birth.getFullYear()).toBe(2026);
      expect(result.date_of_birth.getMonth()).toBe(6);
      expect(result.date_of_birth_precision).toBe("inferred_from_age");
    });

    it("no inputs → throws Error", () => {
      expect(() => inferDob({})).toThrow("Cannot infer DOB: insufficient data");
    });

    it("null inputs → throws Error", () => {
      expect(() =>
        inferDob({
          date_of_birth: null,
          reported_age_years: null,
        }),
      ).toThrow("Cannot infer DOB: insufficient data");
    });

    it("only reported_age_as_of_date without age → throws Error", () => {
      expect(() =>
        inferDob({
          reported_age_as_of_date: new Date(),
          reported_age_years: null,
        }),
      ).toThrow("Cannot infer DOB: insufficient data");
    });

    it("age takes priority over date_of_birth when both provided", () => {
      const exactDate = new Date("1990-05-15");
      const asOfDate = new Date("2026-09-01");
      const result = inferDob({
        date_of_birth: exactDate,
        reported_age_years: 25,
        reported_age_as_of_date: asOfDate,
      });
      // exact_date has priority, so should return the provided date
      expect(result.date_of_birth).toEqual(exactDate);
      expect(result.date_of_birth_precision).toBe("exact_date");
    });

    it("ISO string as_of_date is parsed correctly", () => {
      const result = inferDob({
        reported_age_years: 25,
        reported_age_as_of_date: "2026-09-01",
      });
      expect(result.date_of_birth.getFullYear()).toBe(2001);
      expect(result.date_of_birth_precision).toBe("inferred_from_age");
    });
  });
});
