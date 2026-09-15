export const HHQ_INITIAL_PAGE_NAME = "page_01_identification";

/**
 * A newly opened HHQ is not a draft until the interviewer explicitly saves it
 * or successfully advances beyond Section 1. Existing drafts keep normal
 * autosave/background-save behavior.
 */
export function shouldPersistHhqDraft({
  currentPageName,
  hasPersistedDraft = false,
  manual = false,
  reason = "",
} = {}) {
  if (hasPersistedDraft || manual || reason === "final-submit") return true;
  return reason === "next" && currentPageName !== HHQ_INITIAL_PAGE_NAME;
}
