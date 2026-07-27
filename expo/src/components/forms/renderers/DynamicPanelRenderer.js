/**
 * Renders repeat entries with a count, explicit row selection, editing, addition, and deletion.
 */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getNativeQuestionErrors, getNativeQuestionTitle } from "../nativeSurveyModel.js";
import { controlStyles } from "./QuestionFrame.js";

export function DynamicPanelRenderer({ question, onChange, renderQuestion }) {
  const [editingIndex, setEditingIndex] = useState(0);
  const errors = getNativeQuestionErrors(question);
  const panels = question.panels || [];

  useEffect(() => {
    if (editingIndex >= panels.length) setEditingIndex(Math.max(0, panels.length - 1));
  }, [editingIndex, panels.length]);

  function entryLabel(panel, index) {
    const memberName = panel.getQuestionByName?.("member_name")?.value;
    if (memberName !== undefined && memberName !== null && memberName !== "") {
      return String(memberName);
    }
    const answeredQuestion = (panel.questions || []).find(
      (item) => !item.isReadOnly && item.value !== undefined && item.value !== null && item.value !== ""
    );
    return answeredQuestion ? String(answeredQuestion.value) : `Entry ${index + 1}`;
  }

  function removeEntry(index) {
    question.removePanel(index);
    setEditingIndex(Math.max(0, Math.min(index, question.panelCount - 1)));
    onChange?.();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{getNativeQuestionTitle(question)}</Text>
        <Text style={styles.count}>{`${panels.length} ${panels.length === 1 ? "entry" : "entries"} added`}</Text>
      </View>
      <View style={styles.entryList}>
        {panels.map((panel, index) => (
          <View key={panel.id || index} style={[styles.entryRow, index === editingIndex && styles.entryRowActive]}>
            <Pressable onPress={() => setEditingIndex(index)} style={styles.editEntryButton}>
              <Text style={styles.entryNumber}>{index + 1}</Text>
              <View style={styles.entryText}>
                <Text style={styles.entryLabel} numberOfLines={1}>{entryLabel(panel, index)}</Text>
                <Text style={styles.entryAction}>{index === editingIndex ? "Editing" : "Edit entry"}</Text>
              </View>
            </Pressable>
            {question.allowRemovePanel !== false && question.panelCount > Number(question.minPanelCount || 0) ? (
              <Pressable
                accessibilityLabel={`Delete entry ${index + 1}`}
                onPress={() => removeEntry(index)}
                style={controlStyles.secondaryButton}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {panels[editingIndex] ? (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{`Editing entry ${editingIndex + 1}`}</Text>
          </View>
          {(panels[editingIndex].questions || [])
            .filter((child) => child.isVisible !== false)
            .map((child) => renderQuestion(child, `${question.name}-${editingIndex}-${child.name}`))}
        </View>
      ) : null}
      {errors.map((error, index) => <Text key={`${error}-${index}`} style={styles.error}>{error}</Text>)}
      {question.allowAddPanel !== false ? (
        <Pressable
          onPress={() => {
            question.addPanel();
            setEditingIndex(question.panelCount - 1);
            onChange?.();
          }}
          style={controlStyles.button}
        >
          <Text style={controlStyles.buttonText}>{question.addPanelText || "Add row"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { color: "#18202a", fontSize: 18, fontWeight: "800" },
  count: { color: "#1f6feb", fontSize: 13, fontWeight: "800" },
  entryList: { gap: 7 },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  entryRowActive: { borderColor: "#1f6feb", backgroundColor: "#eef6ff" },
  editEntryButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  entryNumber: { width: 28, height: 28, paddingTop: 4, borderRadius: 14, textAlign: "center", color: "#ffffff", backgroundColor: "#1f6feb", fontWeight: "800" },
  entryText: { flex: 1 },
  entryLabel: { color: "#18202a", fontSize: 14, fontWeight: "800" },
  entryAction: { color: "#667085", fontSize: 12 },
  deleteText: { color: "#b42318", fontWeight: "800" },
  panel: { gap: 10, padding: 12, borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 10, backgroundColor: "#f8fbff" },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  panelTitle: { color: "#1f4d7a", fontSize: 15, fontWeight: "800" },
  error: { color: "#d92d20", fontSize: 13, fontWeight: "700" },
});
