/** Collects an LMP as an exact date, relative interval, or one special coded response. */
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  getNativeQuestionChoices,
  getNativeQuestionValue,
  setNativeQuestionValue,
} from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

const RELATIVE_UNITS = [
  { value: "days", text: "Days Ago" },
  { value: "weeks", text: "Weeks Ago" },
  { value: "months", text: "Months Ago" },
  { value: "years", text: "Years Ago" },
];

function digits(value, length) {
  return String(value || "").replace(/\D/g, "").slice(0, length);
}

export function WqLmpTimingRenderer({ answerData, locale, onChange, question }) {
  const [unitOpen, setUnitOpen] = useState(false);
  const value = getNativeQuestionValue(question, answerData);
  const objectValue = value && typeof value === "object" ? value : {};
  const mode = objectValue.mode || (value !== undefined && value !== null && value !== "" ? "special" : "");
  const disabled = question.readOnly === true || question.isReadOnly === true;

  function commit(nextValue) {
    if (disabled) return;
    setNativeQuestionValue(question, nextValue);
    // Defer required validation until the user advances. Selecting Date or
    // Relative time is only the mode choice; the date/interval fields are
    // entered immediately below it and should not show an error mid-entry.
    onChange?.();
  }

  function selectMode(nextMode) {
    setUnitOpen(false);
    if (nextMode === "date") commit({ mode: "date", day: "", month: "", year: "" });
    if (nextMode === "relative") commit({ mode: "relative", unit: "days", value: "" });
  }

  function radio(label, selected, onPress, key) {
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ disabled, selected }}
        disabled={disabled}
        key={key}
        onPress={onPress}
        style={[controlStyles.option, selected && controlStyles.optionSelected]}
      >
        <View style={[controlStyles.optionMark, selected && controlStyles.optionMarkSelected]} />
        <Text style={controlStyles.optionText}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={controlStyles.options}>
        {radio("Date", mode === "date", () => selectMode("date"), "date")}
        {mode === "date" ? (
          <View style={styles.dateRow}>
            {[
              ["day", "DD", 2],
              ["month", "MM", 2],
              ["year", "YYYY", 4],
            ].map(([field, placeholder, maxLength]) => (
              <TextInput
                accessibilityLabel={placeholder}
                editable={!disabled}
                key={field}
                keyboardType="number-pad"
                maxLength={maxLength}
                onChangeText={(text) => commit({ ...objectValue, mode: "date", [field]: digits(text, maxLength) })}
                placeholder={placeholder}
                style={[controlStyles.input, styles.dateInput]}
                value={String(objectValue[field] || "")}
              />
            ))}
          </View>
        ) : null}

        {radio("Relative time", mode === "relative", () => selectMode("relative"), "relative")}
        {mode === "relative" ? (
          <View style={styles.relativeWrap}>
            <Pressable
              disabled={disabled}
              onPress={() => setUnitOpen((open) => !open)}
              style={styles.dropdown}
            >
              <Text style={styles.dropdownText}>
                {RELATIVE_UNITS.find((unit) => unit.value === objectValue.unit)?.text || "Days Ago"}
              </Text>
              <Text style={styles.chevron}>{unitOpen ? "▲" : "▼"}</Text>
            </Pressable>
            {unitOpen ? (
              <View style={styles.dropdownMenu}>
                {RELATIVE_UNITS.map((unit) => (
                  <Pressable
                    key={unit.value}
                    onPress={() => {
                      setUnitOpen(false);
                      commit({ ...objectValue, mode: "relative", unit: unit.value });
                    }}
                    style={styles.dropdownItem}
                  >
                    <Text style={styles.dropdownText}>{unit.text}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <TextInput
              accessibilityLabel="Two digit relative time"
              editable={!disabled}
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={(text) => commit({ ...objectValue, mode: "relative", value: digits(text, 2) })}
              placeholder="00"
              style={[controlStyles.input, styles.numberInput]}
              value={String(objectValue.value || "")}
            />
          </View>
        ) : null}

        {getNativeQuestionChoices(question, locale).map((choice) =>
          radio(choice.text, mode === "special" && String(value) === String(choice.value), () => commit(choice.value), String(choice.value))
        )}
      </View>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", gap: 8, paddingLeft: 26 },
  dateInput: { minWidth: 0, flex: 1, textAlign: "center" },
  relativeWrap: { gap: 7, paddingLeft: 26 },
  dropdown: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderWidth: 1, borderColor: "#b8c2cc", borderRadius: 8, backgroundColor: "#fff" },
  dropdownMenu: { overflow: "hidden", borderWidth: 1, borderColor: "#b8c2cc", borderRadius: 8, backgroundColor: "#fff" },
  dropdownItem: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  dropdownText: { color: "#18202a", fontSize: 15, fontWeight: "700" },
  chevron: { color: "#475467", fontSize: 12 },
  numberInput: { width: 96, textAlign: "center" },
});
