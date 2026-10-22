/** Renders label-only groups as parent choices while saving only final coded answers. */
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { getNativeQuestionChoices, getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import { GROUP_CONFIGS, groupedChoiceTextKey } from "../../../lib/groupedChoiceText.js";
import { getNativeFormText } from "../../../lib/nativeFormText.js";

export function GroupedCodedSingleSelectRenderer({ answerData, locale, question, onChange }) {
  const groups = GROUP_CONFIGS[question.name] || [];
  const [expandedGroup, setExpandedGroup] = useState(null);
  const choices = getNativeQuestionChoices(question, locale);
  const choiceByValue = useMemo(
    () => new Map(choices.map((choice) => [String(choice.value), choice])),
    [choices]
  );
  const value = getNativeQuestionValue(question, answerData);
  const disabled = question?.readOnly === true;
  const selectedValue = value === undefined || value === null
    ? ""
    : String(value);
  const selectedGroup = groups.find((group) => {
    if (group.value !== undefined) return String(group.value) === selectedValue;
    return group.childValues?.some((value) => String(value) === selectedValue);
  });

  function selectFinalValue(value) {
    if (disabled) return;
    setNativeQuestionValue(question, value);
    question.validate?.();
    onChange?.();
  }

  function selectGroup(group) {
    if (disabled) return;
    if (group.value !== undefined) {
      setExpandedGroup(null);
      selectFinalValue(group.value);
      return;
    }
    setExpandedGroup((current) => (current === group.id ? null : group.id));
  }

  function renderParent(group) {
    const hasChildren = Array.isArray(group.childValues);
    const isSelected = selectedGroup?.id === group.id;
    const isExpanded = expandedGroup === group.id || (hasChildren && isSelected);
    const label = (group.label && getNativeFormText(question, groupedChoiceTextKey(question.name, group.id, "label"), group.label, locale)) || choiceByValue.get(String(group.value))?.text || String(group.value);
    return (
      <View key={group.id} style={styles.groupWrap}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: isSelected, disabled }}
          disabled={disabled}
          onPress={() => selectGroup(group)}
          style={[controlStyles.option, isSelected && controlStyles.optionSelected]}
        >
          <View style={[controlStyles.optionMark, isSelected && controlStyles.optionMarkSelected]} />
          <Text style={controlStyles.optionText}>{label}</Text>
          {hasChildren ? (
            <MaterialCommunityIcons
              color="#475467"
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={22}
            />
          ) : null}
        </Pressable>
        {hasChildren && isExpanded ? (
          <View style={styles.childList}>
            <Text style={styles.childHint}>{getNativeFormText(question, groupedChoiceTextKey(question.name, group.id, "childHint"), group.childHint || "Select option", locale)}</Text>
            {group.childValues.map((value) => renderChild(value))}
          </View>
        ) : null}
      </View>
    );
  }

  function renderChild(value) {
    const choice = choiceByValue.get(String(value));
    const selected = selectedValue === String(value);
    return (
      <Pressable
        key={String(value)}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={() => selectFinalValue(value)}
        style={[styles.childOption, selected && styles.childOptionSelected]}
      >
        <View style={[controlStyles.optionMark, selected && controlStyles.optionMarkSelected]} />
        <Text style={controlStyles.optionText}>{`${value} ${choice?.text || ""}`.trim()}</Text>
      </Pressable>
    );
  }

  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={controlStyles.options}>
        {groups.map(renderParent)}
      </View>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  groupWrap: { gap: 6 },
  childList: {
    gap: 6,
    marginLeft: 14,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: "#d0d5dd",
  },
  childHint: { color: "#667085", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  childOption: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  childOptionSelected: {
    borderColor: "#1f6feb",
    backgroundColor: "#eef6ff",
  },
});
