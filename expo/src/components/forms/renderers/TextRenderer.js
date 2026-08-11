/** Renders a single-line native text question with blur-time validation. */
import React from "react";
import { TextInput } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";

export function TextRenderer({ answerData, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  return (
    <QuestionFrame question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={value === undefined || value === null ? "" : String(value)}
        editable={!question.isReadOnly}
        autoCapitalize="sentences"
        onChangeText={(value) => {
          setNativeQuestionValue(question, value);
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
