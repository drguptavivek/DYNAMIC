/** Pure value normalization and validation for BWQ Section 1 Q10. */
export const WQ_PROGRESSIVE_DOB_FIELD =
  "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born";

const MODES = new Set(["exact", "month_year", "year", "unknown"]);

export function digitsOnly(value, maxLength) {
  return String(value ?? "").replace(/\D/g, "").slice(0, maxLength);
}

export function sanitizeWqProgressiveDobPart(field, value, maxLength) {
  const digits = digitsOnly(value, maxLength);
  if (field === "month" && digits.length === 2 && Number(digits) > 12) {
    return "12";
  }
  return digits;
}

export function normalizeWqProgressiveDob(value) {
  if (!value || typeof value !== "object") return { mode: "exact" };
  if (MODES.has(value.mode)) return { ...value };
  if (String(value.year ?? "") === "9998") return { mode: "unknown" };
  if (String(value.month ?? "") === "98") {
    return String(value.year ?? "") ? { mode: "year", year: String(value.year) } : { mode: "unknown" };
  }
  if (String(value.day ?? "")) return { ...value, mode: "exact" };
  if (String(value.month ?? "") || String(value.year ?? "")) {
    return { ...value, mode: "month_year" };
  }
  return { mode: "exact" };
}

export function activateWqProgressiveDobMode(value, mode) {
  const current = normalizeWqProgressiveDob(value);
  if (mode === "exact") {
    return {
      mode,
      day: current.mode === "exact" ? String(current.day || "") : "",
      month: current.mode === "unknown" ? "" : String(current.month || ""),
      year: current.mode === "unknown" ? "" : String(current.year || ""),
    };
  }
  if (mode === "month_year") {
    return {
      mode,
      month: current.mode === "unknown" ? "" : String(current.month || ""),
      year: current.mode === "unknown" ? "" : String(current.year || ""),
    };
  }
  if (mode === "year") {
    return { mode, year: current.mode === "unknown" ? "" : String(current.year || "") };
  }
  return { mode: "unknown" };
}

function validYear(value) {
  return /^\d{4}$/.test(String(value || ""));
}

function validMonth(value) {
  return /^(0[1-9]|1[0-2])$/.test(String(value || ""));
}

function validExactDate(value) {
  if (!/^([0-2]\d|3[01])$/.test(String(value.day || ""))) return false;
  if (!validMonth(value.month) || !validYear(value.year)) return false;
  const day = Number(value.day);
  const month = Number(value.month);
  const year = Number(value.year);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateWqProgressiveDob(value) {
  if (value === undefined || value === null || value === "") return null;
  const dob = normalizeWqProgressiveDob(value);
  if (dob.mode === "unknown") return null;
  if (dob.mode === "exact") {
    return validExactDate(dob)
      ? null
      : "Enter a valid date of birth as DD, MM, and YYYY, or select Don't know DOB.";
  }
  if (dob.mode === "month_year") {
    return validMonth(dob.month) && validYear(dob.year)
      ? null
      : "Enter month and year as MM and YYYY, or select Don't know MM/YY.";
  }
  return validYear(dob.year)
    ? null
    : "Enter the birth year as YYYY, or select Don't know anything.";
}
