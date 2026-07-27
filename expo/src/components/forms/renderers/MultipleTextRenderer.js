/** Renders a SurveyJS multiple-text question as individually labeled native inputs. */
import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { QuestionFrame, controlStyles } from "./QuestionFrame.js";

export function MultipleTextRenderer({ question, onChange }) {
  return (
    <QuestionFrame question={question}>
      <View style={styles.items}>
        {(question.items || []).map((item) => (
          <View key={item.name} style={styles.item}>
            <Text style={styles.label}>{item.title || item.name}</Text>
            <TextInput
              accessibilityLabel={`${question.name}.${item.name}`}
              value={item.value === undefined || item.value === null ? "" : String(item.value)}
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
