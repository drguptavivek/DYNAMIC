/** Renders localized checkbox choices and maintains a Survey Core array value. */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getNativeQuestionChoices, getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function SelectManyRenderer({ answerData, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  const selectedValues = Array.isArray(value) ? value : [];
  return (
    <QuestionFrame question={question}>
      <View style={controlStyles.options}>
        {getNativeQuestionChoices(question).map((choice) => {
          const selected = selectedValues.some((value) => String(value) === String(choice.value));
          return (
            <Pressable
              key={String(choice.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: question.isReadOnly }}
              disabled={question.isReadOnly}
              onPress={() => {
                const next = selected
                  ? selectedValues.filter((value) => String(value) !== String(choice.value))
                  : [...selectedValues, choice.value];
                setNativeQuestionValue(question, next);
                question.validate?.();
                onChange?.();
              }}
              style={[controlStyles.option, selected && controlStyles.optionSelected]}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <Text style={controlStyles.optionText}>{choice.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    width: 21,
    height: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#98a2b3",
    borderRadius: 4,
  },
  checkboxSelected: { borderColor: "#1f6feb", backgroundColor: "#1f6feb" },
  check: { color: "#ffffff", fontWeight: "900", lineHeight: 17 },
});
