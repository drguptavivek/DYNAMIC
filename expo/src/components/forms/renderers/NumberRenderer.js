/** Renders and normalizes a numeric Survey Core question using a native text input. */
import React, { useRef } from "react";
import { Alert, TextInput } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { validateRegexQuestion } from "../validators/RegexValidator.js";
import { getNativeKeyboardType, sanitizeNativeInputValue } from "./multipleTextValue.js";
import { shouldDeferMobileConfirmationToPanelCommit } from "./mobileNumberConfirmation.js";

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
  const lastPromptedValueRef = useRef("");
  const latestValueRef = useRef(value === undefined || value === null ? "" : String(value));
  const isMobileNumber =
    /mobile|telephone|phone/i.test(String(question?.name || "")) &&
    !/holder[_ ]?name/i.test(String(question?.name || "")) &&
    !shouldDeferMobileConfirmationToPanelCommit(question);

  function confirmMobileNumber(candidateValue) {
    const enteredValue = String(candidateValue ?? latestValueRef.current ?? "").trim();
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
        maxLength={question.maxLength > 0 ? question.maxLength : question.jsonObj?.maxLength}
        onChangeText={(value) => {
          const sanitized = sanitizeNativeInputValue(value, keyboardType);
          latestValueRef.current = sanitized;
          if (!sanitized) lastPromptedValueRef.current = "";
          setQuestionValue(question, sanitized);
        }}
        onEndEditing={(event) => {
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
