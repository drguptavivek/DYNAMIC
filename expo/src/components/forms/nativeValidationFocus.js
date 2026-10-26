import {
  hasNativeValidationProblem,
  isNativeInternalPanelField,
  shouldValidateNativeQuestion,
} from "./nativeSurveyModel.js";

/** Return the real question instance so repeated names never select another row. */
export function findFirstNativeValidationQuestion(questions = []) {
  for (const question of questions) {
    if (!shouldValidateNativeQuestion(question) || isNativeInternalPanelField(question.name)) continue;
    if ((question.getType?.() || question.type) === "paneldynamic") {
      for (const panel of question.panels || []) {
        const child = findFirstNativeValidationQuestion(panel.questions);
        if (child) return child;
      }
    }
    if (hasNativeValidationProblem(question)) return question;
  }
  return null;
}

function containsQuestion(question, target) {
  return question === target || (question?.panels || []).some((panel) =>
    (panel.questions || []).some((child) => containsQuestion(child, target))
  );
}

export function getValidationPanelIndex(ownerQuestion, targetQuestion) {
  if (!targetQuestion) return -1;
  return (ownerQuestion?.panels || []).findIndex((panel) =>
    (panel.questions || []).some((child) => containsQuestion(child, targetQuestion))
  );
}
