/** Renders label-only groups as parent choices while saving only final coded answers. */
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { getNativeQuestionChoices, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

const GROUP_CONFIGS = {
  hhq_main_source_drinking_water_members_household_piped_water: [
    { id: "piped", label: "PIPED WATER", childValues: [11, 12, 13, 14], childHint: "Select piped water source" },
    { id: "tube", value: 21 },
    { id: "dug", label: "DUG WELL", childValues: [31, 32], childHint: "Select dug well type" },
    { id: "spring", label: "WATER FROM SPRING", childValues: [41, 42], childHint: "Select spring type" },
    { id: "rain", value: 51 },
    { id: "tanker", value: 61 },
    { id: "cart", value: 71 },
    { id: "surface", value: 81 },
    { id: "bottled", value: 91 },
    { id: "ro", value: 92 },
    { id: "other", value: 96 },
  ],
  hhq_kind_toilet_facility_members_household_usually_use_flush: [
    { id: "flush", label: "FLUSH OR POUR FLUSH TOILET", childValues: [11, 12, 13, 14, 15], childHint: "Select flush toilet type" },
    { id: "pit", label: "PIT LATRINE", childValues: [21, 22, 23], childHint: "Select pit latrine type" },
    { id: "twin", value: 31 },
    { id: "dry", value: 41 },
    { id: "open", value: 51 },
    { id: "other", value: 96 },
  ],
  hhq_main_material_floor_natural_floor: [
    { id: "natural", label: "NATURAL FLOOR", childValues: [11, 12, 13], childHint: "Select natural floor material" },
    { id: "rudimentary", label: "RUDIMENTARY FLOOR", childValues: [21, 22, 23, 24], childHint: "Select rudimentary floor material" },
    { id: "finished", label: "FINISHED FLOOR", childValues: [31, 32, 33, 34, 35, 36], childHint: "Select finished floor material" },
    { id: "other", value: 96 },
  ],
  hhq_main_material_roof_natural_roofing: [
    { id: "natural", label: "NATURAL ROOFING", childValues: [11, 12, 13, 14, 15], childHint: "Select natural roofing material" },
    { id: "rudimentary", label: "RUDIMENTARY ROOFING", childValues: [21, 22, 23, 24, 25], childHint: "Select rudimentary roofing material" },
    { id: "finished", label: "FINISHED ROOFING", childValues: [31, 32, 33, 34, 35, 36, 37, 38, 39], childHint: "Select finished roofing material" },
    { id: "other", value: 96 },
  ],
  hhq_main_material_external_walls_natural_walls: [
    { id: "natural", label: "NATURAL WALLS", childValues: [11, 12, 13, 14], childHint: "Select natural wall material" },
    { id: "rudimentary", label: "RUDIMENTARY WALLS", childValues: [21, 22, 23, 24, 25, 26], childHint: "Select rudimentary wall material" },
    { id: "finished", label: "FINISHED WALLS", childValues: [31, 32, 33, 34, 35, 36], childHint: "Select finished wall material" },
    { id: "other", value: 96 },
  ],
};

export function GroupedCodedSingleSelectRenderer({ question, onChange }) {
  const groups = GROUP_CONFIGS[question.name] || [];
  const [expandedGroup, setExpandedGroup] = useState(null);
  const choices = getNativeQuestionChoices(question);
  const choiceByValue = useMemo(
    () => new Map(choices.map((choice) => [String(choice.value), choice])),
    [choices]
  );
  const selectedValue = question.value === undefined || question.value === null
    ? ""
    : String(question.value);
  const selectedGroup = groups.find((group) => {
    if (group.value !== undefined) return String(group.value) === selectedValue;
    return group.childValues?.some((value) => String(value) === selectedValue);
  });

  function selectFinalValue(value) {
    setNativeQuestionValue(question, value);
    question.validate?.();
    onChange?.();
  }

  function selectGroup(group) {
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
    const label = group.label || choiceByValue.get(String(group.value))?.text || String(group.value);
    return (
      <View key={group.id} style={styles.groupWrap}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: isSelected, disabled: question.isReadOnly }}
          disabled={question.isReadOnly}
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
            <Text style={styles.childHint}>{group.childHint || "Select option"}</Text>
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
        accessibilityState={{ selected, disabled: question.isReadOnly }}
        disabled={question.isReadOnly}
        onPress={() => selectFinalValue(value)}
        style={[styles.childOption, selected && styles.childOptionSelected]}
      >
        <View style={[controlStyles.optionMark, selected && controlStyles.optionMarkSelected]} />
        <Text style={controlStyles.optionText}>{`${value} ${choice?.text || ""}`.trim()}</Text>
      </Pressable>
    );
  }

  return (
    <QuestionFrame question={question}>
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
