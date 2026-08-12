/** Displays a definition-selected answer or expression result as read-only native content. */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { getNativeQuestionValue } from "../nativeSurveyModel.js";
import { QuestionFrame } from "./QuestionFrame.js";

export function DisplayRenderer({ answerData, locale, question, title, subtitle, columns = [], rows = [] }) {
  if (!question) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <ScrollView horizontal contentContainerStyle={styles.table}>
          <View>
            <View style={[styles.row, styles.headerRow]}>
              {columns.map((column) => <Text key={column.key} style={[styles.cell, { width: column.width || 140 }]}>{column.title}</Text>)}
            </View>
            {rows.map((row, index) => (
              <View key={row.key || row.memberId || index} style={styles.row}>
                {columns.map((column) => <Text key={column.key} selectable style={[styles.cell, { width: column.width || 140 }]}>{String(row[column.key] ?? "-")}</Text>)}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }
  const rawValue = getNativeQuestionValue(question, answerData);
  const value = rawValue === undefined || rawValue === null || rawValue === ""
    ? "-"
    : String(rawValue);
  return <QuestionFrame locale={locale} question={question} tone="display"><Text style={styles.value}>{value}</Text></QuestionFrame>;
}

const styles = StyleSheet.create({
  value: { color: "#344054", fontSize: 16, fontWeight: "700" },
  panel: { gap: 8, padding: 14, borderWidth: 1, borderColor: "#d8dee4", borderRadius: 10, backgroundColor: "#ffffff" },
  title: { color: "#18202a", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#667085", fontSize: 13 },
  table: { minWidth: "100%" },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#eef2f5" },
  headerRow: { backgroundColor: "#f8fafc", borderTopWidth: 0 },
  cell: { paddingHorizontal: 8, paddingVertical: 10, color: "#18202a", fontSize: 13 },
});
