/** Renders multiline narrative input while retaining Survey Core validation behavior. */
import React from "react";
import { TextInput } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function NoteRenderer({ answerData, locale, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  return (
    <QuestionFrame locale={locale} question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={value || ""}
        editable={!question.isReadOnly}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        onChangeText={(value) => {
          setNativeQuestionValue(question, value);
          onChange?.();
        }}
        onBlur={() => {
          question.validate?.();
          onChange?.();
        }}
        style={[controlStyles.input, { minHeight: 120 }, question.isReadOnly && controlStyles.readOnly]}
      />
    </QuestionFrame>
  );
}
