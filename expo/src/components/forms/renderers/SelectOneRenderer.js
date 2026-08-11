/** Renders one localized choice as an accessible native single-select control. */
import React from "react";
import { Pressable, Text, View } from "react-native";

import { getNativeQuestionChoices, getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function SelectOneRenderer({ answerData, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  return (
    <QuestionFrame question={question}>
      <View style={controlStyles.options}>
        {getNativeQuestionChoices(question).map((choice) => {
          const selected = String(value) === String(choice.value);
          return (
            <Pressable
              key={String(choice.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: question.isReadOnly }}
              disabled={question.isReadOnly}
              onPress={() => {
                setNativeQuestionValue(question, choice.value);
                question.validate?.();
                onChange?.();
              }}
              style={[controlStyles.option, selected && controlStyles.optionSelected]}
            >
              <View style={[controlStyles.optionMark, selected && controlStyles.optionMarkSelected]} />
              <Text style={controlStyles.optionText}>{choice.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </QuestionFrame>
  );
}
