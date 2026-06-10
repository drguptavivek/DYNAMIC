export const HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME = "hhq_household_member_summary";
export const HOUSEHOLD_MEMBER_SUMMARY_SECTION_TITLE = "02B-HOUSEHOLD MEMBER SUMMARY";
export const COMPACT_PREVIEW_SECTION_NAME = "compact_preview";
export const COMPACT_PREVIEW_SECTION_TITLE = "PREVIEW";

function getQuestionValue(model, question) {
  if (!question?.name) return undefined;
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
  const pageIndex = model.pages.findIndex((page) => page.name === pageName);
  if (pageIndex < 0) return false;
  model.currentPageNo = pageIndex;
  return true;
}

export function buildSurveySections(model, options = {}) {
  if (!model?.pages) return [];
  const currentPageName = getCurrentPageName(model);
  const sections = model.pages.map((page, index) => {
    const questions = getPageQuestions(page);
    const answered = questions.filter((question) => hasAnswer(getQuestionValue(model, question))).length;
    const hasErrors = questions.some((question) => Array.isArray(question.errors) && question.errors.length > 0);

    return {
      index,
      name: page.name,
      title: getLocalizedTitle(page),
      answered,
      total: questions.length,
      hasErrors,
      isCurrent: page.name === currentPageName,
    };
  });

  if (options.includeHouseholdMemberSummary) {
    const insertAfterIndex = sections.findIndex(
      (section) =>
        section.name === "page_02_household_schedule" ||
        section.title === "02-HOUSEHOLD SCHEDULE",
    );
    const summarySection = {
      index: insertAfterIndex >= 0 ? insertAfterIndex + 0.5 : sections.length,
      name: HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME,
      title: HOUSEHOLD_MEMBER_SUMMARY_SECTION_TITLE,
      answered: options.householdMemberSummaryConfirmed ? 1 : 0,
      total: 1,
      hasErrors: false,
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
      isCurrent: options.currentSectionName === COMPACT_PREVIEW_SECTION_NAME,
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
