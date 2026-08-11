/** Renders a value input whose database duplicate check runs at finalization. */
import React from "react";
import { TextInput } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";

export function DbCheckRenderer({ answerData, question, onChange }) {
  const readOnly = Boolean(question.isReadOnly || question.readOnly);
  const value = getNativeQuestionValue(question, answerData);

  return (
    <QuestionFrame question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={value === undefined || value === null ? "" : String(value)}
        editable={!readOnly}
        keyboardType="number-pad"
        onChangeText={(value) => {
          setNativeQuestionValue(question, value.replace(/[^0-9]/g, ""));
          onChange?.();
        }}
        onBlur={() => {
          validateRegexQuestion(question);
          onChange?.();
        }}
        style={[controlStyles.input, readOnly && controlStyles.readOnly]}
      />
    </QuestionFrame>
  );
}
