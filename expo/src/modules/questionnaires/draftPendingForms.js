// Matching helpers below read household/subject/site identity from the
// dedicated questionnaire_drafts columns (household_id, site_id, woman_id,
// etc.) when a row carries them, and only fall back to parsing json_payload
// when a column is null/undefined. The columns are populated by
// deriveDraftIndexFields() below (written on every persistDraft() call, and
// backfilled once for pre-existing rows by taskSchema.js), so the payload
// path only matters for legacy/edge-case rows that predate the backfill, or
// hand-built draft-like objects (tests, in-memory candidates) that never
// went through persistDraft.
export function getDraftSiteId(draft) {
  if (draft?.site_id !== undefined && draft?.site_id !== null && draft?.site_id !== "") {
    const parsed = Number(draft.site_id);
    return Number.isFinite(parsed) ? parsed : String(draft.site_id);
  }

  const answers = draft?.json_payload || {};
  const siteFromPayload = answers.hhq_site_id ?? answers.site_id;
  if (siteFromPayload !== undefined && siteFromPayload !== null && siteFromPayload !== "") {
    const parsed = Number(siteFromPayload);
    return Number.isFinite(parsed) ? parsed : String(siteFromPayload);
  }

  const householdId = answers.hhq_household_id || draft?.subject_id || "";
  const firstPart = String(householdId).split("-")[0];
  const parsed = Number(firstPart);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeHouseholdIdPart(value, width) {
  const text = normalizeId(value);
  return text && width ? text.padStart(width, "0") : text;
}

function householdIdFromIndividualId(value) {
  const parts = normalizeId(value).split("-");
  if (parts.length >= 5) return parts.slice(0, 4).join("-");
  return "";
}

export function getDraftSubjectId(draft) {
  if (draft?.woman_id) return normalizeId(draft.woman_id);

  const answers = draft?.json_payload || {};
  return normalizeId(
    answers.wq_enter_structure_id_woman ||
      answers.individual_id ||
      answers.woman_id ||
      answers.subject_id ||
      draft?.subject_id,
  );
}

export function getDraftHouseholdId(draft) {
  if (draft?.household_id) return normalizeId(draft.household_id);

  const answers = draft?.json_payload || {};
  if (answers.hhq_household_id) return normalizeId(answers.hhq_household_id);
  if (answers.household_id) return normalizeId(answers.household_id);
  const siteId = normalizeHouseholdIdPart(answers.hhq_site_id);
  const localityCode = normalizeHouseholdIdPart(answers.hhq_locality_code, 2);
  const rawStructureNumber = String(answers.hhq_structure_map_id || "").trim().toUpperCase();
  if (rawStructureNumber && !/^[A-Z0-9]{1,6}$/.test(rawStructureNumber)) {
    return draft?.subject_id ? normalizeId(draft.subject_id) : "";
  }
  const structureNumber = /^\d+$/.test(rawStructureNumber) && rawStructureNumber.length < 4
    ? rawStructureNumber.padStart(4, "0")
    : rawStructureNumber;
  const householdNumber = normalizeHouseholdIdPart(answers.hhq_household_number, 2);
  if (siteId && localityCode && structureNumber && householdNumber) {
    return [siteId, localityCode, structureNumber, householdNumber].join("-");
  }
  const subjectHouseholdId = householdIdFromIndividualId(getDraftSubjectId(draft));
  if (subjectHouseholdId) return subjectHouseholdId;
  return draft?.subject_id ? normalizeId(draft.subject_id) : "";
}

export function getDraftComparableIds(draft) {
  return new Set(
    [
      draft?.task_id,
      draft?.draft_id,
      draft?.draft_key,
      draft?.subject_id,
      getDraftSubjectId(draft),
      getDraftHouseholdId(draft),
    ]
      .map(normalizeId)
      .filter(Boolean),
  );
}

export function draftMatchesTask(draft, task) {
  if (!draft || !task) return false;
  if (String(draft.form_code || "").toUpperCase() !== String(task.task_type || "").toUpperCase()) {
    return false;
  }
  const draftIds = getDraftComparableIds(draft);
  return [
    task.id,
    task.task_id,
    task.task_key,
    task.household_id,
    task.subject_id,
  ].some((value) => draftIds.has(normalizeId(value)));
}

export function filterDraftsForTaskCandidates(drafts = [], tasks = []) {
  return drafts.filter((draft) => tasks.some((task) => draftMatchesTask(draft, task)));
}

export function filterDraftsForUserSite(drafts, user) {
  const userSiteId = Number(user?.site_id);
  if (!Number.isFinite(userSiteId)) return [];
  return drafts.filter((draft) => Number(getDraftSiteId(draft)) === userSiteId);
}

// Used by deriveDraftIndexFields() (answer_count column) and by
// DraftPendingFormsScreen as a fallback when a row's answer_count column is
// not yet populated.
export function isMeaningfulDraftValue(value) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(isMeaningfulDraftValue);
  if (typeof value === "object") return Object.values(value).some(isMeaningfulDraftValue);
  return true;
}

export function countDraftAnswers(draft) {
  return Object.values(draft?.json_payload || {}).filter(isMeaningfulDraftValue).length;
}

// Computes the questionnaire_drafts index columns (household_id, site_id,
// locality_code, woman_id, structure_map_id, household_number, answer_count,
// respondent_label) from a draft's json_payload plus its existing columns.
// Reuses the same matching helpers the worklist/task-matching code calls, so
// the persisted column values are always identical to what those helpers
// would compute on the fly from the payload. Used by persistDraft() (every
// write) and by the one-time backfill in taskSchema.js (for pre-existing
// rows whose columns are still null).
export function deriveDraftIndexFields(draft) {
  const answers = draft?.json_payload || {};

  const householdId = getDraftHouseholdId(draft) || null;

  const rawSiteId = getDraftSiteId(draft);
  const siteId =
    rawSiteId === null || rawSiteId === undefined || rawSiteId === "" ? null : String(rawSiteId);

  const localityCode =
    answers.hhq_locality_code !== undefined &&
    answers.hhq_locality_code !== null &&
    answers.hhq_locality_code !== ""
      ? normalizeHouseholdIdPart(answers.hhq_locality_code, 2)
      : null;

  const womanIdSource = answers.wq_enter_structure_id_woman || answers.individual_id || answers.woman_id;
  const womanId = womanIdSource ? normalizeId(womanIdSource) : null;

  const structureMapId =
    answers.hhq_structure_map_id !== undefined &&
    answers.hhq_structure_map_id !== null &&
    answers.hhq_structure_map_id !== ""
      ? String(answers.hhq_structure_map_id).trim().toUpperCase()
      : null;

  const householdNumber =
    answers.hhq_household_number !== undefined &&
    answers.hhq_household_number !== null &&
    answers.hhq_household_number !== ""
      ? normalizeId(answers.hhq_household_number)
      : null;

  const answerCount = countDraftAnswers(draft);

  const subjectIdFallback = normalizeId(draft?.subject_id);
  const respondentLabel = householdId || subjectIdFallback || draft?.draft_id || null;

  return {
    household_id: householdId,
    site_id: siteId,
    locality_code: localityCode,
    woman_id: womanId,
    structure_map_id: structureMapId,
    household_number: householdNumber,
    answer_count: answerCount,
    respondent_label: respondentLabel,
  };
}
