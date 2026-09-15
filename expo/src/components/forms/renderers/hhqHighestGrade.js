const HHQ_HIGHEST_GRADE_FIELD = "member_highest_grade_completed";

function errorText(error) {
  if (typeof error === "string") return error;
  if (typeof error?.getText === "function") return error.getText();
  return error?.text || String(error || "");
}

export function isHhqHighestGradeYearEntry(question, value = question?.value) {
  if (question?.name !== HHQ_HIGHEST_GRADE_FIELD) return false;
  const normalized = String(value ?? "").trim();
  if (!/^\d{1,2}$/.test(normalized)) return false;
  const specialCodes = (question.choices || []).map((choice) => String(choice.value));
  return !specialCodes.includes(normalized);
}

export function acceptHhqHighestGradeYearEntry(question, value = question?.value) {
  if (!isHhqHighestGradeYearEntry(question, value)) return false;
  if (Array.isArray(question.errors)) {
    question.errors = question.errors.filter(
      (error) => !/response\s+required|required\s+response/i.test(errorText(error))
    );
  }
  return true;
}
