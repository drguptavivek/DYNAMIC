/** Renders the current answer model as a human-readable native review summary. */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { buildNativeSurveyPreview } from "../nativeSurveyModel.js";

export function PreviewRenderer({ locale, model }) {
  const pages = buildNativeSurveyPreview(model, locale);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {pages.map((page) => (
        <View key={page.name} style={styles.section}>
          <Text style={styles.sectionTitle}>{page.title}</Text>
          {page.questions.map((question) =>
            question.panelRows ? (
              <View key={question.name} style={styles.repeatBlock}>
                <Text style={styles.questionTitle}>{question.title}</Text>
                {question.panelRows.map((panel) => (
                  <View key={panel.index} style={styles.repeatRow}>
                    <Text style={styles.rowTitle}>{`Row ${panel.index}`}</Text>
                    {panel.questions.map((item) => (
                      <View key={item.name} style={styles.answerRow}>
                        <Text style={styles.label}>{item.title}</Text>
                        <Text style={styles.value}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View key={question.name} style={styles.answerRow}>
                <Text style={styles.label}>{question.title}</Text>
                <Text style={styles.value}>{question.value}</Text>
              </View>
            )
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 32 },
  section: { gap: 8, padding: 14, borderWidth: 1, borderColor: "#d8dee4", borderRadius: 10, backgroundColor: "#ffffff" },
  sectionTitle: { color: "#18202a", fontSize: 18, fontWeight: "800" },
  answerRow: { gap: 3, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#eef2f5" },
  label: { color: "#475467", fontSize: 13, fontWeight: "700" },
  value: { color: "#18202a", fontSize: 15 },
  repeatBlock: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#eef2f5" },
  questionTitle: { color: "#18202a", fontSize: 15, fontWeight: "800" },
  repeatRow: { gap: 2, padding: 10, borderRadius: 8, backgroundColor: "#f8fafc" },
  rowTitle: { color: "#1f6feb", fontSize: 13, fontWeight: "800" },
});
