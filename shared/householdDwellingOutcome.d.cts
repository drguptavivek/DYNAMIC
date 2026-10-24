export interface HhqDwellingExclusion {
  outcome: 7 | 8 | 9 | 11 | 12;
  reason: 'dwelling_vacant_or_not_dwelling' | 'dwelling_destroyed' | 'dwelling_not_found' | 'dwelling_shifted_within_area' | 'other_dwelling_exclusion';
  occupancy_status: 'vacant' | 'not_occupied' | 'other_unknown';
  reason_text?: string;
}

export function getHhqDwellingExclusion(answers?: Record<string, unknown> | null): HhqDwellingExclusion | null;
