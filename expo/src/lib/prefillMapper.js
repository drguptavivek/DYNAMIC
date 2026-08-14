/**
 * Prefill mapper - builds read-only fields and prefill data for forms
 * Maps household and member context to SurveyJS field values
 */

function formatLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampBaselineVisitNo(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.min(3, Math.max(1, Math.trunc(numericValue)));
}

function deriveBaselineVisitNo(task) {
  const failedAttemptCount = Number(task?.failed_attempt_count);
  if (!Number.isFinite(failedAttemptCount)) return 1;
  return clampBaselineVisitNo(failedAttemptCount + 1);
}

/**
 * Build prefill for Household Questionnaire (HHQ)
 * Read-only: site_id, locality_code
 */
export function buildHhqPrefill(household, today = new Date()) {
  const prefill = {
    hhq_interview_date: formatLocalIsoDate(today),
  };

  if (!household) {
    return { prefill, readOnlyFields: [] };
  }

  Object.assign(prefill, {
    hhq_site_id: household.site_id,
    hhq_locality_code: household.locality_code,
    hhq_household_head_name: household.household_head_name || household.head_name || "",
    hhq_household_address: household.address || "",
  });

  const readOnlyFields = ["hhq_site_id", "hhq_locality_code"];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Woman Questionnaire (WQ)
 * Read-only: generated woman/household identity fields only
 */
export function buildWqPrefill(member, household, task = null, today = new Date()) {
  if (!household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const womanId = member?.individual_id || task?.subject_id || "";
  const womanName = member?.member_name || task?.subject_name || "";
  const localityLabel = [
    household.locality_name || household.locality_code,
    household.site_name || household.site_id,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" / ");

  const prefill = {
    wq_enter_structure_id_woman: womanId,
    wq_name_woman: womanName,
    wq_household_head_name: household.household_head_name || household.head_name || "",
    wq_village_study_site: localityLabel,
    wq_interview_date: formatLocalIsoDate(today),
    wq_visit_no: deriveBaselineVisitNo(task),
  };

  const readOnlyFields = [
    "wq_enter_structure_id_woman",
    "wq_household_head_name",
    "wq_village_study_site",
    "wq_visit_no",
  ];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Household Rounds Form (HRF)
 * Read-only: household identifiers
 */
export function buildHrfPrefill(household, task) {
  if (!household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const prefill = {
    hrf_household_id: household.household_id,
    hrf_household_head_name: household.household_head_name,
  };

  const readOnlyFields = ["hrf_household_id", "hrf_household_head_name"];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Pregnancy Enrollment Form (PEF)
 * Read-only: woman identifiers
 */
export function buildPefPrefill(member, household) {
  if (!member || !household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const prefill = {
    pef_woman_name: member.member_name,
    pef_woman_hh_member_id: member.individual_id,
  };

  const readOnlyFields = ["pef_woman_name", "pef_woman_hh_member_id"];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Pregnancy Follow-up Form (PFF)
 * Read-only: pregnancy/woman identifiers
 */
export function buildPffPrefill(member, household) {
  if (!member || !household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const prefill = {
    pff_woman_name: member.member_name,
    pff_woman_hh_member_id: member.individual_id,
  };

  const readOnlyFields = ["pff_woman_name", "pff_woman_hh_member_id"];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Pregnancy Outcome Form (POF)
 * Read-only: woman/pregnancy identifiers
 */
export function buildPofPrefill(member, household) {
  if (!member || !household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const prefill = {
    pof_woman_name: member.member_name,
    pof_woman_hh_member_id: member.individual_id,
  };

  const readOnlyFields = ["pof_woman_name", "pof_woman_hh_member_id"];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Birth Assessment Form (BAF)
 * Read-only: woman/child identifiers
 */
export function buildBafPrefill(member, household) {
  if (!member || !household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const prefill = {
    baf_woman_name: member.member_name,
  };

  const readOnlyFields = ["baf_woman_name"];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Neonatal Follow-up Form (NFF)
 * Read-only: child identifiers
 */
export function buildNffPrefill(member, household) {
  if (!member || !household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const prefill = {
    nff_child_name: member.member_name,
    nff_child_id: member.individual_id,
  };

  const readOnlyFields = ["nff_child_name", "nff_child_id"];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Child Death Form (CDF)
 * Read-only: child identifiers
 */
export function buildCdfPrefill(member, household) {
  if (!member || !household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const prefill = {
    cdf_child_name: member.member_name,
  };

  const readOnlyFields = ["cdf_child_name"];

  return { prefill, readOnlyFields };
}

/**
 * Build prefill for Verbal Autopsy Form (VAF)
 * Read-only: deceased identifiers
 */
export function buildVafPrefill(member, household) {
  if (!member || !household) {
    return { prefill: {}, readOnlyFields: [] };
  }

  const prefill = {
    vaf_deceased_name: member.member_name,
  };

  const readOnlyFields = ["vaf_deceased_name"];

  return { prefill, readOnlyFields };
}

/**
 * Dispatcher: builds prefill based on task type
 * Accepts task context with household and member data
 */
export function buildPrefillForTask(task, household, member) {
  if (!task) {
    return { prefill: {}, readOnlyFields: [] };
  }

  switch (task.task_type) {
    case "HHQ":
      return buildHhqPrefill(household);
    case "WQ":
      return buildWqPrefill(member, household, task);
    case "HRF":
      return buildHrfPrefill(household, task);
    case "PEF":
      return buildPefPrefill(member, household);
    case "PFF":
      return buildPffPrefill(member, household);
    case "POF":
      return buildPofPrefill(member, household);
    case "BAF":
      return buildBafPrefill(member, household);
    case "NFF":
      return buildNffPrefill(member, household);
    case "CDF":
      return buildCdfPrefill(member, household);
    case "VAF":
      return buildVafPrefill(member, household);
    default:
      return { prefill: {}, readOnlyFields: [] };
  }
}

function isBlankDraftValue(value) {
  return value === undefined || value === null || value === "";
}

export function mergePrefillIntoBlankValues(existingData, prefillData) {
  const merged = { ...(existingData || {}) };
  if (!prefillData || typeof prefillData !== "object") {
    return merged;
  }

  for (const [key, value] of Object.entries(prefillData)) {
    if (!isBlankDraftValue(value) && isBlankDraftValue(merged[key])) {
      merged[key] = value;
    }
  }

  return merged;
}
