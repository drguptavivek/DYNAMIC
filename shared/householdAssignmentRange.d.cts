export type HouseholdAssignmentRange = {
  start?: number; end?: number; siteId?: number; localityCode?: string; structureMapId?: string;
};
export type AssignmentHousehold = {
  household_id: string; site_id?: number; locality_code?: string; structure_map_id?: string; household_number?: string;
};
export function parseHouseholdAssignmentRange(start?: string, end?: string, scope?: { siteId?: number; localityCode?: string }): HouseholdAssignmentRange;
export function isHouseholdInAssignmentRange(household: AssignmentHousehold, range: HouseholdAssignmentRange): boolean;
