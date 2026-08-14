/** Renders one localized choice as an accessible native single-select control. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { getNativeQuestionChoices, getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function SelectOneRenderer({ answerData, locale, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  const [selectedValue, setSelectedValue] = useState(value);
  const pendingValueRef = useRef(null);
  const disabled = question?.readOnly === true;
  const usesYearsEntry = question?.renderAs === "years_with_special_codes";

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
        question.validate?.();
        onChange?.();
        return;
      }
      pendingValueRef.current = null;
      setSelectedValue(getNativeQuestionValue(question, answerData));
    },
    [answerData, disabled, onChange, question]
  );

  const choiceValues = getNativeQuestionChoices(question, locale).map((choice) => String(choice.value));
  const yearsValue =
    usesYearsEntry && selectedValue !== undefined && !choiceValues.includes(String(selectedValue))
      ? String(selectedValue)
      : "";

  return (
    <QuestionFrame locale={locale} question={question}>
      {usesYearsEntry ? (
        <View style={styles.yearsRow}>
          <TextInput
            accessibilityLabel="Years"
            editable={!disabled}
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={commitYears}
            onEndEditing={() => {
              if (yearsValue.length === 1) commitYears(yearsValue.padStart(2, "0"));
            }}
            placeholder="00"
            style={[controlStyles.input, styles.yearsInput, disabled && controlStyles.readOnly]}
            value={yearsValue}
          />
          <Text style={styles.yearsLabel}>Years</Text>
        </View>
      ) : null}
      <View style={controlStyles.options}>
        {getNativeQuestionChoices(question, locale).map((choice) => {
          const selected = String(selectedValue) === String(choice.value);
          return (
            <TouchableOpacity
              key={String(choice.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              activeOpacity={0.82}
              disabled={disabled}
              onPress={() => commitChoice(choice.value)}
              style={[controlStyles.option, selected && controlStyles.optionSelected]}
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
