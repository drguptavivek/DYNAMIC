/** Renders and normalizes a numeric Survey Core question using a native text input. */
import React from "react";
import { TextInput } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";

export function NumberRenderer({ answerData, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  return (
    <QuestionFrame question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={value === undefined || value === null ? "" : String(value)}
        editable={!question.isReadOnly}
        keyboardType={question.inputType === "number" ? "numeric" : "number-pad"}
        onChangeText={(value) => {
          const sanitized = value.replace(/[^0-9.-]/g, "");
          setNativeQuestionValue(question, sanitized);
          onChange?.();
        }}
        onBlur={() => {
          validateRegexQuestion(question);
          onChange?.();
        }}
        style={[controlStyles.input, question.isReadOnly && controlStyles.readOnly]}
      />
    </QuestionFrame>
  );
}
