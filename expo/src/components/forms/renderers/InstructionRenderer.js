/** Renders author-supplied instructional content as read-only native text. */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { stripSurveyHtml } from "../nativeSurveyModel.js";

export function InstructionRenderer({ question }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.text}>{stripSurveyHtml(question.html)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 14, borderRadius: 8, backgroundColor: "#fff8cc", borderWidth: 1, borderColor: "#e6c84f" },
  text: { color: "#5c4700", fontSize: 14, fontWeight: "700", lineHeight: 20 },
});
