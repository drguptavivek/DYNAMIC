/** Resolves PEF source-response data without owning storage or workflow state. */

const PEF_SOURCE_FORM_CODES = new Set(["WQ", "BWQ", "PSF"]);
export const PEF_ON_SPOT_UPT_RESULT_FIELD = "pef_on_spot_upt_result";
export const PEF_NEGATIVE_UPT_VALUE = 2;
export const PEF_OUTCOME_PAGE_NAME = "page_pef_outcome";
export const PEF_WOMAN_ID_FIELD = "pef_woman_hh_member_id";
export const PEF_PREGNANCY_RANK_FIELD = "pef_pregnancy_rank_since_baseline";
export const PEF_PREGNANCY_ID_FIELD = "pef_pregnancy_id";
export const PEF_GESTATION_FIELD = "pef_gestation_unit";
export const PEF_LMP_FIELD = "pef_lmp_start";
export const WQ_LMP_FIELD =
  "wq_02_reproduction_when_did_your_last_menstrual_period_start";
export const PSF_LMP_FIELD = "psf_last_menstrual_period";
const BAREILLY_SITE_ID = 1;

function validPositiveNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
}

/** Returns the originating woman-level LMP answer without sharing object state. */
export function resolvePefLmp(sourceAnswers = {}) {
  const value = sourceAnswers?.[WQ_LMP_FIELD] ?? sourceAnswers?.[PSF_LMP_FIELD];
  if (value === undefined || value === null || value === "") return undefined;
  return value && typeof value === "object" ? { ...value } : value;
}

/** Derives PEF Q14 from the exact/relative LMP answer stored by BWQ or PSF. */
export function derivePefGestationFromLmp(lmp, referenceDate = new Date()) {
  if (!lmp || typeof lmp !== "object") return undefined;

  if (lmp.mode === "relative") {
    const amount = validPositiveNumber(lmp.value);
    if (amount === null) return undefined;
    if (lmp.unit === "days") return { weeks: String(Math.floor(amount / 7)) };
    if (lmp.unit === "weeks") return { weeks: String(Math.floor(amount)) };
    if (lmp.unit === "months") return { months: String(Math.floor(amount)) };
    if (lmp.unit === "years") return { months: String(Math.floor(amount * 12)) };
    return undefined;
  }

  if (lmp.mode !== "date") return undefined;
  const day = Number(lmp.day);
  const month = Number(lmp.month);
  const year = Number(lmp.year);
  const reference = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const lmpDate = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    lmpDate.getUTCFullYear() !== year ||
    lmpDate.getUTCMonth() !== month - 1 ||
    lmpDate.getUTCDate() !== day ||
    Number.isNaN(reference.getTime())
  ) {
    return undefined;
  }
  const referenceUtc = Date.UTC(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  );
  const elapsedDays = Math.floor((referenceUtc - lmpDate.getTime()) / 86_400_000);
  return elapsedDays >= 0 ? { weeks: String(Math.floor(elapsedDays / 7)) } : undefined;
}

export function buildPefClinicalPrefill(sourceAnswers = {}, referenceDate = new Date()) {
  const lmp = resolvePefLmp(sourceAnswers);
  const gestation = derivePefGestationFromLmp(lmp, referenceDate);
  return {
    prefill: {
      ...(lmp !== undefined ? { [PEF_LMP_FIELD]: lmp } : {}),
      ...(gestation !== undefined ? { [PEF_GESTATION_FIELD]: gestation } : {}),
    },
    readOnlyFields: [
      ...(lmp !== undefined ? [PEF_LMP_FIELD] : []),
      ...(gestation !== undefined ? [PEF_GESTATION_FIELD] : []),
    ],
  };
}

export function buildPefPregnancyId(womanId, pregnancyRank) {
  const normalizedWomanId = String(womanId || "").trim();
  const normalizedRank = Number(pregnancyRank);
  if (
    !normalizedWomanId ||
    !Number.isInteger(normalizedRank) ||
    normalizedRank < 1 ||
    normalizedRank > 9
  ) {
    return "";
  }
  return `${normalizedWomanId}${normalizedRank}`;
}

export function applyPefPregnancyId(model) {
  const question = model?.getQuestionByName?.(PEF_PREGNANCY_ID_FIELD);
  if (!question) return "";
  question.readOnly = true;
  const pregnancyId = buildPefPregnancyId(
    model.getValue(PEF_WOMAN_ID_FIELD),
    model.getValue(PEF_PREGNANCY_RANK_FIELD),
  );
  if (model.getValue(PEF_PREGNANCY_ID_FIELD) !== (pregnancyId || undefined)) {
    model.setValue(PEF_PREGNANCY_ID_FIELD, pregnancyId || undefined);
  }
  return pregnancyId;
}

export function shouldRecalculatePefPregnancyId(fieldName) {
  return fieldName === PEF_WOMAN_ID_FIELD || fieldName === PEF_PREGNANCY_RANK_FIELD;
}

export function isPefNegativeUptAnswers(answers = {}) {
  return Number(answers?.[PEF_ON_SPOT_UPT_RESULT_FIELD]) === PEF_NEGATIVE_UPT_VALUE;
}

function parseSiteId(value) {
  if (value === undefined || value === null || value === "") return null;
  const numericValue = Number(String(value).split("-")[0]);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function derivePefSiteId(taskContext, prefillData, user) {
  for (const value of [
    taskContext?.site_id,
    taskContext?.assigned_site_id,
    taskContext?.payload?.site_id,
    prefillData?.site_id,
    prefillData?.hhq_site_id,
    taskContext?.household_id,
    taskContext?.payload?.household_id,
    prefillData?.household_id,
    prefillData?.hhq_household_id,
    taskContext?.subject_id,
    taskContext?.woman_id,
    user?.site_id,
  ]) {
    const siteId = parseSiteId(value);
    if (siteId !== null) return siteId;
  }
  return null;
}

export function applyPefOnSpotUptSiteVisibility(
  model,
  { taskContext, prefillData, user } = {},
) {
  const question = model?.getQuestionByName?.(PEF_ON_SPOT_UPT_RESULT_FIELD);
  if (!question) return false;
  const visibleAtSite = derivePefSiteId(taskContext, prefillData, user) === BAREILLY_SITE_ID;
  question.visible = visibleAtSite;
  if (!visibleAtSite) {
    model?.setValue?.(PEF_ON_SPOT_UPT_RESULT_FIELD, undefined);
  }
  return visibleAtSite;
}

function responseIds(response) {
  return [response?.id, response?.form_response_id, response?.submission_id]
    .map((value) => String(value || ""))
    .filter(Boolean);
}

export function findPefSourceResponse(responses = [], task = null) {
  const candidates = Array.isArray(responses) ? responses : [];
  const linkedIds = [
    task?.source_form_response_id,
    task?.source_response_id,
    task?.source_event_id,
  ]
    .map((value) => String(value || ""))
    .filter(Boolean);

  const linked = linkedIds.length
    ? candidates.find((response) => responseIds(response).some((id) => linkedIds.includes(id)))
    : null;
  if (linked) return linked;

  // Server-generated WQ PEF tasks point at the pregnancy-detected event. When
  // that event is not stored on the device, use the newest source form already
  // scoped to this woman by the caller.
  return candidates.find((response) =>
    PEF_SOURCE_FORM_CODES.has(String(response?.form_code || "").toUpperCase()),
  ) || null;
}

export function resolvePefHusbandName(member, sourceAnswers = {}) {
  return String(
    sourceAnswers?.wq_husband_partner_name ||
      sourceAnswers?.psf_husband_name ||
      member?.husband_name ||
      "",
  ).trim();
}
