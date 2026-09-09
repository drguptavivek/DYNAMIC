/**
 * Display names for form codes. The internal codes (form_code, task_type,
 * draft/submission ids, sync payloads) stay as they are; only what the
 * interviewer sees on screen is renamed.
 */
const FORM_DISPLAY_CODES = {
  HHQ: "BHQ", // Baseline Household Questionnaire
  WQ: "BWQ", // Baseline Woman's Questionnaire
};

export function getFormDisplayCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return code === undefined || code === null ? "" : String(code);
  return FORM_DISPLAY_CODES[normalized] || normalized;
}
