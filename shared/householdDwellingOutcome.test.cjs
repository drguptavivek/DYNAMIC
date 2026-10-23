const assert = require('node:assert/strict');
const test = require('node:test');
const { getHhqDwellingExclusion } = require('./householdDwellingOutcome.cjs');

test('all terminal dwelling answers use the same outcome and reason online and offline', () => {
  for (const [outcome, reason, occupancy_status] of [
    [7, 'dwelling_vacant_or_not_dwelling', 'vacant'],
    [8, 'dwelling_destroyed', 'not_occupied'],
    [9, 'dwelling_not_found', 'not_occupied'],
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
  for (const answers of [undefined, null, {}, { hhq_result_interview: 1 }, { hhq_result_interview: 'invalid' },
    { hhq_competent_respondent_available: 2, hhq_result_interview: 7 },
    { hhq_competent_respondent_available: '3', hhq_result_interview: 9 }]) {
    assert.equal(getHhqDwellingExclusion(answers), null);
  }
});
