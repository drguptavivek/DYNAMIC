/**
 * Remembers the questionnaire language the interviewer last chose, so every
 * form opens in that language until it is switched again, including after
 * the app restarts.
 */
import { QUESTIONNAIRE_LANGUAGES } from "../../components/forms/questionnaireLanguages.js";
import { getDeviceValue, setDeviceValue } from "../../lib/deviceKeyValueStore.js";

export const LOCALE_PREFERENCE_KEY = "dynamic_questionnaire_locale_v1";
export const DEFAULT_LOCALE = "default";

export function normalizeLocalePreference(locale) {
  const code = String(locale || "").trim().toLowerCase();
  return QUESTIONNAIRE_LANGUAGES.some((language) => language.code === code) ? code : DEFAULT_LOCALE;
}

export async function loadLocalePreference() {
  try {
    return normalizeLocalePreference(await getDeviceValue(LOCALE_PREFERENCE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function saveLocalePreference(locale) {
  const normalized = normalizeLocalePreference(locale);
  try {
    await setDeviceValue(LOCALE_PREFERENCE_KEY, normalized);
  } catch (error) {
    console.warn("Could not save questionnaire language preference:", error);
  }
  return normalized;
}
