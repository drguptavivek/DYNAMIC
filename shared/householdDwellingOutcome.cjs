const EXCLUSIONS = {
  7: { outcome: 7, reason: 'dwelling_vacant_or_not_dwelling', occupancy_status: 'vacant' },
  8: { outcome: 8, reason: 'dwelling_destroyed', occupancy_status: 'not_occupied' },
  9: { outcome: 9, reason: 'dwelling_not_found', occupancy_status: 'not_occupied' },
};

function getHhqDwellingExclusion(answers) {
  const availability = Number(answers?.hhq_competent_respondent_available);
  if (EXCLUSIONS[availability]) return EXCLUSIONS[availability];
  // A revisit answer takes precedence over a stale outcome from an earlier draft.
  if (availability === 2 || availability === 3) return null;
  return EXCLUSIONS[Number(answers?.hhq_result_interview)] || null;
}

module.exports = { getHhqDwellingExclusion };
