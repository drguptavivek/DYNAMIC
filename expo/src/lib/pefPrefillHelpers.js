/** Resolves PEF source-response data without owning storage or workflow state. */

const PEF_SOURCE_FORM_CODES = new Set(["WQ", "BWQ", "PSF"]);
export const PEF_ON_SPOT_UPT_RESULT_FIELD = "pef_on_spot_upt_result";
export const PEF_NEGATIVE_UPT_VALUE = 2;
export const PEF_OUTCOME_PAGE_NAME = "page_pef_outcome";
export const PEF_WOMAN_ID_FIELD = "pef_woman_hh_member_id";
export const PEF_PREGNANCY_RANK_FIELD = "pef_pregnancy_rank_since_baseline";
export const PEF_PREGNANCY_ID_FIELD = "pef_pregnancy_id";
const BAREILLY_SITE_ID = 1;

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
