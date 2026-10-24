const EXCLUSIONS = {
  7: { outcome: 7, reason: 'dwelling_vacant_or_not_dwelling', occupancy_status: 'vacant' },
  8: { outcome: 8, reason: 'dwelling_destroyed', occupancy_status: 'not_occupied' },
  9: { outcome: 9, reason: 'dwelling_not_found', occupancy_status: 'not_occupied' },
  11: { outcome: 11, reason: 'dwelling_shifted_within_area', occupancy_status: 'not_occupied' },
  12: { outcome: 12, reason: 'other_dwelling_exclusion', occupancy_status: 'other_unknown' },
};

function getHhqDwellingExclusion(answers) {
  const availability = Number(answers?.hhq_competent_respondent_available);
  // A revisit answer takes precedence over a stale outcome from an earlier draft.
  if (availability === 2 || availability === 3) return null;
  const exclusion = EXCLUSIONS[availability] || EXCLUSIONS[Number(answers?.hhq_result_interview)];
  if (!exclusion || exclusion.outcome !== 12) return exclusion || null;
  const text = availability === 12 ? answers?.hhq_competent_respondent_other_specify
    : answers?.hhq_dwelling_other_specify ?? answers?.hhq_competent_respondent_other_specify;
  return typeof text === 'string' && text.trim()
    ? { ...exclusion, reason_text: text } : exclusion;
}

module.exports = { getHhqDwellingExclusion };
