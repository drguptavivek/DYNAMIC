/** Handles Q22a by appending a pregnancy and returning to the same question. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

import {
  getNativeQuestionChoices,
  getNativeQuestionValue,
  setNativeQuestionValue,
  WQ_PREGNANCY_HISTORY_PANEL_FIELD,
} from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function WqPregnancySinceLastRenderer({ answerData, locale, question, onChange }) {
  const value = getNativeQuestionValue(question, answerData);
  const [selectedValue, setSelectedValue] = useState(value);
  const pendingValueRef = useRef(null);
  const disabled = question?.readOnly === true;

  useEffect(() => {
    if (
      pendingValueRef.current !== null &&
      (value === undefined || String(value) !== String(pendingValueRef.current))
    ) {
      return;
    }
    pendingValueRef.current = null;
    setSelectedValue(value);
  }, [question?.name, value]);

  const commitChoice = useCallback((choiceValue) => {
    if (disabled) return;

    if (String(choiceValue) === "1") {
      const survey = question.survey;
      const history = survey?.getQuestionByName?.(WQ_PREGNANCY_HISTORY_PANEL_FIELD);
      if (!history) return;

      pendingValueRef.current = null;
      setSelectedValue(undefined);
      survey?.setValue?.(question.name, undefined);
      history.dynamicInsertGroupPosition = undefined;
      history.dynamicReturnPageName = question.page?.name || "page_02b_reproduction_follow_up";
      history.dynamicReturnFocusQuestionName = question.name;
      history.dynamicAddRequestToken = Date.now();

      const historyPage = survey?.getPageByName?.("page_02a_pregnancy_history");
      if (historyPage) survey.currentPage = historyPage;
      onChange?.();
      return;
    }

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
  }, [answerData, disabled, onChange, question]);

  return (
    <QuestionFrame locale={locale} question={question}>
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
