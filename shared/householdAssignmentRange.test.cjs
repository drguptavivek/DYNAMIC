const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHouseholdAssignmentRange: parse, isHouseholdInAssignmentRange: matches } = require('./householdAssignmentRange.cjs');

test('full household IDs constrain the inclusive household number and every prefix part', () => {
  const range = parse(' 2-02-0010-10 ', '2-02-0010-20', { siteId: 2 });
  assert.deepEqual(range, { siteId: 2, localityCode: '02', structureMapId: '0010', start: 10, end: 20 });
  const ids = ['2-02-0010-01', '2-02-0010-09', '2-02-0010-10', '2-02-0010-12', '2-02-0010-20', '2-02-0010-23', '2-02-0011-12', '2-11-0010-12', '1-02-0010-12'];
  assert.deepEqual(ids.filter(household_id => matches({ household_id }, range)), ['2-02-0010-10', '2-02-0010-12', '2-02-0010-20']);
  assert.equal(matches({ household_id: '2-02-0010-12', site_id: 2, locality_code: '02', household_number: '12' }, range), true);
  assert.deepEqual(parse('02-2-10-010', '2-02-0010-020'), range);
});

test('numeric bounds, blank and one-sided bounds preserve selected scope', () => {
  const range = parse('10', '20', { siteId: 2, localityCode: '2' });
  assert.equal(matches({ household_id: '2-02-9999-10' }, range), true);
  assert.equal(matches({ household_id: '2-11-9999-10' }, range), false);
  assert.equal(matches({ household_id: '2-02-9999-21' }, range), false);
  assert.deepEqual(parse(' ', ''), {});
  assert.deepEqual(parse(undefined, '020'), { end: 20 });
  assert.deepEqual(parse('010', undefined), { start: 10 });
  assert.equal(matches({ household_id: '2-02-0010-01' }, parse('', '2-02-0010-20')), true);
  assert.equal(matches({ household_id: '2-02-0010-99' }, parse('2-02-0010-20', '')), true);
  assert.equal(matches({ household_id: '2-02-0010-NaN' }, range), false);
});

test('alphanumeric structure IDs retain the canonical format', () => {
  const range = parse('2-02-0011a-10', '2-2-0011A-20');
  assert.equal(range.structureMapId, '0011A');
  assert.equal(matches({ household_id: '2-02-0011A-15' }, range), true);
  assert.equal(matches({ household_id: '2-02-0011B-15' }, range), false);
});

test('bad, reversed, mixed and mismatched bounds cannot silently disable filtering', () => {
  for (const value of ['abc', '-1', '1.5', 'NaN', 'Infinity', '1e2', '9007199254740992', '2-02-0010', '2-02-0010-10-01', '2-002-0010-10', '0-02-0010-10', '2-02-ABCDEF7-10', '2-02-0010-1.5']) {
    assert.throws(() => parse(value, ''), RangeError, value);
  }
  for (const [start, end, scope] of [
    ['20', '10'], ['2-02-0010-20', '2-02-0010-10'], ['10', '2-02-0010-20'],
    ['2-02-0010-10', '20'], ['2-02-0010-10', '2-02-0011-20'],
    ['2-02-0010-10', '2-11-0010-20'], ['2-02-0010-10', '3-02-0010-20'],
    ['2-02-0010-10', '', { siteId: 1 }], ['2-02-0010-10', '', { localityCode: '11' }],
  ]) assert.throws(() => parse(start, end, scope), RangeError);
});
