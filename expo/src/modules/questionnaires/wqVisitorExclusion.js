export const WQ_RESIDENCE_DURATION_FIELD =
  "wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously";
export const WQ_VISITOR_VALUE = 96;
export const WQ_VISITOR_EXCLUDED_FIELD = "wq_visitor_excluded";
export const WQ_VISITOR_EXCLUDED_STATUS = "wq_visitor_excluded";
export const WQ_VISITOR_CORRECTION_DRAFT_STATUS_PREFIX =
  `${WQ_VISITOR_EXCLUDED_STATUS}:draft:`;
export const WQ_VISITOR_CORRECTION_WINDOW_MS = 10 * 60 * 1000;

export function isWqVisitorAnswers(answers = {}) {
  return Number(answers?.[WQ_RESIDENCE_DURATION_FIELD]) === WQ_VISITOR_VALUE;
}

export function isLocallyExcludedWqResponse(response) {
  return (
    String(response?.form_code || "").toUpperCase() === "WQ" &&
    (String(response?.server_response_status || "") === WQ_VISITOR_EXCLUDED_STATUS ||
      String(response?.server_response_status || "").startsWith(
        WQ_VISITOR_CORRECTION_DRAFT_STATUS_PREFIX,
      ))
  );
}

export function getWqVisitorCorrectionDraftId(response) {
  const status = String(response?.server_response_status || "");
  return status.startsWith(WQ_VISITOR_CORRECTION_DRAFT_STATUS_PREFIX)
    ? status.slice(WQ_VISITOR_CORRECTION_DRAFT_STATUS_PREFIX.length) || null
    : null;
}

export function buildWqVisitorCorrectionDraftId(responseId) {
  return responseId ? `WQ-correction-${responseId}` : null;
}

export function getWqVisitorCorrectionRemainingMs(response, nowMs = Date.now()) {
  if (String(response?.sync_status || "") !== "pending" || !isLocallyExcludedWqResponse(response)) {
    return 0;
  }
  const submittedAt = new Date(response?.submitted_at || "").getTime();
  if (!Number.isFinite(submittedAt)) return 0;
  return Math.max(0, submittedAt + WQ_VISITOR_CORRECTION_WINDOW_MS - Number(nowMs || 0));
}

export function canCorrectExcludedWqResponse(response, nowMs = Date.now()) {
  return getWqVisitorCorrectionRemainingMs(response, nowMs) > 0;
}

export function formatWqVisitorCorrectionRemaining(response, nowMs = Date.now()) {
  const remainingMs = getWqVisitorCorrectionRemainingMs(response, nowMs);
  if (remainingMs <= 0) return "";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function containsQuestion(elements = [], questionName) {
  return (Array.isArray(elements) ? elements : []).some((element) => {
    if (element?.name === questionName) return true;
    return containsQuestion(element?.elements, questionName) || containsQuestion(element?.templateElements, questionName);
  });
}

export function applyWqVisitorSurveyRouting(surveyJson) {
  if (!surveyJson || !Array.isArray(surveyJson.pages)) return surveyJson;
  const residencePageIndex = surveyJson.pages.findIndex((page) =>
    containsQuestion(page?.elements, WQ_RESIDENCE_DURATION_FIELD),
  );
  const outcomePageIndex = surveyJson.pages.findIndex((page) => page?.name === "page_outcome");
  if (residencePageIndex < 0 || outcomePageIndex < 0) return surveyJson;

  const continueCondition =
    `({${WQ_RESIDENCE_DURATION_FIELD}} empty or {${WQ_RESIDENCE_DURATION_FIELD}} != ${WQ_VISITOR_VALUE})`;
  surveyJson.pages.forEach((page, index) => {
    if (index <= residencePageIndex || index === outcomePageIndex) return;
    page.visibleIf = page.visibleIf ? `(${page.visibleIf}) and ${continueCondition}` : continueCondition;
  });
  const outcomePage = surveyJson.pages[outcomePageIndex];
  const visitorCondition = `{${WQ_RESIDENCE_DURATION_FIELD}} = ${WQ_VISITOR_VALUE}`;
  outcomePage.visibleIf = outcomePage.visibleIf
    ? `(${outcomePage.visibleIf}) or ${visitorCondition}`
    : visitorCondition;
  return surveyJson;
}
