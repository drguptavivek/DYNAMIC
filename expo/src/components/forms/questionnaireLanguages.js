// `questionnaireCode` is the answer value of the "Language of questionnaire"
// question (HHQ Q11 / WQ Q6): 1 Hindi, 2 Kannada, 3 Marathi, 4 Tamil,
// 5 Telugu, 6 Urdu, 7 English. Urdu has no locale in the app yet, so it
// cannot currently be recorded through the selector.
export const QUESTIONNAIRE_LANGUAGES = [
  { code: "default", label: "English", questionnaireCode: 7 },
  { code: "hi", label: "Hindi", questionnaireCode: 1 },
  { code: "kn", label: "Kannada", questionnaireCode: 2 },
  { code: "mr", label: "Marathi", questionnaireCode: 3 },
  { code: "ta", label: "Tamil", questionnaireCode: 4 },
  { code: "te", label: "Telugu", questionnaireCode: 5 },
];

export function questionnaireLanguageCodeForLocale(locale) {
  const normalized = String(locale || "default").toLowerCase();
  const language = QUESTIONNAIRE_LANGUAGES.find((entry) => entry.code === normalized);
  return language ? language.questionnaireCode : null;
}
