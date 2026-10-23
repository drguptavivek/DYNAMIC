export interface HhqDwellingExclusion {
  outcome: 7 | 8 | 9;
  reason: 'dwelling_vacant_or_not_dwelling' | 'dwelling_destroyed' | 'dwelling_not_found';
  occupancy_status: 'vacant' | 'not_occupied';
}

export function getHhqDwellingExclusion(answers?: Record<string, unknown> | null): HhqDwellingExclusion | null;
