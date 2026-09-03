import assert from "node:assert/strict";

const {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARACTERS,
  canCommitSearch,
  normalizeCommittedSearch,
} = await import("../lib/useCommittedSearch.js");

assert.equal(SEARCH_MIN_CHARACTERS, 3);
assert.equal(SEARCH_DEBOUNCE_MS, 300);
assert.equal(normalizeCommittedSearch("  Alice  "), "Alice");
assert.equal(canCommitSearch(""), true);
assert.equal(canCommitSearch(" a "), false);
assert.equal(canCommitSearch("ab"), false);
assert.equal(canCommitSearch("abc"), true);

console.log("validateCommittedSearch.mjs: all assertions passed");
