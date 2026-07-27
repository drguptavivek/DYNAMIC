/** Evaluates Survey Core regular-expression validators and returns definition-owned messages. */
import { getNativeQuestionErrors, stripSurveyHtml } from "../nativeSurveyModel.js";

function regexMessage(validator) {
  return stripSurveyHtml(
    validator?.locText?.renderedHtml || validator?.locText?.text || validator?.text || "Invalid format."
  );
}

export function getRegexValidationErrors(question, value = question?.value) {
  if (value === undefined || value === null || value === "") return [];
  return (question?.validators || [])
    .filter((validator) => validator.getType?.() === "regexvalidator" && validator.regex)
    .filter((validator) => {
      try {
        return !new RegExp(validator.regex).test(String(value));
      } catch {
        return true;
      }
    })
    .map(regexMessage);
}

export function validateRegexQuestion(question) {
  question?.validate?.();
  const existing = new Set(getNativeQuestionErrors(question));
  for (const message of getRegexValidationErrors(question)) {
    if (!existing.has(message)) question.addError?.(message);
  }
  return getNativeQuestionErrors(question);
}
