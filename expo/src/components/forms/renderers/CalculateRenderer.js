/** Displays a calculated Survey Core value without permitting direct edits. */
import React from "react";
import { Text } from "react-native";

import { getNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame } from "./QuestionFrame.js";

export function CalculateRenderer({ answerData, locale, question }) {
  const rawValue = getNativeQuestionValue(question, answerData);
  const value = rawValue === undefined || rawValue === null || rawValue === ""
    ? "Not calculated yet"
    : String(rawValue);
  return <QuestionFrame locale={locale} question={question} tone="display"><Text>{value}</Text></QuestionFrame>;
}
