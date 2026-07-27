/** Provides the shared native label, description, error, and control layout for questions. */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  getNativeQuestionDescription,
  getNativeQuestionErrors,
  getNativeQuestionTitle,
} from "../nativeSurveyModel.js";

export function QuestionFrame({ question, children, tone = "default" }) {
  const title = getNativeQuestionTitle(question);
  const description = getNativeQuestionDescription(question);
  const errors = getNativeQuestionErrors(question);
  return (
    <View style={[styles.frame, tone === "display" && styles.displayFrame]}>
      {title ? (
        <Text style={styles.title}>
          {title}
          {question?.isRequired ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
      {errors.map((error, index) => (
        <Text key={`${error}-${index}`} style={styles.error}>{error}</Text>
      ))}
    </View>
  );
}

export const controlStyles = StyleSheet.create({
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#b8c2cc",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    color: "#18202a",
    fontSize: 16,
  },
  readOnly: {
    backgroundColor: "#f3f4f6",
    color: "#475467",
  },
  option: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  optionSelected: {
    borderColor: "#1f6feb",
    backgroundColor: "#eef6ff",
  },
  optionMark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#98a2b3",
    backgroundColor: "#ffffff",
  },
  optionMarkSelected: {
    borderColor: "#1f6feb",
    backgroundColor: "#1f6feb",
  },
  optionText: {
    flex: 1,
    color: "#18202a",
    fontSize: 15,
  },
  options: { gap: 8 },
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#1f6feb",
  },
  buttonText: { color: "#ffffff", fontWeight: "800" },
  secondaryButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: { color: "#18202a", fontWeight: "700" },
  status: { color: "#475467", fontSize: 13 },
});

const styles = StyleSheet.create({
  frame: {
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e4e7ec",
    borderRadius: 10,
    backgroundColor: "#ffffff",
  },
  displayFrame: { backgroundColor: "#f8fafc" },
  title: { color: "#18202a", fontSize: 16, fontWeight: "700", lineHeight: 22 },
  required: { color: "#d92d20" },
  description: { color: "#667085", fontSize: 13, lineHeight: 19 },
  error: { color: "#d92d20", fontSize: 13, fontWeight: "700" },
});
