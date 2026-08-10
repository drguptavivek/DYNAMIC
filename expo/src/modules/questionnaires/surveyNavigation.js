/**
 * Derives section navigation, applicability, progress, and preview state from Survey Core.
 */
export const HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME = "hhq_household_member_summary";
export const HOUSEHOLD_MEMBER_SUMMARY_SECTION_TITLE = "02B-HOUSEHOLD MEMBER SUMMARY";
export const COMPACT_PREVIEW_SECTION_NAME = "compact_preview";
export const COMPACT_PREVIEW_SECTION_TITLE = "PREVIEW";

function getQuestionValue(model, question) {
  if (!question?.name) return undefined;
  if (question.value !== undefined) return question.value;
  return model.getValue(question.name);
}

function hasAnswer(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== undefined && value !== null && value !== "";
}

function getPageQuestions(page) {
  if (typeof page.getAllQuestions === "function") {
    return page.getAllQuestions();
  }
  return Array.isArray(page.questions) ? page.questions : [];
}

function isAnswerableQuestion(question) {
  const type = question?.getType?.() || question?.type;
  return (
    question?.isVisible !== false &&
    !question?.isReadOnly &&
    !question?.readOnly &&
    type !== "html" &&
    type !== "paneldynamic"
  );
}

function getSectionQuestions(page) {
  return getPageQuestions(page).flatMap((question) => {
    const type = question?.getType?.() || question?.type;
    if (type !== "paneldynamic") return isAnswerableQuestion(question) ? [question] : [];
    if (question?.isVisible === false) return [];
    return (question.panels || []).flatMap((panel) =>
      (panel.questions || []).filter(isAnswerableQuestion)
    );
  });
}

function getSectionStatus({ applicable, answered, total, hasErrors }) {
  if (!applicable) return "not_applicable";
  if (hasErrors) return "needs_attention";
  if (!answered) return "pending";
  if (answered >= total) return "complete";
  return "in_progress";
}

function getLocalizedTitle(page) {
  const rendered = page?.locTitle?.renderedHtml || page?.locTitle?.text;
  if (rendered) return rendered;
  if (typeof page?.title === "string" && page.title) return page.title;
  return page?.name || "Section";
}

export function getCurrentPageName(model) {
  return model?.currentPage?.name || null;
}

export function goToSurveySection(model, pageName) {
  if (!model || !pageName) return false;
  const visiblePages = model.visiblePages || [];
  const visiblePageIndex = visiblePages.findIndex((page) => page.name === pageName);
  if (visiblePageIndex < 0) return false;
  model.currentPage = visiblePages[visiblePageIndex];
  return true;
}

export function buildSurveySections(model, options = {}) {
  if (!model?.pages) return [];
  const currentPageName = getCurrentPageName(model);
  const sections = model.pages.map((page, index) => {
    const questions = getSectionQuestions(page);
    const answered = questions.filter((question) => hasAnswer(getQuestionValue(model, question))).length;
    const hasErrors = questions.some((question) => Array.isArray(question.errors) && question.errors.length > 0);
    const applicable = page.isVisible !== false && questions.length > 0;

    return {
      index,
      name: page.name,
      title: getLocalizedTitle(page),
      answered,
      total: questions.length,
      hasErrors,
      applicable,
      status: getSectionStatus({ applicable, answered, total: questions.length, hasErrors }),
      isCurrent: page.name === currentPageName,
    };
  });

  if (options.includeHouseholdMemberSummary) {
    const insertAfterIndex = sections.findIndex(
      (section) =>
        section.name === "page_02_household_schedule" ||
        section.title === "02-HOUSEHOLD SCHEDULE",
    );
    const scheduleSection = sections[insertAfterIndex];
    const summaryApplicable = scheduleSection?.applicable ?? true;
    const summarySection = {
      index: insertAfterIndex >= 0 ? insertAfterIndex + 0.5 : sections.length,
      name: HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME,
      title: HOUSEHOLD_MEMBER_SUMMARY_SECTION_TITLE,
      answered: summaryApplicable && options.householdMemberSummaryConfirmed ? 1 : 0,
      total: 1,
      hasErrors: false,
      applicable: summaryApplicable,
      status: summaryApplicable
        ? options.householdMemberSummaryConfirmed
          ? "complete"
          : "pending"
        : "not_applicable",
      isCurrent: options.currentSectionName === HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME,
    };
    if (summarySection.isCurrent) {
      sections.forEach((section) => {
        section.isCurrent = false;
      });
    }
    sections.splice(insertAfterIndex >= 0 ? insertAfterIndex + 1 : sections.length, 0, summarySection);
  }

  if (options.includeCompactPreview) {
    const previewSection = {
      index: sections.length,
      name: COMPACT_PREVIEW_SECTION_NAME,
      title: COMPACT_PREVIEW_SECTION_TITLE,
      answered: options.compactPreviewConfirmed ? 1 : 0,
      total: 1,
      hasErrors: false,
      applicable: true,
      status: options.compactPreviewConfirmed ? "complete" : "pending",
      isCurrent: options.currentSectionName === COMPACT_PREVIEW_SECTION_NAME,
      // Preview remains navigable in the detailed drawer, but it is an action/review gate,
      // not a questionnaire section represented by the compact progress dots.
      showInCompactProgress: false,
    };
    if (previewSection.isCurrent) {
      sections.forEach((section) => {
        section.isCurrent = false;
      });
    }
    sections.push(previewSection);
  }

  return sections;
}

export function calculateSurveyProgress(model) {
  const sections = buildSurveySections(model);
  const totals = sections.reduce(
    (summary, section) => ({
      answered: summary.answered + section.answered,
      total: summary.total + section.total,
    }),
    { answered: 0, total: 0 },
  );
  return {
    ...totals,
    percent: totals.total ? Math.round((totals.answered / totals.total) * 100) : 0,
  };
}
