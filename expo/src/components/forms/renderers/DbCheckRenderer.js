/** Renders a value input with an explicit asynchronous database-check action and result state. */
import React, { useState } from "react";
import { Pressable, Text, TextInput } from "react-native";

import { getNativeQuestionErrors, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";

export function DbCheckRenderer({ question, onChange }) {
  const [status, setStatus] = useState("Not checked");

  async function checkDatabase() {
    const validationErrors = validateRegexQuestion(question);
    if (validationErrors.length) {
      setStatus("Fix the highlighted value before checking.");
      onChange?.();
      return;
    }
    if (typeof question.runNativeDbCheck !== "function") {
      setStatus("Database check is not configured for this field.");
      return;
    }
    setStatus("Checking the offline household registry...");
    try {
      const duplicate = await question.runNativeDbCheck();
      setStatus(
        duplicate
          ? `Existing household found: ${duplicate.household_id}`
          : "No matching household found in the offline registry."
      );
    } catch (error) {
      setStatus(`Database check failed: ${error.message}`);
    }
    onChange?.();
  }

  return (
    <QuestionFrame question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={question.value === undefined || question.value === null ? "" : String(question.value)}
        keyboardType="number-pad"
        onChangeText={(value) => {
          setNativeQuestionValue(question, value.replace(/[^0-9]/g, ""));
          setStatus("Not checked");
          onChange?.();
        }}
        onBlur={() => {
          validateRegexQuestion(question);
          onChange?.();
        }}
        style={controlStyles.input}
      />
      <Pressable onPress={checkDatabase} style={controlStyles.button}>
        <Text style={controlStyles.buttonText}>Check household ID</Text>
      </Pressable>
      <Text style={controlStyles.status}>{status}</Text>
    </QuestionFrame>
  );
}
