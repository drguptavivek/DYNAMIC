const assert = require('node:assert/strict');
const test = require('node:test');
const { getHhqDwellingExclusion } = require('./householdDwellingOutcome.cjs');

test('all terminal dwelling answers use the same outcome and reason online and offline', () => {
  for (const [outcome, reason, occupancy_status] of [
    [7, 'dwelling_vacant_or_not_dwelling', 'vacant'],
    [8, 'dwelling_destroyed', 'not_occupied'],
    [9, 'dwelling_not_found', 'not_occupied'],
    [11, 'dwelling_shifted_within_area', 'not_occupied'],
    [12, 'other_dwelling_exclusion', 'other_unknown'],
  ]) {
    const expected = { outcome, reason, occupancy_status };
    for (const value of [outcome, String(outcome)]) {
      assert.deepEqual(getHhqDwellingExclusion({ hhq_competent_respondent_available: value, hhq_result_interview: 1 }), expected);
      assert.deepEqual(getHhqDwellingExclusion({ hhq_result_interview: value }), expected);
      assert.deepEqual(getHhqDwellingExclusion({ hhq_competent_respondent_available: 1, hhq_result_interview: value }), expected);
    }
  }
});

test('normal, invalid and revisit answers do not exclude a household', () => {
  for (const answers of [undefined, null, {}, { hhq_result_interview: 1 }, { hhq_result_interview: 10 }, { hhq_result_interview: 'invalid' },
    { hhq_competent_respondent_available: 2, hhq_result_interview: 7 },
    { hhq_competent_respondent_available: '3', hhq_result_interview: 9 }]) {
    assert.equal(getHhqDwellingExclusion(answers), null);
  }
});


test('Other dwelling reason preserves exact source text and uses only its dedicated outcome fallback', () => {
  const text = '  Requested exclusion after relocation  ';
  assert.deepEqual(getHhqDwellingExclusion({ hhq_competent_respondent_available: 12,
    hhq_competent_respondent_other_specify: text, hhq_dwelling_other_specify: 'stale mirror' }), {
    outcome: 12, reason: 'other_dwelling_exclusion', occupancy_status: 'other_unknown', reason_text: text,
  });
  assert.equal(getHhqDwellingExclusion({ hhq_result_interview: 12, hhq_dwelling_other_specify: text }).reason_text, text);
  for (const reason of ['', '  ', null]) {
    const exclusion = getHhqDwellingExclusion({ hhq_competent_respondent_available: 12,
      hhq_competent_respondent_other_specify: reason, hhq_dwelling_other_specify: 'stale mirror',
      hhq_result_interview_other_specify: 'legacy outcome10reason' });
    assert.equal(exclusion.outcome, 12, 'blank Other still cannot become an enrolled household');
    assert.equal(exclusion.reason_text, undefined, 'stale mirrors and legacy Other10 text must not supply a missing Q9 reason');
  }
  assert.equal(getHhqDwellingExclusion({ hhq_result_interview: 10, hhq_result_interview_other_specify: text }), null);
});
