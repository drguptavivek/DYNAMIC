/** Renders a single-line native text question with blur-time validation. */
import React, { useRef } from "react";
import { Alert, TextInput } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";
import { getNativeKeyboardType } from "./multipleTextValue.js";

export function TextRenderer({ answerData, locale, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  const keyboardType = getNativeKeyboardType(question);
  const lastPromptedValueRef = useRef("");
  const isMobileNumber =
    /mobile|telephone|phone/i.test(String(question?.name || "")) &&
    !/holder[_ ]?name/i.test(String(question?.name || ""));

  function confirmMobileNumber() {
    const enteredValue = String(getNativeQuestionValue(question) || "").trim();
    if (!isMobileNumber || !enteredValue || enteredValue === lastPromptedValueRef.current) return;
    lastPromptedValueRef.current = enteredValue;
    Alert.alert(
      "Confirm mobile number",
      "Read this mobile number to the Respondent and confirm whether the number is correct or not.",
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
        autoCapitalize="sentences"
        onChangeText={(value) => {
          setNativeQuestionValue(question, value);
        }}
        onBlur={() => {
          validateRegexQuestion(question);
          onChange?.();
          confirmMobileNumber();
        }}
        style={[controlStyles.input, question.isReadOnly && controlStyles.readOnly]}
      />
    </QuestionFrame>
  );
}
