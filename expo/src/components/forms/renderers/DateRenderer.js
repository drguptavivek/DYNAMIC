/** Renders an ISO date question with native input semantics and Survey Core validation. */
import React from "react";
import { TextInput } from "react-native";

import { setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function DateRenderer({ question, onChange }) {
  return (
    <QuestionFrame question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={question.value || ""}
        editable={!question.isReadOnly}
        keyboardType="numbers-and-punctuation"
        placeholder="YYYY-MM-DD"
        maxLength={10}
        onChangeText={(value) => {
          setNativeQuestionValue(question, value.replace(/[^0-9-]/g, ""));
          onChange?.();
        }}
        onBlur={() => {
          question.validate?.();
          onChange?.();
        }}
        style={[controlStyles.input, question.isReadOnly && controlStyles.readOnly]}
      />
    </QuestionFrame>
  );
}
