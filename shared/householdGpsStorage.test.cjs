const assert = require("node:assert/strict");
const { test } = require("node:test");
const { stripHouseholdGpsMetadata } = require("./householdGpsStorage.cjs");

test("removes only GPS metadata recursively without changing coordinates, other answers or input", () => {
  const input = {
    hhq_gps_latitude: 28.1, hhq_gps_longitude: 77.2,
    hhq_gps_accuracy_m: 12, hhq_gps_captured_at: "2026-10-19T12:00:00Z",
    accuracy: 1, captured_at: "keep", description: '{"hhq_gps_accuracy_m": "answer text"}',
    prefill: { hhq_gps_accuracy_m: 10, consent: 1 },
    completion: [{ hhq_gps_captured_at: "old", page: "identification" }],
  };
  const before = structuredClone(input);
  const expected = {
    hhq_gps_latitude: 28.1, hhq_gps_longitude: 77.2,
    accuracy: 1, captured_at: "keep", description: input.description,
    prefill: { consent: 1 }, completion: [{ page: "identification" }],
  };
  assert.deepEqual(stripHouseholdGpsMetadata(input), expected);
  assert.deepEqual(input, before);
  assert.deepEqual(JSON.parse(stripHouseholdGpsMetadata(JSON.stringify(input))), expected);
  assert.equal(stripHouseholdGpsMetadata("malformed JSON"), "malformed JSON");
  assert.equal(stripHouseholdGpsMetadata(JSON.stringify(input.description)), JSON.stringify(input.description));
  for (const primitive of [null, undefined, false, 0]) {
    assert.equal(stripHouseholdGpsMetadata(primitive), primitive);
  }
});
