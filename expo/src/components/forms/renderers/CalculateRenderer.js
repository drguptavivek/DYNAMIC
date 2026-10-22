/** Displays a calculated Survey Core value without permitting direct edits. */
import React from "react";
import { getNativeFormText } from "../../../lib/nativeFormText.js";
import { Text } from "react-native";

import { getNativeQuestionDisplayValue } from "../nativeSurveyModel.js";
import { QuestionFrame } from "./QuestionFrame.js";

export function CalculateRenderer({ answerData, locale, question }) {
  const rawValue = getNativeQuestionDisplayValue(question, answerData);
  const value = rawValue === undefined || rawValue === null || rawValue === ""
    ? getNativeFormText(question.survey, "not_calculated_yet", "Not calculated yet", locale)
    : String(rawValue);
  return <QuestionFrame locale={locale} question={question} tone="display"><Text>{value}</Text></QuestionFrame>;
}
