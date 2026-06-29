import { getStudySiteName } from "../../../../shared/studyMasters.js";

function isActiveAssignment(assignment, today) {
  if (!assignment?.locality_code) return false;
  if (!assignment.active_to) return true;
  return String(assignment.active_to) >= today;
}

export function buildFieldWorkerProfile(user, localities = [], today = new Date().toISOString().split("T")[0]) {
  const localitiesByCode = new Map(
    localities.map((locality) => [String(locality.locality_code), locality])
  );
  const assignments = Array.isArray(user?.area_assignments) ? user.area_assignments : [];
  const activeAssignments = assignments
    .filter((assignment) => isActiveAssignment(assignment, today))
    .map((assignment) => {
      const localityCode = String(assignment.locality_code);
      const locality = localitiesByCode.get(localityCode);
      const siteId = Number(assignment.site_id || locality?.site_id || user?.site_id || 0);
      return {
        site_id: siteId || null,
        site_name: getStudySiteName(siteId),
        locality_code: localityCode,
        locality_name: locality?.locality_name || assignment.locality_name || localityCode,
        active_from: assignment.active_from || "",
        active_to: assignment.active_to || ""
      };
    });

  return {
    display_name: user?.display_name || user?.username || "Field Worker",
    username: user?.username || "",
    role: user?.role || "",
    site_id: user?.site_id ?? null,
    site_name: getStudySiteName(user?.site_id),
    active_assignments: activeAssignments
  };
}
