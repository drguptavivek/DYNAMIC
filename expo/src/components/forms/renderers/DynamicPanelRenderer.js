/**
 * Renders repeat entries with a count, explicit row selection, editing, addition, and deletion.
 */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  appendDynamicPanel,
  getNativeQuestionErrors,
  getNativeQuestionTitle,
  getPanelCommitLabel,
  getWqMultipleBirthRow,
  groupWqPregnancyHistoryPanels,
  isNativeInternalPanelField,
  shouldShowWqPregnancyHistoryQuestion,
  WQ_MULTIPLE_BIRTH_COUNT_FIELD,
  WQ_MULTIPLE_BIRTH_INDEX_FIELD,
  WQ_PREGNANCY_GROUP_FIELD,
  WQ_PREGNANCY_HISTORY_PANEL_FIELD,
  WQ_PREGNANCY_PLURALITY_FIELD,
} from "../nativeSurveyModel.js";
import { controlStyles } from "./QuestionFrame.js";

function isRenderablePanelQuestion(child, multipleBirth) {
  if (child?.visible === false || child?.isVisible === false) return false;
  if (isNativeInternalPanelField(child?.name)) return false;
  return shouldShowWqPregnancyHistoryQuestion(child, multipleBirth);
}

export function DynamicPanelRenderer({
  locale,
  question,
  onChange,
  onRequestTopLevelFocus,
  renderQuestion,
}) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editorMode, setEditorMode] = useState(null);
  const [initialAddOpened, setInitialAddOpened] = useState(false);
  const errors = getNativeQuestionErrors(question);
  const panels = question.panels || [];
  const committedPanels = panels
    .map((panel, index) => ({ panel, index }))
    .filter(({ panel, index }) =>
      panelHasAnswer(panel) && (editorMode !== "add" || index !== editingIndex)
    );
  const isWqPregnancyHistory = question.name === WQ_PREGNANCY_HISTORY_PANEL_FIELD;
  const pregnancyGroups = isWqPregnancyHistory
    ? groupWqPregnancyHistoryPanels(panels)
        .map((group) => ({
          ...group,
          rows: group.rows.filter(({ panel, panelIndex }) =>
            panelHasAnswer(panel) && (editorMode !== "add" || panelIndex !== editingIndex)
          ),
        }))
        .filter((group) => group.rows.length > 0)
    : [];

  useEffect(() => {
    if (editingIndex !== null && editingIndex >= panels.length) {
      setEditingIndex(null);
      setEditorMode(null);
    }
  }, [editingIndex, panels.length]);

  useEffect(() => {
    if (question.dynamicAddRequestToken === undefined) return;
    if (editorMode !== null) return;
    startAdding();
  }, [question.dynamicAddRequestToken]);

  useEffect(() => {
    if (!question.dynamicAutoOpenFirstEntry) return;
    if (initialAddOpened) return;
    if (committedPanels.length || editorMode !== null) return;
    setInitialAddOpened(true);
    startAdding();
  }, [committedPanels.length, editorMode, initialAddOpened, question.dynamicAutoOpenFirstEntry]);

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
      const { index } = appendDynamicPanel(question);
      if (index < 0) return;
      setEditingIndex(index);
    }
    setEditorMode("add");
    onChange?.();
  }

  function closeEditor() {
    const hasCommittedEntry = committedPanels.length > 0;
    if (editorMode === "add" && editingIndex !== null) {
      if (question.panelCount > Number(question.minPanelCount || 0)) {
        question.removePanel(editingIndex);
      } else {
        clearPanelValues(panels[editingIndex]);
      }
      onChange?.();
    }
    if (question.dynamicAutoOpenFirstEntry && question.dynamicHideAddButton && !hasCommittedEntry) {
      setInitialAddOpened(false);
    }
    setEditingIndex(null);
    setEditorMode(null);
  }

  function commitEntry() {
    const activePanel = editingIndex === null ? null : panels[editingIndex];
    if (!activePanel) {
      setEditingIndex(null);
      setEditorMode(null);
      return;
    }
    const multipleBirth = getWqMultipleBirthRow(activePanel);
    const pregnancyGroupIndex = isWqPregnancyHistory
      ? getPregnancyGroupIndex(panels, editingIndex)
      : 0;
    persistMultipleBirthRow(activePanel, multipleBirth, pregnancyGroupIndex);
    const visibleQuestions = (activePanel?.questions || []).filter(
      (child) => isRenderablePanelQuestion(child, multipleBirth)
    );
    const valid = visibleQuestions.map((child) => child.validate?.() !== false).every(Boolean);
    onChange?.();
    if (!valid || visibleQuestions.some((child) => child.errors?.length)) return;
    if (editorMode === "add" && multipleBirth.index < multipleBirth.count) {
      const { panel: nextPanel, index: nextIndex } = appendDynamicPanel(question);
      if (!nextPanel || nextIndex < 0) return;
      seedMultipleBirthContinuation(
        nextPanel,
        multipleBirth.index + 1,
        multipleBirth.count,
        pregnancyGroupIndex
      );
      setEditingIndex(nextIndex);
      setEditorMode("add");
      onChange?.();
      onRequestTopLevelFocus?.(question.name);
      return;
    }
    setEditingIndex(null);
    setEditorMode(null);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{getNativeQuestionTitle(question, locale)}</Text>
        <Text style={styles.count}>
          {isWqPregnancyHistory
            ? `${pregnancyGroups.length} ${pregnancyGroups.length === 1 ? "pregnancy" : "pregnancies"}, ${committedPanels.length} ${committedPanels.length === 1 ? "baby/outcome" : "babies/outcomes"}`
            : `${committedPanels.length} ${committedPanels.length === 1 ? "entry" : "entries"} added`}
        </Text>
      </View>
      {pregnancyGroups.length ? <View style={styles.pregnancyList}>
        {pregnancyGroups.map((group) => (
          <View key={`pregnancy-${group.groupIndex}`} style={styles.pregnancyGroup}>
            <Text style={styles.pregnancyTitle}>{`Pregnancy ${group.groupIndex}`}</Text>
            {group.rows.map(({ panel, panelIndex, multipleBirth }) => (
              <EntryRow
                entryLabel={entryLabel(panel, panelIndex)}
                index={panelIndex}
                key={panel.id || panelIndex}
                number={multipleBirth.index}
                onDelete={removeEntry}
                onEdit={startEditing}
                prefixLabel={`Baby ${multipleBirth.index} of ${multipleBirth.count}`}
                question={question}
                selected={editorMode === "edit" && panelIndex === editingIndex}
              />
            ))}
          </View>
        ))}
      </View> : committedPanels.length ? <View style={styles.entryList}>
        {committedPanels.map(({ panel, index }) => (
          <EntryRow
            entryLabel={entryLabel(panel, index)}
            index={index}
            key={panel.id || index}
            number={index + 1}
            onDelete={removeEntry}
            onEdit={startEditing}
            question={question}
            selected={editorMode === "edit" && index === editingIndex}
          />
        ))}
      </View> : null}
      {editingIndex !== null && panels[editingIndex] ? (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>
              {getPanelEditorTitle(
                panels,
                editingIndex,
                editorMode,
                isWqPregnancyHistory
              )}
            </Text>
            <Pressable accessibilityLabel="Close entry editor" hitSlop={6} onPress={closeEditor}>
              <MaterialCommunityIcons color="#475467" name="close-circle-outline" size={22} />
            </Pressable>
          </View>
          {(panels[editingIndex].questions || [])
            .filter((child) => isRenderablePanelQuestion(
              child,
              getWqMultipleBirthRow(panels[editingIndex])
            ))
            .map((child) => {
              child.__nativePanelRowNumber = editingIndex + 1;
              return renderQuestion(child, `${question.name}-${editingIndex}-${child.name}`);
            })}
          <Pressable onPress={commitEntry} style={styles.commitButton}>
            <Text style={controlStyles.buttonText}>
              {getPanelCommitLabel(
                question,
                panels[editingIndex],
                editorMode,
                isWqPregnancyHistory
              )}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {errors.map((error, index) => <Text key={`${error}-${index}`} style={styles.error}>{error}</Text>)}
      {question.allowAddPanel !== false && !question.dynamicHideAddButton && editorMode === null ? (
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
  pregnancyList: { gap: 9 },
  pregnancyGroup: { gap: 6, padding: 8, borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 8, backgroundColor: "#f8fbff" },
  pregnancyTitle: { color: "#1f4d7a", fontSize: 15, fontWeight: "900" },
  entryRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 7, paddingVertical: 5, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  entryRowActive: { borderColor: "#1f6feb", backgroundColor: "#eef6ff" },
  editEntryButton: { minHeight: 36, flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  entryNumber: { width: 26, height: 26, paddingTop: 3, borderRadius: 13, textAlign: "center", color: "#ffffff", backgroundColor: "#1f6feb", fontWeight: "800" },
  entryText: { minWidth: 0, flex: 1 },
  entryKind: { color: "#1f4d7a", fontSize: 13, fontWeight: "900" },
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
    if (child.isReadOnly || child.readOnly) return false;
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

function setPanelValue(panel, fieldName, value) {
  const child = panel?.getQuestionByName?.(fieldName);
  if (child) child.value = value;
}

function persistMultipleBirthRow(panel, multipleBirth, pregnancyGroupIndex) {
  if (pregnancyGroupIndex > 0) {
    setPanelValue(panel, WQ_PREGNANCY_GROUP_FIELD, pregnancyGroupIndex);
  }
  setPanelValue(panel, WQ_MULTIPLE_BIRTH_INDEX_FIELD, multipleBirth.index);
  setPanelValue(panel, WQ_MULTIPLE_BIRTH_COUNT_FIELD, multipleBirth.count);
}

function seedMultipleBirthContinuation(panel, index, count, pregnancyGroupIndex) {
  setPanelValue(panel, WQ_PREGNANCY_GROUP_FIELD, pregnancyGroupIndex);
  setPanelValue(panel, WQ_PREGNANCY_PLURALITY_FIELD, count);
  setPanelValue(panel, WQ_MULTIPLE_BIRTH_INDEX_FIELD, index);
  setPanelValue(panel, WQ_MULTIPLE_BIRTH_COUNT_FIELD, count);
}

function getPregnancyGroupIndex(panels, editingIndex) {
  const group = groupWqPregnancyHistoryPanels(panels).find((item) =>
    item.rows.some((row) => row.panelIndex === editingIndex)
  );
  return group?.groupIndex || 1;
}

function getPanelEditorTitle(panels, editingIndex, editorMode, isWqPregnancyHistory) {
  const panel = panels[editingIndex];
  const multipleBirth = getWqMultipleBirthRow(panel);
  if (isWqPregnancyHistory) {
    const groupIndex = getPregnancyGroupIndex(panels, editingIndex);
    return `Pregnancy ${groupIndex} - Baby ${multipleBirth.index} of ${multipleBirth.count}`;
  }
  return editorMode === "add" ? "New entry" : `Edit entry ${editingIndex + 1}`;
}

function EntryRow({ entryLabel, index, number, onDelete, onEdit, prefixLabel, question, selected }) {
  return (
    <View style={[styles.entryRow, selected && styles.entryRowActive]}>
      <Pressable
        accessibilityLabel={`Edit entry ${index + 1}`}
        onPress={() => onEdit(index)}
        style={styles.editEntryButton}
      >
        <Text style={styles.entryNumber}>{number}</Text>
        <View style={styles.entryText}>
          {prefixLabel ? <Text style={styles.entryKind}>{prefixLabel}</Text> : null}
          <Text style={styles.entryLabel} numberOfLines={1}>{entryLabel}</Text>
        </View>
        <MaterialCommunityIcons color="#475467" name="pencil-outline" size={19} />
      </Pressable>
      {question.allowRemovePanel !== false ? (
        <Pressable
          accessibilityLabel={`Delete entry ${index + 1}`}
          hitSlop={6}
          onPress={() => onDelete(index)}
          style={styles.deleteButton}
        >
          <MaterialCommunityIcons color="#b42318" name="delete-outline" size={21} />
        </Pressable>
      ) : null}
    </View>
  );
}
