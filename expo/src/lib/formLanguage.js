/** Restores the original interview locale from draft metadata or older language answers. */
import { QUESTIONNAIRE_LANGUAGES } from "../components/forms/questionnaireLanguages.js";
import { findQuestionnaireLanguageFieldName } from "./questionnaireLanguageField.js";

export function getDraftFormLocale(draft, model, fallback = "default") {
  const stored = draft?.completion_state?.locale;
  if (QUESTIONNAIRE_LANGUAGES.some((language) => language.code === stored)) return stored;
  const field = findQuestionnaireLanguageFieldName(model);
  const answer = Number(draft?.json_payload?.[field]);
  const language = QUESTIONNAIRE_LANGUAGES.find((entry) => entry.questionnaireCode === answer);
  return language?.code || (QUESTIONNAIRE_LANGUAGES.some((entry) => entry.code === fallback) ? fallback : "default");
}
