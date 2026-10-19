/** BWQ Q9b stores a month/year or the existing 98 (Do not remember) code. */
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getNativeFormText } from "../../../lib/nativeFormText.js";
import { getNativeQuestionChoices, getNativeQuestionValue, setNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function WqTransfusionTimingRenderer({ answerData, locale, onChange, question }) {
  const value = getNativeQuestionValue(question, answerData);
  const date = value && typeof value === "object" ? value : {};
  const disabled = question.readOnly === true || question.isReadOnly === true;
  const t = (key, fallback) => getNativeFormText(question.survey, key, fallback, locale);
  const commit = (next) => {
    if (disabled) return;
    setNativeQuestionValue(question, next);
    onChange?.();
  };
  function changePart(field, text, length) {
    const next = { month: String(date.month || ""), year: String(date.year || ""),
      [field]: String(text).replace(/\D/g, "").slice(0, length) };
    commit(next.month || next.year ? next : undefined);
  }
  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={styles.row}>
        {[
          ["month", t("transfusion_month", "Month (MM)"), 2],
          ["year", t("transfusion_year", "Year (YYYY)"), 4],
        ].map(([field, label, length]) => (
          <View key={field} style={styles.field}>
            <Text style={controlStyles.optionText}>{label}</Text>
            <TextInput accessibilityLabel={label} editable={!disabled} keyboardType="number-pad"
              maxLength={length} placeholder={field === "month" ? "MM" : "YYYY"}
              style={controlStyles.input} value={String(date[field] || "")}
              onChangeText={(text) => changePart(field, text, length)} />
          </View>
        ))}
      </View>
      {getNativeQuestionChoices(question, locale).map((choice) => {
        const selected = String(value) === String(choice.value);
        return (
          <Pressable key={String(choice.value)} accessibilityRole="radio"
            accessibilityState={{ disabled, selected }} disabled={disabled}
            onPress={() => commit(selected ? undefined : choice.value)}
            style={[controlStyles.option, selected && controlStyles.optionSelected]}>
            <View style={[controlStyles.optionMark, selected && controlStyles.optionMarkSelected]} />
            <Text style={controlStyles.optionText}>{choice.text}</Text>
          </Pressable>
        );
      })}
    </QuestionFrame>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, marginBottom: 10 },
  field: { flex: 1, minWidth: 0, gap: 6 },
});
