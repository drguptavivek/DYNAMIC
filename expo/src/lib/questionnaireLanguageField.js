/**
 * Derives the "Language of questionnaire" answer from the language the
 * interviewer selected in the renderer's language switcher, instead of asking
 * it as a separate question. Works for any questionnaire: the question is
 * detected by its choice set (1 Hindi ... 7 English), so forms that gain the
 * question later, or server-delivered form versions, are covered without a
 * per-form field list.
 */
import { questionnaireLanguageCodeForLocale } from "../components/forms/questionnaireLanguages.js";

export const HHQ_LANGUAGE_FIELD = "hhq_language_questionnaire";
export const WQ_LANGUAGE_FIELD = "wq_language_questionnaire";

const LANGUAGE_CHOICE_TEXTS = ["hindi", "english"];
const LANGUAGE_CHOICE_VALUES = [1, 2, 3, 4, 5, 6, 7];

const detectedFieldByModel = new WeakMap();

function choiceText(choice) {
  const text = choice?.text;
  if (typeof text === "string") return text;
  if (text && typeof text === "object") return text.default || "";
  if (typeof choice?.locText?.getLocaleText === "function") {
    return choice.locText.getLocaleText("default") || "";
  }
  return "";
}

function isLanguageQuestion(question) {
  if (!question) return false;
  if (/_language_questionnaire$/.test(String(question.name || ""))) return true;
  const type = question.getType?.() || question.type;
  if (type !== "radiogroup" && type !== "dropdown") return false;
  const choices = question.choices || [];
  const values = choices.map((choice) => Number(choice?.value)).sort((a, b) => a - b);
  if (values.join(",") !== LANGUAGE_CHOICE_VALUES.join(",")) return false;
  const texts = choices.map((choice) => choiceText(choice).trim().toLowerCase());
  return LANGUAGE_CHOICE_TEXTS.every((needle) => texts.includes(needle));
}

export function findQuestionnaireLanguageFieldName(model) {
  if (!model?.getAllQuestions) return null;
  if (detectedFieldByModel.has(model)) return detectedFieldByModel.get(model);
  const question = model.getAllQuestions().find(isLanguageQuestion);
  const name = question?.name || null;
  detectedFieldByModel.set(model, name);
  return name;
}

/**
 * Locks the language question and sets it from the active locale. Returns
 * true when the stored answer changed. Safe to call for forms without the
 * question (returns false).
 */
export function applyQuestionnaireLanguageFromLocale(model, locale, fieldName) {
  const name = fieldName || findQuestionnaireLanguageFieldName(model);
  if (!name) return false;
  const question = model?.getQuestionByName?.(name);
  if (!question) return false;
  question.readOnly = true;
  const code = questionnaireLanguageCodeForLocale(locale);
  if (code === null) return false;
  if (Number(model.getValue(name)) === code) return false;
  model.setValue(name, code);
  return true;
}
