import assert from "node:assert/strict";
import { generateStudyPassword } from "../lib/passwordGenerator.ts";

for (let index = 0; index < 50; index += 1) {
  const password = generateStudyPassword();
  const parts = password.split("-");

  assert.equal(parts.length, 4, `Expected 4 dash-separated parts: ${password}`);
  assert.match(parts[3], /^\d{3}$/, `Expected final part to be 3 digits: ${password}`);

  for (const word of parts.slice(0, 3)) {
    assert.match(word, /^[A-Za-z]{5,7}$/, `Expected 5-7 letter alphabetic word: ${password}`);

    const uppercaseIndexes = [...word]
      .map((character, characterIndex) => (/[A-Z]/.test(character) ? characterIndex : -1))
      .filter((characterIndex) => characterIndex >= 0);

    assert.equal(uppercaseIndexes.length, 1, `Expected one capital letter in each word: ${password}`);
    assert.ok(
      uppercaseIndexes[0] > 0 && uppercaseIndexes[0] < word.length - 1,
      `Expected capital letter inside the word: ${password}`,
    );
  }
}

console.log("Password generator validation passed");
