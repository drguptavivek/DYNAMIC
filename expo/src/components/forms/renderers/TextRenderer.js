/** Renders a single-line native text question with blur-time validation. */
import React, { useRef } from "react";
import { Alert, TextInput } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";
import { getNativeKeyboardType } from "./multipleTextValue.js";
import {
  getMobileNumberConfirmationMessage,
  shouldConfirmMobileNumberOnInput,
} from "./mobileNumberConfirmation.js";

export function TextRenderer({ answerData, locale, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  const keyboardType = getNativeKeyboardType(question);
  const lastPromptedValueRef = useRef("");
  const latestValueRef = useRef(value === undefined || value === null ? "" : String(value));
  const isMobileNumber = shouldConfirmMobileNumberOnInput(question);

  function confirmMobileNumber(candidateValue) {
    const enteredValue = String(candidateValue ?? latestValueRef.current ?? "").trim();
    if (!isMobileNumber || !enteredValue || enteredValue === lastPromptedValueRef.current) return;
    lastPromptedValueRef.current = enteredValue;
    Alert.alert(
      "Confirm mobile number",
      getMobileNumberConfirmationMessage(question),
      [{ text: "Yes" }, { text: "No" }],
    );
  }

  return (
    <QuestionFrame locale={locale} question={question}>
      <TextInput
        accessibilityLabel={question.name}
        value={value === undefined || value === null ? "" : String(value)}
        editable={!question.isReadOnly}
        keyboardType={keyboardType}
        maxLength={question.maxLength > 0 ? question.maxLength : question.jsonObj?.maxLength}
        autoCapitalize="sentences"
        onChangeText={(value) => {
          latestValueRef.current = value;
          if (!value) lastPromptedValueRef.current = "";
          setNativeQuestionValue(question, value);
        }}
        onEndEditing={(event) => {
          // Android may emit endEditing with the latest text before the
          // question model has re-rendered. Use the native event value.
          confirmMobileNumber(event?.nativeEvent?.text ?? latestValueRef.current);
        }}
        onSubmitEditing={(event) => {
          confirmMobileNumber(event?.nativeEvent?.text ?? latestValueRef.current);
        }}
        onBlur={(event) => {
          validateRegexQuestion(question);
          onChange?.();
          confirmMobileNumber(event?.nativeEvent?.text ?? latestValueRef.current);
        }}
        style={[controlStyles.input, question.isReadOnly && controlStyles.readOnly]}
      />
    </QuestionFrame>
  );
}
