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

function normalizeHouseholdIdPart(value, width) {
  const text = String(value || "").trim();
  return text && width ? text.padStart(width, "0") : text;
}

export function getDraftHouseholdId(draft) {
  const answers = draft?.json_payload || {};
  if (answers.hhq_household_id) return String(answers.hhq_household_id);
  const siteId = normalizeHouseholdIdPart(answers.hhq_site_id);
  const localityCode = normalizeHouseholdIdPart(answers.hhq_locality_code, 2);
  const structureNumber = normalizeHouseholdIdPart(answers.hhq_structure_map_id, 4);
  const householdNumber = normalizeHouseholdIdPart(answers.hhq_household_number, 2);
  if (siteId && localityCode && structureNumber && householdNumber) {
    return [siteId, localityCode, structureNumber, householdNumber].join("-");
  }
  return draft?.subject_id ? String(draft.subject_id) : "";
}

export function filterDraftsForUserSite(drafts, user) {
  const userSiteId = Number(user?.site_id);
  if (!Number.isFinite(userSiteId)) return [];
  return drafts.filter((draft) => Number(getDraftSiteId(draft)) === userSiteId);
}
