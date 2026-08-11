/** Renders a native calendar control while preserving ISO dates in Survey Core. */
import React, { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@expo/ui/community/datetime-picker";

import {
  formatSurveyDate,
  formatSurveyDateDisplay,
  parseSurveyDate,
} from "../dateValue.js";
import { getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame } from "./QuestionFrame.js";

export function DateRenderer({ answerData, question, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const webInputRef = useRef(null);
  const value = getNativeQuestionValue(question, answerData);
  const selectedDate = parseSurveyDate(value) || new Date();
  const displayValue = formatSurveyDateDisplay(value);

  function setDateValue(date) {
    setNativeQuestionValue(question, formatSurveyDate(date));
    question.validate?.();
    onChange?.();
  }

  function openPicker() {
    if (question.isReadOnly) return;
    if (Platform.OS === "web") {
      const input = webInputRef.current;
      if (input?.showPicker) input.showPicker();
      else input?.focus?.();
      return;
    }
    setPickerOpen(true);
  }

  return (
    <QuestionFrame question={question}>
      <View style={styles.pickerWrap}>
        <Pressable
          accessibilityLabel={question.name}
          accessibilityRole="button"
          disabled={question.isReadOnly}
          onPress={openPicker}
          style={[styles.dateButton, question.isReadOnly && styles.readOnly]}
        >
          <Text style={[styles.dateText, !displayValue && styles.placeholder]}>
            {displayValue || "DD-MMM-YYYY"}
          </Text>
          <MaterialCommunityIcons color="#475467" name="calendar-month-outline" size={22} />
        </Pressable>
        {Platform.OS === "web" && !question.isReadOnly
          ? React.createElement("input", {
              "aria-label": question.name,
              max: question.maxValue || undefined,
              min: question.minValue || undefined,
              onClick: (event) => {
                if (event.currentTarget?.showPicker) event.currentTarget.showPicker();
              },
              onChange: (event) => {
                const nextDate = parseSurveyDate(event.target.value);
                if (nextDate) setDateValue(nextDate);
              },
              ref: webInputRef,
              style: styles.webDateInput,
              type: "date",
              value: value || "",
            })
          : null}
      </View>
      {pickerOpen && Platform.OS !== "web" ? (
        <DateTimePicker
          maximumDate={parseSurveyDate(question.maxValue) || undefined}
          minimumDate={parseSurveyDate(question.minValue) || undefined}
          mode="date"
          onDismiss={() => setPickerOpen(false)}
          onValueChange={(_event, date) => {
            setPickerOpen(false);
            if (date) setDateValue(date);
          }}
          presentation="dialog"
          value={selectedDate}
        />
      ) : null}
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  pickerWrap: { minHeight: 44, position: "relative" },
  dateButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: "#b8c2cc", borderRadius: 8, backgroundColor: "#ffffff" },
  readOnly: { backgroundColor: "#f3f4f6" },
  dateText: { flex: 1, color: "#18202a", fontSize: 16 },
  placeholder: { color: "#667085" },
  webDateInput: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2,
    width: "100%",
    height: "100%",
    cursor: "pointer",
    opacity: 0.01,
  },
});
