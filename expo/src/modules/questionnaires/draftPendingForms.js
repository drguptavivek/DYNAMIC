export function getDraftSiteId(draft) {
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
