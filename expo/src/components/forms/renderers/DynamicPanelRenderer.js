/**
 * Renders repeat entries with a count, explicit row selection, editing, addition, and deletion.
 */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { getNativeQuestionErrors, getNativeQuestionTitle } from "../nativeSurveyModel.js";
import { controlStyles } from "./QuestionFrame.js";

export function DynamicPanelRenderer({ question, onChange, renderQuestion }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editorMode, setEditorMode] = useState(null);
  const errors = getNativeQuestionErrors(question);
  const panels = question.panels || [];
  const committedPanels = panels
    .map((panel, index) => ({ panel, index }))
    .filter(({ panel, index }) =>
      panelHasAnswer(panel) && (editorMode !== "add" || index !== editingIndex)
    );

  useEffect(() => {
    if (editingIndex !== null && editingIndex >= panels.length) {
      setEditingIndex(null);
      setEditorMode(null);
    }
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
    if (question.panelCount > Number(question.minPanelCount || 0)) {
      question.removePanel(index);
    } else {
      clearPanelValues(panels[index]);
    }
    setEditingIndex(null);
    setEditorMode(null);
    onChange?.();
  }

  function startEditing(index) {
    setEditingIndex(index);
    setEditorMode("edit");
  }

  function startAdding() {
    const emptyPanelIndex = panels.findIndex((panel) => !panelHasAnswer(panel));
    if (emptyPanelIndex >= 0) {
      setEditingIndex(emptyPanelIndex);
    } else {
      question.addPanel();
      setEditingIndex(question.panelCount - 1);
    }
    setEditorMode("add");
    onChange?.();
  }

  function closeEditor() {
    if (editorMode === "add" && editingIndex !== null) {
      if (question.panelCount > Number(question.minPanelCount || 0)) {
        question.removePanel(editingIndex);
      } else {
        clearPanelValues(panels[editingIndex]);
      }
      onChange?.();
    }
    setEditingIndex(null);
    setEditorMode(null);
  }

  function commitEntry() {
    const activePanel = editingIndex === null ? null : panels[editingIndex];
    const visibleQuestions = (activePanel?.questions || []).filter(
      (child) => child.isVisible !== false
    );
    const valid = visibleQuestions.map((child) => child.validate?.() !== false).every(Boolean);
    onChange?.();
    if (!valid || visibleQuestions.some((child) => child.errors?.length)) return;
    setEditingIndex(null);
    setEditorMode(null);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{getNativeQuestionTitle(question)}</Text>
        <Text style={styles.count}>{`${committedPanels.length} ${committedPanels.length === 1 ? "entry" : "entries"} added`}</Text>
      </View>
      {committedPanels.length ? <View style={styles.entryList}>
        {committedPanels.map(({ panel, index }) => (
          <View key={panel.id || index} style={[styles.entryRow, editorMode === "edit" && index === editingIndex && styles.entryRowActive]}>
            <Pressable
              accessibilityLabel={`Edit entry ${index + 1}`}
              onPress={() => startEditing(index)}
              style={styles.editEntryButton}
            >
              <Text style={styles.entryNumber}>{index + 1}</Text>
              <Text style={styles.entryLabel} numberOfLines={1}>{entryLabel(panel, index)}</Text>
              <MaterialCommunityIcons color="#475467" name="pencil-outline" size={19} />
            </Pressable>
            {question.allowRemovePanel !== false ? (
              <Pressable
                accessibilityLabel={`Delete entry ${index + 1}`}
                hitSlop={6}
                onPress={() => removeEntry(index)}
                style={styles.deleteButton}
              >
                <MaterialCommunityIcons color="#b42318" name="delete-outline" size={21} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View> : null}
      {editingIndex !== null && panels[editingIndex] ? (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>
              {editorMode === "add" ? "New entry" : `Edit entry ${editingIndex + 1}`}
            </Text>
            <Pressable accessibilityLabel="Close entry editor" hitSlop={6} onPress={closeEditor}>
              <MaterialCommunityIcons color="#475467" name="close-circle-outline" size={22} />
            </Pressable>
          </View>
          {(panels[editingIndex].questions || [])
            .filter((child) => child.isVisible !== false)
            .map((child) => renderQuestion(child, `${question.name}-${editingIndex}-${child.name}`))}
          <Pressable onPress={commitEntry} style={styles.commitButton}>
            <Text style={controlStyles.buttonText}>
              {editorMode === "add" ? question.addPanelText || "Add entry" : "Update entry"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {errors.map((error, index) => <Text key={`${error}-${index}`} style={styles.error}>{error}</Text>)}
      {question.allowAddPanel !== false && editorMode === null ? (
        <Pressable
          onPress={startAdding}
          style={styles.addButton}
        >
          <MaterialCommunityIcons color="#ffffff" name="plus" size={20} />
          <Text style={controlStyles.buttonText}>{question.addPanelText || "Add row"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { color: "#18202a", fontSize: 18, fontWeight: "800" },
  count: { color: "#1f6feb", fontSize: 13, fontWeight: "800" },
  entryList: { gap: 6 },
  entryRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 7, paddingVertical: 5, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  entryRowActive: { borderColor: "#1f6feb", backgroundColor: "#eef6ff" },
  editEntryButton: { minHeight: 36, flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  entryNumber: { width: 26, height: 26, paddingTop: 3, borderRadius: 13, textAlign: "center", color: "#ffffff", backgroundColor: "#1f6feb", fontWeight: "800" },
  entryLabel: { color: "#18202a", fontSize: 14, fontWeight: "800" },
  deleteButton: { width: 38, minHeight: 36, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: "#d0d5dd" },
  panel: { gap: 8, padding: 9, borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 9, backgroundColor: "#f8fbff" },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  panelTitle: { color: "#1f4d7a", fontSize: 14, fontWeight: "800" },
  addButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#1f6feb" },
  commitButton: { minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#1f6feb" },
  error: { color: "#d92d20", fontSize: 13, fontWeight: "700" },
});

function panelHasAnswer(panel) {
  return (panel?.questions || []).some((child) => {
    const value = child.value;
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return value !== undefined && value !== null && value !== "";
  });
}

function clearPanelValues(panel) {
  (panel?.questions || []).forEach((child) => {
    if (typeof child.clearValue === "function") child.clearValue();
    else child.value = undefined;
  });
}
