/** Displays a calculated Survey Core value without permitting direct edits. */
import React from "react";
import { Text } from "react-native";

import { QuestionFrame } from "./QuestionFrame.js";

export function CalculateRenderer({ question }) {
  const value = question.value === undefined || question.value === null || question.value === ""
    ? "Not calculated yet"
    : String(question.value);
  return <QuestionFrame question={question} tone="display"><Text>{value}</Text></QuestionFrame>;
}
