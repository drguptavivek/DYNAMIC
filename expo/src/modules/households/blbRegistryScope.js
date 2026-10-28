import hdssVillageMapping from "../../../../shared/hdssVillageMapping.json" with { type: "json" };

/** Pure Ballabgarh registry scope helpers; no storage or network access. */
function getAssignedLocalities(user, today) {
  if (user?.role === "field_worker" && Number(user.site_id) !== hdssVillageMapping.siteId) return [];
  const assignments = Array.isArray(user?.area_assignments) ? user.area_assignments : [];
  return [...new Set(assignments
    .filter((assignment) => {
      if (Number(assignment?.site_id) !== hdssVillageMapping.siteId || !assignment?.locality_code) return false;
      if (assignment.active_from && String(assignment.active_from) > today) return false;
      if (assignment.active_to && String(assignment.active_to) < today) return false;
      return true;
    })
    .map((assignment) => String(assignment.locality_code).trim())
    .filter(Boolean))].sort();
}

export function getAssignedBlbRegistryVillages(user, today = new Date().toISOString().slice(0, 10)) {
  return getAssignedLocalities(user, today);
}

export function getBlbRegistryVillageSearchScope(villageCode, allowedVillageCodes = []) {
  const village = String(villageCode ?? "").trim();
  const allowed = Array.isArray(allowedVillageCodes)
    ? allowedVillageCodes.map((code) => String(code ?? "").trim()) : [];
  if (!village || !allowed.includes(village)) return [];
  return [village];
}

export function getSelectedBlbRegistryVillages(user, selectedLocalityCode, today = new Date().toISOString().slice(0, 10)) {
  const localities = getAssignedLocalities(user, today);
  const selected = String(selectedLocalityCode || "").trim();
  return selected ? localities.filter((locality) => locality === selected) : localities;
}

export function getBlbRegistryScopeFingerprint(user, today = new Date().toISOString().slice(0, 10)) {
  return getAssignedBlbRegistryVillages(user, today).join(",");
}
