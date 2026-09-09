/** Verifies the questionnaire language preference is normalised and persisted. */
import assert from "node:assert/strict";

const {
  DEFAULT_LOCALE,
  LOCALE_PREFERENCE_KEY,
  loadLocalePreference,
  normalizeLocalePreference,
  saveLocalePreference,
} = await import("../modules/preferences/localePreference.js");
const { getDeviceValue } = await import("../lib/deviceKeyValueStore.js");

assert.equal(normalizeLocalePreference(undefined), DEFAULT_LOCALE);
assert.equal(normalizeLocalePreference(""), DEFAULT_LOCALE);
assert.equal(normalizeLocalePreference("HI"), "hi");
assert.equal(normalizeLocalePreference("kn"), "kn");
assert.equal(normalizeLocalePreference("ur"), DEFAULT_LOCALE, "unknown locale falls back");
assert.equal(normalizeLocalePreference("default"), DEFAULT_LOCALE);

// Nothing stored yet.
assert.equal(await loadLocalePreference(), DEFAULT_LOCALE);

// Switching persists and reloads.
assert.equal(await saveLocalePreference("ta"), "ta");
assert.equal(await getDeviceValue(LOCALE_PREFERENCE_KEY), "ta");
assert.equal(await loadLocalePreference(), "ta");

// Garbage never persists as garbage.
assert.equal(await saveLocalePreference("xx"), DEFAULT_LOCALE);
assert.equal(await loadLocalePreference(), DEFAULT_LOCALE);

console.log("Locale preference validation passed");
