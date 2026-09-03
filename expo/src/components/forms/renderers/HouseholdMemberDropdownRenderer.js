/** Renders a dynamic household-member dropdown for task-context linked questions. */
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  WQ_HUSBAND_NOT_IN_HOUSEHOLD_VALUE,
  resolveWqHusbandPartnerSelection,
} from "../../../lib/womanSurveyBehaviors.js";
import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function HouseholdMemberDropdownRenderer({ answerData, locale, question, onChange }) {
  const [open, setOpen] = useState(false);
  const value = getNativeQuestionValue(question, answerData);
  const disabled = question?.readOnly === true;
  const choices = Array.isArray(question.householdMemberChoices)
    ? question.householdMemberChoices
    : [];
  const lineNumberField = question.husbandPartnerLineNumberField;
  const lineNumberValue = lineNumberField ? question.survey?.getValue?.(lineNumberField) : undefined;
  const selection = useMemo(
    () => resolveWqHusbandPartnerSelection({ nameValue: value, lineNumberValue, choices }),
    [choices, value, lineNumberValue]
  );
  const selectedChoice = selection.choice;
  const selectedText =
    selectedChoice?.text ||
    (value === undefined || value === null || value === "" ? "Select member" : String(value));

  function commitChoice(choice) {
    if (disabled) return;
    const wrote = setNativeQuestionValue(question, choice.value);
    if (wrote && lineNumberField) {
      question.survey?.setValue?.(lineNumberField, choice.lineNumber);
    }
    if (wrote && question.husbandPartnerMemberIdField) {
      question.survey?.setValue?.(question.husbandPartnerMemberIdField, choice.memberId || "");
    }
    setOpen(false);
    question.validate?.();
    onChange?.();
  }

  // "Husband not in household": Q18 stores the typed name; while it is empty
  // the sentinel text is kept so the outside selection survives a reload.
  function commitOutsideName(text) {
    if (disabled) return;
    const trimmed = String(text || "");
    setNativeQuestionValue(
      question,
      trimmed.trim() === "" ? WQ_HUSBAND_NOT_IN_HOUSEHOLD_VALUE : trimmed
    );
  }

  return (
    <QuestionFrame locale={locale} question={question}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.dropdown, disabled && controlStyles.readOnly]}
      >
        <Text style={[styles.dropdownText, !value && styles.placeholder]} numberOfLines={2}>
          {selectedText}
        </Text>
        <Text style={styles.chevron}>v</Text>
      </Pressable>
      {!choices.length ? (
        <Text style={controlStyles.status}>No household members available on this device.</Text>
      ) : null}
      {selection.mode === "outside" ? (
        <View style={styles.outsideName}>
          <Text style={styles.outsideLabel}>
            {`Husband's or partner's name (not listed in the household; line number ${
              selectedChoice?.lineNumber || lineNumberValue || "00"
            })`}
          </Text>
          <TextInput
            accessibilityLabel={`${question.name}-outside-name`}
            autoCapitalize="words"
            editable={!disabled}
            onBlur={() => {
              question.validate?.();
              onChange?.();
            }}
            onChangeText={commitOutsideName}
            placeholder="Type the husband's or partner's name"
            style={[controlStyles.input, disabled && controlStyles.readOnly]}
            value={selection.typedName}
          />
        </View>
      ) : null}
      {open ? (
        <View style={styles.inlineMenu}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>Select household member</Text>
            <Pressable onPress={() => setOpen(false)} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView nestedScrollEnabled style={styles.choiceList}>
            {choices.map((choice) => {
              const selected = selectedChoice ? choice === selectedChoice : false;
              return (
                <Pressable
                  key={`${choice.lineNumber}-${choice.value}`}
                  onPress={() => commitChoice(choice)}
                  style={[styles.choice, selected && styles.choiceSelected]}
                >
                  <Text style={styles.choiceText}>{choice.text}</Text>
                  {choice.detail ? <Text style={styles.choiceDetail}>{choice.detail}</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#b8c2cc",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  dropdownText: { flex: 1, color: "#18202a", fontSize: 16, lineHeight: 22 },
  placeholder: { color: "#667085" },
  chevron: { color: "#475467", fontSize: 18, fontWeight: "800" },
  outsideName: { marginTop: 8, gap: 6 },
  outsideLabel: { color: "#475467", fontSize: 13, fontWeight: "700" },
  inlineMenu: {
    marginTop: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f6",
    backgroundColor: "#f8fafc",
  },
  menuTitle: { color: "#18202a", fontSize: 15, fontWeight: "800" },
  closeButton: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
  },
  closeText: { color: "#18202a", fontWeight: "700" },
  choiceList: { maxHeight: 260 },
  choice: {
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f6",
  },
  choiceSelected: {
    borderRadius: 8,
    borderBottomColor: "#b9dcff",
    backgroundColor: "#eef6ff",
  },
  choiceText: { color: "#18202a", fontSize: 16, fontWeight: "700" },
  choiceDetail: { color: "#667085", fontSize: 13 },
});
