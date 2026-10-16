/**
 * Ballabgarh registry lookup logic for the BHQ household member roster.
 *
 * Pure helpers only: storage access lives in
 * modules/households/blbRegistryRepository.js and renderer wiring lives in
 * DynamicPanelRenderer.js. These helpers are unit-testable without React.
 */

export const BHQ_REGISTRY_ID_FIELD = "member_registry_individual_id";
export const BHQ_REGISTRY_UID_FIELD = "member_registry_uid";
export const BHQ_REGISTRY_STATUS_FIELD = "member_registry_status";
export const BHQ_REGISTRY_NAME_FIELD = "member_registry_name";
export const BHQ_REGISTRY_AGE_FIELD = "member_registry_age_years";
export const BHQ_REGISTRY_SEX_FIELD = "member_registry_sex";
export const BHQ_REGISTRY_DOMICILE_FIELD = "member_registry_domicile";

export const BHQ_REGISTRY_STATUS_CHOICES = [
  { value: 1, text: "Alive" },
  { value: 2, text: "Dead" },
  { value: 3, text: "Emigrated" },
  { value: 4, text: "Other" },
];

// Master-list status strings (normalized) -> roster status choice value.
const MASTER_STATUS_CODES = {
  alive: 1,
  dead: 2,
  died: 2,
  emigrated: 3,
  migrated: 3,
};

export function masterStatusToChoice(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["r", "rr", "v", "resident", "returned resident", "visitor"].includes(normalized)) return 1;
  if (normalized === "d") return 2;
  if (normalized === "e") return 3;
  return MASTER_STATUS_CODES[normalized] || 4;
}

export function decodeRegistrySex(sex) {
  const value = String(sex ?? "").trim().toUpperCase();
  if (value === "1" || value === "M" || value === "MALE") return "Male";
  if (value === "2" || value === "F" || value === "FEMALE") return "Female";
  return value || "unknown";
}

export function buildRegistryFacingId(villageCode, hhListNo, familyNo, indNo) {
  const parts = [villageCode, hhListNo, familyNo, indNo].map((part) => String(part ?? "").trim());
  if (parts.some((part) => !part)) return "";
  return parts.join("-");
}

export function isBhqRegistryRoster(question) {
  return question?.name === "hhq_household_members";
}

export function isBhqRegistrySite(survey) {
  return Number(survey?.getValue?.("hhq_site_id")) === 2;
}

function setPanelValue(panel, name, value) {
  const child = panel?.getQuestionByName?.(name);
  if (!child) return;
  child.value = value;
}

export function applyRegistryIndividualToPanel(panel, individual) {
  if (!panel || !individual) return false;
  const facingId = buildRegistryFacingId(
    individual.village_code,
    individual.hh_list_no,
    individual.family_no,
    individual.ind_no,
  );
  setPanelValue(panel, BHQ_REGISTRY_ID_FIELD, facingId);
  setPanelValue(panel, BHQ_REGISTRY_UID_FIELD, individual.uid);
  setPanelValue(panel, BHQ_REGISTRY_STATUS_FIELD, masterStatusToChoice(individual.domicile ?? individual.status));
  setPanelValue(panel, BHQ_REGISTRY_NAME_FIELD, individual.name ?? "");
  setPanelValue(panel, BHQ_REGISTRY_AGE_FIELD, individual.age_years ?? undefined);
  setPanelValue(panel, BHQ_REGISTRY_SEX_FIELD, individual.sex ?? undefined);
  setPanelValue(panel, BHQ_REGISTRY_DOMICILE_FIELD, individual.domicile ?? individual.status ?? undefined);
  return true;
}

export function clearRegistryIndividualFromPanel(panel) {
  if (!panel) return;
  for (const field of [
    BHQ_REGISTRY_ID_FIELD,
    BHQ_REGISTRY_UID_FIELD,
    BHQ_REGISTRY_STATUS_FIELD,
    BHQ_REGISTRY_NAME_FIELD,
    BHQ_REGISTRY_AGE_FIELD,
    BHQ_REGISTRY_SEX_FIELD,
    BHQ_REGISTRY_DOMICILE_FIELD,
  ]) setPanelValue(panel, field, undefined);
}

export function getPanelRegistryUid(panel) {
  return panel?.getQuestionByName?.(BHQ_REGISTRY_UID_FIELD)?.value || "";
}

export function getPanelRegistryDetails(panel) {
  const uid = String(panel?.getQuestionByName?.(BHQ_REGISTRY_UID_FIELD)?.value ?? "").trim();
  if (!uid) return null;
  const domicile = panel?.getQuestionByName?.(BHQ_REGISTRY_DOMICILE_FIELD)?.value;
  const statusChoice = panel?.getQuestionByName?.(BHQ_REGISTRY_STATUS_FIELD)?.value;
  const fallback = BHQ_REGISTRY_STATUS_CHOICES.find((choice) => Number(choice.value) === Number(statusChoice));
  const age = panel?.getQuestionByName?.(BHQ_REGISTRY_AGE_FIELD)?.value;
  const parsedAge = age === undefined || age === null || age === "" ? null : Number(age);
  return {
    uid,
    originalId: String(panel?.getQuestionByName?.(BHQ_REGISTRY_ID_FIELD)?.value ?? ""),
    name: String(panel?.getQuestionByName?.(BHQ_REGISTRY_NAME_FIELD)?.value ?? ""),
    age: Number.isFinite(parsedAge) ? parsedAge : null,
    sex: decodeRegistrySex(panel?.getQuestionByName?.(BHQ_REGISTRY_SEX_FIELD)?.value),
    status: String(domicile ?? "").trim() || fallback?.text || "unknown",
  };
}

export function getRegistryLookupPrefill(survey) {
  return {
    villageCode: String(survey?.getValue?.("hhq_locality_code") ?? ""),
    houseNo: String(survey?.getValue?.("hhq_structure_map_id") ?? ""),
  };
}
