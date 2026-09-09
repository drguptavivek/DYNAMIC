/** Renders and normalizes a numeric Survey Core question using a native text input. */
import React from "react";
import { TextInput } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";
import { getNativeKeyboardType, sanitizeNativeInputValue } from "./multipleTextValue.js";

function setQuestionValue(question, value) {
  const preserveString = question?.preserveString === true || question?.jsonObj?.preserveString === true;
  const inputType = question?.inputType || question?.jsonObj?.inputType;
  if (!(preserveString && inputType === "number")) {
    setNativeQuestionValue(question, value);
    return;
  }

  // setNativeQuestionValue intentionally converts SurveyJS number questions to
  // Number. Fixed-width fields opt out so values such as "00" remain strings.
  if (!question || question.readOnly === true) return;
  const normalizedValue = value === "" ? undefined : value;
  const parentType = question.parent?.getType?.() || question.parent?.type;
  if (parentType !== "panel") {
    question.survey?.setValue?.(question.name, normalizedValue);
    question.data?.setValue?.(question.name, normalizedValue);
  }
  question.value = normalizedValue;
}

export function NumberRenderer({ answerData, locale, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  const keyboardType = getNativeKeyboardType(question);
  return (
    <QuestionFrame locale={locale} question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={value === undefined || value === null ? "" : String(value)}
        editable={!question.isReadOnly}
        keyboardType={keyboardType}
        maxLength={question.maxLength > 0 ? question.maxLength : question.jsonObj?.maxLength}
        onChangeText={(value) => {
          const sanitized = sanitizeNativeInputValue(value, keyboardType);
          setQuestionValue(question, sanitized);
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
