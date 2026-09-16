/** Renders BWQ Q10 as progressively less precise date-of-birth entry. */
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";
import {
  activateWqProgressiveDobMode,
  normalizeWqProgressiveDob,
  sanitizeWqProgressiveDobPart,
} from "../../../lib/wqProgressiveDob.js";

function ModeRadio({ disabled, label, onPress, selected }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[controlStyles.option, selected && controlStyles.optionSelected]}
    >
      <View style={[controlStyles.optionMark, selected && controlStyles.optionMarkSelected]} />
      <Text style={controlStyles.optionText}>{label}</Text>
    </Pressable>
  );
}

export function WqProgressiveDobRenderer({ answerData, locale, onChange, question }) {
  const rawValue = getNativeQuestionValue(question, answerData);
  const value = normalizeWqProgressiveDob(rawValue);
  const disabled = question.readOnly === true || question.isReadOnly === true;

  function commit(nextValue) {
    if (disabled) return;
    setNativeQuestionValue(question, nextValue);
    onChange?.();
  }

  function activate(mode) {
    commit(activateWqProgressiveDobMode(value, mode));
  }

  function update(mode, field, text, maxLength) {
    const active = value.mode === mode ? value : activateWqProgressiveDobMode(value, mode);
    commit({ ...active, mode, [field]: sanitizeWqProgressiveDobPart(field, text, maxLength) });
  }

  function dateInputs(mode, fields) {
    return (
      <View style={styles.dateRow}>
        {fields.map(([field, placeholder, maxLength]) => (
          <TextInput
            accessibilityLabel={`Q10 ${placeholder}`}
            editable={!disabled}
            key={`${mode}-${field}`}
            keyboardType="number-pad"
            maxLength={maxLength}
            onFocus={() => {
              if (value.mode !== mode) activate(mode);
            }}
            onChangeText={(text) => update(mode, field, text, maxLength)}
            placeholder={placeholder}
            style={[controlStyles.input, styles.dateInput, disabled && controlStyles.readOnly]}
            value={value.mode === mode ? String(value[field] || "") : ""}
          />
        ))}
      </View>
    );
  }

  const atLeastMonthYear = ["month_year", "year", "unknown"].includes(value.mode);
  const atLeastYear = ["year", "unknown"].includes(value.mode);

  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={styles.wrap}>
        <Text style={styles.optionTitle}>Option 1: Enter DD / MM / YYYY</Text>
        {dateInputs("exact", [["day", "DD", 2], ["month", "MM", 2], ["year", "YYYY", 4]])}
        <ModeRadio
          disabled={disabled}
          label="Don't know DOB"
          onPress={() => activate("month_year")}
          selected={atLeastMonthYear}
        />

        {atLeastMonthYear ? (
          <View style={styles.level}>
            <Text style={styles.optionTitle}>Option 2: Enter MM / YYYY</Text>
            {dateInputs("month_year", [["month", "MM", 2], ["year", "YYYY", 4]])}
            <ModeRadio
              disabled={disabled}
              label="Don't know MM/YY"
              onPress={() => activate("year")}
              selected={atLeastYear}
            />
          </View>
        ) : null}

        {atLeastYear ? (
          <View style={styles.level}>
            <Text style={styles.optionTitle}>Option 3: Enter YYYY</Text>
            {dateInputs("year", [["year", "YYYY", 4]])}
            <ModeRadio
              disabled={disabled}
              label="Don't know anything"
              onPress={() => activate("unknown")}
              selected={value.mode === "unknown"}
            />
          </View>
        ) : null}
      </View>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9 },
  level: { gap: 9, paddingTop: 3 },
  optionTitle: { color: "#344054", fontSize: 14, fontWeight: "800" },
  dateRow: { flexDirection: "row", gap: 8 },
  dateInput: { minWidth: 0, flex: 1, textAlign: "center" },
});
