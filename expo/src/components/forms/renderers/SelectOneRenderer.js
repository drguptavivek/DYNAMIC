/** Renders one localized choice as an accessible native single-select control. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { getNativeQuestionChoices, getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { acceptHhqHighestGradeYearEntry } from "./hhqHighestGrade.js";

export function SelectOneRenderer({ answerData, locale, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  const [selectedValue, setSelectedValue] = useState(value);
  const pendingValueRef = useRef(null);
  const disabled = question?.readOnly === true;
  const usesYearsEntry =
    question?.renderAs === "years_with_special_codes" || question?.renderAs === "days_with_special_codes";
  const allowYearsOverrideSpecialCodes =
    question?.name === "member_highest_grade_completed" ||
    question?.allowYearsOverrideSpecialCodes === true ||
    question?.jsonObj?.allowYearsOverrideSpecialCodes === true;

  useEffect(() => {
    if (
      pendingValueRef.current !== null &&
      (value === undefined || String(value) !== String(pendingValueRef.current))
    ) {
      return;
    }
    pendingValueRef.current = null;
    setSelectedValue(value);
  }, [value, question?.name]);

  const commitChoice = useCallback(
    (choiceValue) => {
      if (disabled) return;
      pendingValueRef.current = choiceValue;
      setSelectedValue(choiceValue);
      const wrote = setNativeQuestionValue(question, choiceValue);
      if (wrote) {
        question.validate?.();
        onChange?.();
        return;
      }
      pendingValueRef.current = null;
      setSelectedValue(getNativeQuestionValue(question, answerData));
    },
    [answerData, disabled, onChange, question]
  );

  const commitYears = useCallback(
    (text) => {
      if (disabled) return;
      const nextValue = String(text || "").replace(/\D/g, "").slice(0, 2);
      pendingValueRef.current = nextValue;
      setSelectedValue(nextValue);
      const wrote = setNativeQuestionValue(question, nextValue);
      if (wrote) {
        const acceptedHighestGradeYear = acceptHhqHighestGradeYearEntry(question, nextValue);
        if (!acceptedHighestGradeYear) question.validate?.();
        if (allowYearsOverrideSpecialCodes && nextValue !== "") {
          clearRequiredValidationError(question);
        }
        onChange?.();
        return;
      }
      pendingValueRef.current = null;
      setSelectedValue(getNativeQuestionValue(question, answerData));
    },
    [allowYearsOverrideSpecialCodes, answerData, disabled, onChange, question]
  );

  const choices = useMemo(() => getNativeQuestionChoices(question, locale), [question, locale]);
  const choiceValues = useMemo(() => choices.map((choice) => String(choice.value)), [choices]);
  const specialChoiceSelected =
    usesYearsEntry && selectedValue !== undefined && choiceValues.includes(String(selectedValue));
  const yearInputDisabled = disabled || (specialChoiceSelected && !allowYearsOverrideSpecialCodes);
  const yearsValue =
    usesYearsEntry && selectedValue !== undefined && !choiceValues.includes(String(selectedValue))
      ? String(selectedValue)
      : "";
  if (
    allowYearsOverrideSpecialCodes &&
    selectedValue !== undefined &&
    selectedValue !== null &&
    selectedValue !== ""
  ) {
    clearRequiredValidationError(question);
  }

  return (
    <QuestionFrame locale={locale} question={question}>
      {usesYearsEntry ? (
        <View style={styles.yearsRow}>
          <TextInput
            accessibilityLabel="Entry"
            editable={!yearInputDisabled}
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={commitYears}
            onEndEditing={() => {
              if (yearsValue.length === 1) commitYears(yearsValue.padStart(2, "0"));
            }}
            placeholder="00"
            style={[controlStyles.input, styles.yearsInput, yearInputDisabled && controlStyles.readOnly]}
            value={yearsValue}
          />
          <Text style={styles.yearsLabel}>
            {question?.renderAs === "days_with_special_codes" ? "Days" : "Years"}
          </Text>
        </View>
      ) : null}
      <View style={controlStyles.options}>
        {choices.map((choice) => {
          const selected = String(selectedValue) === String(choice.value);
          return (
            <TouchableOpacity
              key={String(choice.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: disabled || choice.disabled === true }}
              activeOpacity={0.82}
              disabled={disabled || choice.disabled === true}
              onPress={() => commitChoice(choice.value)}
              style={[controlStyles.option, selected && controlStyles.optionSelected, choice.disabled && { opacity: 0.55 }]}
            >
              <View style={[controlStyles.optionMark, selected && controlStyles.optionMarkSelected]} />
              <Text style={controlStyles.optionText}>{choice.text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </QuestionFrame>
  );
}

function clearRequiredValidationError(question) {
  if (!Array.isArray(question?.errors) || question.errors.length === 0) return;
  question.errors = question.errors.filter((error) => {
    const text = typeof error === "string"
      ? error
      : typeof error?.getText === "function"
        ? error.getText()
        : error?.text || String(error || "");
    return !/response\s+required|required\s+response/i.test(String(text));
  });
}

const styles = StyleSheet.create({
  yearsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  yearsInput: {
    minWidth: 96,
    textAlign: "center",
  },
  yearsLabel: {
    color: "#344054",
    fontSize: 16,
    fontWeight: "700",
  },
});
