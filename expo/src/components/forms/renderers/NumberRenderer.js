/** Renders and normalizes a numeric Survey Core question using a native text input. */
import React from "react";
import { TextInput } from "react-native";

import { setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";

export function NumberRenderer({ question, onChange }) {
  return (
    <QuestionFrame question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={question.value === undefined || question.value === null ? "" : String(question.value)}
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
