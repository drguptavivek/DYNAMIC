const HHQ_TASK_PREFILL_FIELDS = [
  "hhq_site_id",
  "hhq_locality_code",
  "hhq_structure_map_id",
  "hhq_household_number",
];

export function parseHhqTaskHouseholdId(householdId) {
  const parts = String(householdId || "").split("-");
  if (parts.length !== 4 || parts.some((part) => !part)) return null;
  const siteId = Number(parts[0]);
  if (!Number.isFinite(siteId)) return null;
  return {
    hhq_site_id: siteId,
    hhq_locality_code: parts[1],
    hhq_structure_map_id: parts[2],
    hhq_household_number: parts[3],
  };
}

export function applyHhqTaskHouseholdPrefill(model, taskContext) {
  const prefill = parseHhqTaskHouseholdId(taskContext?.household_id || taskContext?.subject_id);
  if (!prefill || !model?.getQuestionByName || !model?.setValue) return null;

  for (const fieldName of HHQ_TASK_PREFILL_FIELDS) {
    const question = model.getQuestionByName(fieldName);
    if (!question) continue;
    model.setValue(fieldName, prefill[fieldName]);
    question.readOnly = true;
  }

  return prefill;
}
