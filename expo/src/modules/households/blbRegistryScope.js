/** Pure Ballabgarh registry scope helpers; no storage or network access. */
export function getAssignedBlbRegistryVillages(user, today = new Date().toISOString().slice(0, 10)) {
  const assignments = Array.isArray(user?.area_assignments) ? user.area_assignments : [];
  return [...new Set(assignments
    .filter((assignment) => {
      if (Number(assignment?.site_id) !== 2 || !assignment?.locality_code) return false;
      if (assignment.active_from && String(assignment.active_from) > today) return false;
      if (assignment.active_to && String(assignment.active_to) < today) return false;
      return true;
    })
    .map((assignment) => String(assignment.locality_code).trim())
    .filter(Boolean))].sort();
}

export function getBlbRegistryScopeFingerprint(user, today = new Date().toISOString().slice(0, 10)) {
  return getAssignedBlbRegistryVillages(user, today).join(",");
}
