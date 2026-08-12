/** Renders a SurveyJS multiple-text question as individually labeled native inputs. */
import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function MultipleTextRenderer({ answerData, locale, question, onChange }) {
  const modelValue =
    question.survey?.getValue?.(question.name) ??
    question.survey?.data?.[question.name] ??
    question.value;
  const answerValue = modelValue && typeof modelValue === "object"
    ? modelValue
    : answerData && Object.prototype.hasOwnProperty.call(answerData, question.name)
      ? answerData[question.name]
      : null;
  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={styles.items}>
        {(question.items || []).map((item) => (
          <View key={item.name} style={styles.item}>
            <Text style={styles.label}>{item.title || item.name}</Text>
            <TextInput
              accessibilityLabel={`${question.name}.${item.name}`}
              value={
                answerValue && Object.prototype.hasOwnProperty.call(answerValue, item.name)
                  ? String(answerValue[item.name] ?? "")
                  : item.value === undefined || item.value === null
                    ? ""
                    : String(item.value)
              }
              editable={!question.isReadOnly}
              keyboardType={item.inputType === "number" ? "numeric" : "default"}
              onChangeText={(value) => {
                item.value = item.inputType === "number" && value !== "" ? Number(value) : value || undefined;
                onChange?.();
              }}
              onBlur={() => {
                question.validate?.();
                onChange?.();
              }}
              style={[controlStyles.input, question.isReadOnly && controlStyles.readOnly]}
            />
          </View>
        ))}
      </View>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  items: { gap: 10 },
  item: { gap: 5 },
  label: { color: "#344054", fontSize: 13, fontWeight: "700" },
});
