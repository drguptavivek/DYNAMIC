/**
 * Derives section navigation, applicability, progress, and preview state from Survey Core.
 */
export const HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME = "hhq_household_member_summary";
export const HOUSEHOLD_MEMBER_SUMMARY_SECTION_TITLE = "02B-HOUSEHOLD MEMBER SUMMARY";
export const COMPACT_PREVIEW_SECTION_NAME = "compact_preview";
export const COMPACT_PREVIEW_SECTION_TITLE = "PREVIEW";

const LOGICAL_SECTION_BY_PAGE_NAME = Object.freeze({
  page_02_reproduction: "page_02_reproduction",
  page_02a_pregnancy_history: "page_02_reproduction",
  page_02b_reproduction_follow_up: "page_02_reproduction",
  page_02c_reproduction_confirmation: "page_02_reproduction",
  page_02d_reproduction_comparison: "page_02_reproduction",
  page_02e_reproduction_after_comparison: "page_02_reproduction",
});

export function getLogicalSurveySectionName(pageName) {
  return LOGICAL_SECTION_BY_PAGE_NAME[pageName] || pageName;
}

export function getLogicalSurveySectionPosition(model, page = model?.currentPage) {
  const logicalPageNames = [];
  (model?.visiblePages || []).forEach((visiblePage) => {
    const logicalName = getLogicalSurveySectionName(visiblePage.name);
    if (!logicalPageNames.includes(logicalName)) logicalPageNames.push(logicalName);
  });
  const currentLogicalName = getLogicalSurveySectionName(page?.name);
  return {
    index: Math.max(logicalPageNames.indexOf(currentLogicalName), 0),
    total: logicalPageNames.length,
  };
}

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
  const currentLogicalSectionName = getLogicalSurveySectionName(currentPageName);
  const pageSections = model.pages.map((page, index) => {
    const questions = getSectionQuestions(page);
    const answered = questions.filter((question) => hasAnswer(getQuestionValue(model, question))).length;
    const hasErrors = questions.some(
      (question) =>
        (Array.isArray(question.errors) && question.errors.length > 0) ||
        (Array.isArray(question.items) &&
          question.items.some((item) => ((item.editor ?? item)?.errors ?? []).length > 0))
    );
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
      isCurrent: getLogicalSurveySectionName(page.name) === currentLogicalSectionName,
    };
  });
  const sections = [];
  const logicalSections = new Map();

  pageSections.forEach((pageSection) => {
    const logicalName = getLogicalSurveySectionName(pageSection.name);
    if (logicalName === pageSection.name && !LOGICAL_SECTION_BY_PAGE_NAME[pageSection.name]) {
      sections.push(pageSection);
      return;
    }

    const existing = logicalSections.get(logicalName);
    if (!existing) {
      const logicalSection = {
        ...pageSection,
        name: logicalName,
        title: pageSection.title,
        answered: pageSection.applicable ? pageSection.answered : 0,
        total: pageSection.applicable ? pageSection.total : 0,
      };
      logicalSections.set(logicalName, logicalSection);
      sections.push(logicalSection);
      return;
    }

    if (pageSection.applicable) {
      existing.answered += pageSection.answered;
      existing.total += pageSection.total;
    }
    existing.applicable = existing.applicable || pageSection.applicable;
    existing.hasErrors = existing.hasErrors || pageSection.hasErrors;
    existing.isCurrent = existing.isCurrent || pageSection.isCurrent;
  });

  logicalSections.forEach((section) => {
    section.status = getSectionStatus(section);
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
