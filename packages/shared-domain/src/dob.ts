// DOB precision logic
import type { DobPrecision } from "./types";

export interface DobInferenceInput {
  date_of_birth?: Date | string | null;
  reported_age_years?: number | null;
  reported_age_as_of_date?: Date | string | null;
}

export interface DobInferenceResult {
  date_of_birth: Date;
  date_of_birth_precision: DobPrecision;
  dob_inference_rule_version: string;
}

const parseDate = (d: Date | string | null | undefined): Date | null => {
  if (!d) return null;
  if (d instanceof Date) return d;
  return new Date(d);
};

export const inferDob = (input: DobInferenceInput): DobInferenceResult => {
  // Exact date takes priority
  const exactDate = parseDate(input.date_of_birth);
  if (exactDate && exactDate.toString() !== "Invalid Date") {
    return {
      date_of_birth: exactDate,
      date_of_birth_precision: "exact_date",
      dob_inference_rule_version: "v1",
    };
  }

  // Age-based inference
  if (input.reported_age_years !== null && input.reported_age_years !== undefined) {
    const asOfDate = parseDate(input.reported_age_as_of_date) || new Date();
    const year = asOfDate.getFullYear() - input.reported_age_years;
    const dob = new Date(year, 6, 1); // Mid-year: July 1
    return {
      date_of_birth: dob,
      date_of_birth_precision: "inferred_from_age",
      dob_inference_rule_version: "v1",
    };
  }

  // Insufficient data
  throw new Error("Cannot infer DOB: insufficient data");
};
