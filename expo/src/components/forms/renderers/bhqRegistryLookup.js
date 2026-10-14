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
  return MASTER_STATUS_CODES[normalized] || 4;
}

export function buildRegistryFacingId(hhListNo, familyNo, indNo) {
  const parts = [hhListNo, familyNo, indNo].map((part) => String(part || "").trim());
  if (parts.some((part) => !part)) return "";
  return parts.join("-");
}

export function isBhqRegistryRoster(question) {
  return question?.name === "hhq_household_members";
}

export function isBhqRegistrySite(survey) {
  return Number(survey?.getValue?.("hhq_site_id")) === 2;
}

export function buildRegistryConfirmationMessage(individual) {
  const age = individual?.age_years === null || individual?.age_years === undefined
    ? "unknown"
    : individual.age_years;
  const status = String(individual?.status || "alive").trim();
  const lines = [
    `ID: ${buildRegistryFacingId(individual.hh_list_no, individual.family_no, individual.ind_no)}`,
    `Name: ${individual.name}`,
    `Age: ${age} · Sex: ${String(individual.sex || "unknown").toUpperCase()}`,
    `Status in master list: ${status}`,
  ];
  if (masterStatusToChoice(status) !== 1) {
    lines.push(
      `WARNING: This person is recorded as ${status} in the master list. ` +
      "Do not list them as a current household member unless you have verified their status."
    );
  }
  lines.push("Confirm this is the correct person?");
  return lines.join("\n");
}

function setPanelValue(panel, name, value) {
  const child = panel?.getQuestionByName?.(name);
  if (!child) return;
  child.value = value;
}

export function applyRegistryIndividualToPanel(panel, individual) {
  if (!panel || !individual) return false;
  const facingId = buildRegistryFacingId(
    individual.hh_list_no,
    individual.family_no,
    individual.ind_no,
  );
  setPanelValue(panel, BHQ_REGISTRY_ID_FIELD, facingId);
  setPanelValue(panel, BHQ_REGISTRY_UID_FIELD, individual.uid);
  setPanelValue(panel, BHQ_REGISTRY_STATUS_FIELD, masterStatusToChoice(individual.status));
  return true;
}

export function clearRegistryIndividualFromPanel(panel) {
  if (!panel) return;
  setPanelValue(panel, BHQ_REGISTRY_ID_FIELD, undefined);
  setPanelValue(panel, BHQ_REGISTRY_UID_FIELD, undefined);
}

export function getPanelRegistryUid(panel) {
  return panel?.getQuestionByName?.(BHQ_REGISTRY_UID_FIELD)?.value || "";
}
