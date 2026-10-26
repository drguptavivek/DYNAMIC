import { showFormAlert } from "../../../lib/nativeFormPopups.js";
import { formatNativeFormText, getNativeFormText } from "../../../lib/nativeFormText.js";
/**
 * Renders repeat entries with a count, explicit row selection, editing, addition, and deletion.
 */
import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  appendDynamicPanel,
  getNativeQuestionErrors,
  getNativeQuestionTitle,
  getPanelCommitLabel,
  getWqMultipleBirthRow,
  getWqPregnancyChildSummary,
  groupWqPregnancyHistoryPanels,
  insertLatestWqPregnancyGroupAt,
  isNativeInternalPanelField,
  reorderWqPregnancyHistoryValues,
  shouldShowWqPregnancyHistoryQuestion,
  WQ_MULTIPLE_BIRTH_COUNT_FIELD,
  WQ_MULTIPLE_BIRTH_INDEX_FIELD,
  WQ_PREGNANCY_GROUP_FIELD,
  WQ_PREGNANCY_HISTORY_PANEL_FIELD,
  WQ_PREGNANCY_PLURALITY_FIELD,
} from "../nativeSurveyModel.js";
import { controlStyles } from "./QuestionFrame.js";
import { findFirstNativeValidationQuestion, getValidationPanelIndex } from "../nativeValidationFocus.js";
import { acceptHhqHighestGradeYearEntry } from "./hhqHighestGrade.js";
import {
  confirmCommittedHhqMobileNumber,
  markHhqMobilePanelChildren,
} from "./mobileNumberConfirmation.js";
import {
  BHQ_RESIDENCE_DURATION_FIELD,
  BHQ_VISITOR_CONFIRMATION_MESSAGE,
  clearBhqResidenceMonths,
} from "./bhqVisitorConfirmation.js";
import {
  applyRegistryIndividualToPanel,
  clearRegistryIndividualFromPanel,
  getPanelRegistryDetails,
  isBhqRegistrySite,
} from "./bhqRegistryLookup.js";
import { BhqRegistryLookupDrawer } from "./BhqRegistryLookupDrawer.js";

const MOBILE_CONFIRMATION_MESSAGE =
  "Read this mobile number to the Respondent and confirm whether the number is correct or not.";

function isRenderablePanelQuestion(child, multipleBirth) {
  if (child?.visible === false || child?.isVisible === false) return false;
  // Background fields remain in the panel data for promotion/sync but must
  // never render as an extra interviewer-facing question. BHQ Q6_i uses this
  // for the stored living-since-birth code, which is rendered inside Q6_i.
  if (
    child?.renderAs === "background" ||
    child?.jsonObj?.renderAs === "background" ||
    child?.name === "member_living_since_birth" ||
    child?.sourceCode === "6_i_living_since_birth"
  ) return false;
  if (isNativeInternalPanelField(child?.name)) return false;
  return shouldShowWqPregnancyHistoryQuestion(child, multipleBirth);
}

function clearBHQHighestGradeRequiredError(question) {
  if (question?.name !== "member_highest_grade_completed") return;
  const value = question.value;
  if (value === undefined || value === null || value === "") return;
  if (!Array.isArray(question.errors) || question.errors.length === 0) return;
  question.errors = question.errors.filter((error) => {
    const text = typeof error === "string"
      ? error
      : typeof error?.getText === "function"
        ? error.getText()
        : error?.text || String(error || "");
    return !/response\s+required|required\s+response/i.test(String(text));
  });
}

export function DynamicPanelRenderer({
  locale,
  question,
  onChange,
  onRequestTopLevelFocus,
  renderQuestion,
  validationFocusRequest,
}) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editorMode, setEditorMode] = useState(null);
  const [initialAddOpened, setInitialAddOpened] = useState(false);
  const [registryPanel, setRegistryPanel] = useState(null);
  const visitorPromptOpenRef = useRef(false);
  const topLevelFocusRef = useRef(onRequestTopLevelFocus);
  topLevelFocusRef.current = onRequestTopLevelFocus;
  const errors = getNativeQuestionErrors(question);
  const panels = question.panels || [];
  useEffect(() => {
    const index = getValidationPanelIndex(question, validationFocusRequest?.question);
    if (index < 0) return;
    setEditingIndex(index);
    setEditorMode("edit");
  }, [question, validationFocusRequest]);
  const committedPanels = panels
    .map((panel, index) => ({ panel, index }))
    .filter(({ panel, index }) =>
      panelHasAnswer(panel) && (editorMode !== "add" || index !== editingIndex)
    );
  const linkedRegistryUids = new Set(
    panels.map((panel) => getPanelRegistryDetails(panel)?.uid).filter(Boolean)
  );
  const isWqPregnancyHistory = question.name === WQ_PREGNANCY_HISTORY_PANEL_FIELD;
  const registryEnabled = question.name === "hhq_household_members" && isBhqRegistrySite(question.survey);
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
    if (registryPanel && !findPanelByIdentity(panels, registryPanel)) setRegistryPanel(null);
  }, [panels, registryPanel]);

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

  useEffect(() => {
    if (!isWqPregnancyHistory || editingIndex === null) return;
    if (getValidationPanelIndex(question, validationFocusRequest?.question) === editingIndex) return;
    topLevelFocusRef.current?.(question.name);
  }, [editingIndex, isWqPregnancyHistory, question.name]);

  function entryLabel(panel, index) {
    const memberName = panel.getQuestionByName?.("member_name")?.value;
    if (memberName !== undefined && memberName !== null && memberName !== "") {
      return String(memberName);
    }
    const answeredQuestion = (panel.questions || []).find(
      (item) => !item.isReadOnly && item.value !== undefined && item.value !== null && item.value !== ""
    );
    return answeredQuestion ? String(answeredQuestion.value) : formatNativeFormText(question.survey, "entry_entrynumber", "Entry {entryNumber}", { entryNumber: index + 1 }, locale);
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
    question.dynamicAddRequestToken = undefined;
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

  function openRegistryLookup(panel) {
    if (!registryEnabled || !isWritableRegistryPanel(panel)) return;
    setRegistryPanel(panel);
  }

  function selectRegistryPerson(person) {
    const target = findPanelByIdentity(panels, registryPanel);
    if (!target || !isWritableRegistryPanel(target)) {
      setRegistryPanel(null);
      return;
    }
    applyRegistryIndividualToPanel(target, person);
    setRegistryPanel(null);
    onChange?.();
  }

  function unlinkRegistryPerson(panel) {
    if (!isWritableRegistryPanel(panel)) return;
    clearRegistryIndividualFromPanel(panel);
    onChange?.();
  }

  function requestBhqVisitorConfirmation(residenceQuestion) {
    if (
      question.name !== "hhq_household_members" ||
      residenceQuestion?.name !== BHQ_RESIDENCE_DURATION_FIELD ||
      editingIndex === null ||
      visitorPromptOpenRef.current
    ) return;
    visitorPromptOpenRef.current = true;
    showFormAlert(question.survey, Alert.alert,
      getNativeFormText(question.survey, "confirm_household_membership", "Confirm household membership", locale),
      getNativeFormText(question.survey, "bhq_visitor_confirmation", BHQ_VISITOR_CONFIRMATION_MESSAGE, locale),
      [
        {
          text: getNativeFormText(question.survey, "visitor", "VISITOR", locale),
          onPress: () => {
            visitorPromptOpenRef.current = false;
            removeEntry(editingIndex);
          },
        },
        {
          text: getNativeFormText(question.survey, "member", "MEMBER", locale),
          onPress: () => {
            visitorPromptOpenRef.current = false;
            clearBhqResidenceMonths(residenceQuestion);
            onChange?.();
            requestAnimationFrame(() => {
              onRequestTopLevelFocus?.(BHQ_RESIDENCE_DURATION_FIELD);
            });
          },
        },
      ],
      { cancelable: false },
    );
  }

  function configurePanelQuestion(child) {
    if (
      question.name === "hhq_household_members" &&
      child?.name === BHQ_RESIDENCE_DURATION_FIELD
    ) {
      child.__requestBhqVisitorConfirmation = requestBhqVisitorConfirmation;
    }
  }

  function movePregnancy(fromPosition, toPosition) {
    if (editorMode !== null) return;
    const reorderedValue = reorderWqPregnancyHistoryValues(
      question.value,
      fromPosition,
      toPosition
    );
    if (reorderedValue === question.value) return;
    question.value = reorderedValue;
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
    const valid = visibleQuestions.map((child) => {
      if (acceptHhqHighestGradeYearEntry(child)) return true;
      clearBHQHighestGradeRequiredError(child);
      const childValid = child.validate?.() !== false;
      clearBHQHighestGradeRequiredError(child);
      const isBHQHighestGradeAnswered =
        child.name === "member_highest_grade_completed" &&
        child.value !== undefined &&
        child.value !== null &&
        child.value !== "";
      if (isBHQHighestGradeAnswered) {
        // Q12_i accepts a numeric year even though its SurveyJS choices are
        // only the special coded answers. Do not let a residual required
        // error prevent committing an otherwise valid member row.
        child.clearErrors?.();
      }
      return childValid || isBHQHighestGradeAnswered;
    }).every(Boolean);
    onChange?.();
    if (!valid || visibleQuestions.some((child) => child.errors?.length)) {
      onRequestTopLevelFocus?.(findFirstNativeValidationQuestion(visibleQuestions) || activePanel.questions?.find((child) => child.errors?.length));
      return;
    }
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
    const returnPageName = question.dynamicReturnPageName;
    const returnFocusQuestionName = question.dynamicReturnFocusQuestionName;
    if (
      editorMode === "add" &&
      isWqPregnancyHistory &&
      Number.isInteger(question.dynamicInsertGroupPosition)
    ) {
      question.value = insertLatestWqPregnancyGroupAt(
        question.value,
        question.dynamicInsertGroupPosition
      );
    }
    question.dynamicInsertGroupPosition = undefined;
    question.dynamicReturnPageName = undefined;
    question.dynamicReturnFocusQuestionName = undefined;
    setEditingIndex(null);
    setEditorMode(null);
    onChange?.();
    confirmCommittedHhqMobileNumber(question, activePanel, () => {
      showFormAlert(question.survey, Alert.alert,
        getNativeFormText(question.survey, "confirm_mobile_number", "Confirm mobile number", locale),
        getNativeFormText(question.survey, "mobile_confirmation", MOBILE_CONFIRMATION_MESSAGE, locale),
        [{ text: "Yes" }, { text: "No" }],
      );
    });
    if (returnPageName) {
      requestAnimationFrame(() => {
        const returnPage = question.survey?.getPageByName?.(returnPageName);
        if (returnPage) question.survey.currentPage = returnPage;
        onChange?.();
        if (returnFocusQuestionName) {
          requestAnimationFrame(() => onRequestTopLevelFocus?.(returnFocusQuestionName));
        }
      });
    }
  }

  if (isWqPregnancyHistory && editingIndex !== null && panels[editingIndex]) {
    const activePanel = panels[editingIndex];
    const multipleBirth = getWqMultipleBirthRow(activePanel);
    return (
      <View style={[styles.wrap, styles.dedicatedEditor]}>
        <View style={styles.dedicatedEditorHeader}>
          <View style={styles.dedicatedEditorHeading}>
            <Text style={styles.dedicatedEditorEyebrow}>{getNativeFormText(question.survey, "pregnancy_entry", "Pregnancy entry", locale)}</Text>
            <Text style={styles.dedicatedEditorTitle}>
              {getPanelEditorTitle(panels, editingIndex, editorMode, true)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={getNativeFormText(question.survey, "close_pregnancy_entry", "Close pregnancy entry", locale)}
            hitSlop={6}
            onPress={closeEditor}
            style={styles.dedicatedCloseButton}
          >
            <MaterialCommunityIcons color="#475467" name="close" size={24} />
          </Pressable>
        </View>
        <View style={styles.panel}>
          {(activePanel.questions || [])
            .filter((child) => isRenderablePanelQuestion(child, multipleBirth))
            .map((child) => {
              child.__nativePanelRowNumber = editingIndex + 1;
              configurePanelQuestion(child);
              markHhqMobilePanelChildren(question, activePanel);
              return renderQuestion(child, `${question.name}-${editingIndex}-${child.name}`);
            })}
          <Pressable onPress={commitEntry} style={styles.commitButton}>
            <Text style={controlStyles.buttonText}>
              {getPanelCommitLabel(question, activePanel, editorMode, true)}
            </Text>
          </Pressable>
        </View>
        {errors.map((error, index) => (
          <Text key={`${error}-${index}`} style={styles.error}>{error}</Text>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{getNativeQuestionTitle(question, locale)}</Text>
        <Text style={styles.count}>
          {isWqPregnancyHistory
            ? formatNativeFormText(question.survey, "pregnancy_entry_count", `${pregnancyGroups.length} ${pregnancyGroups.length === 1 ? "pregnancy" : "pregnancies"}, ${committedPanels.length} ${committedPanels.length === 1 ? "baby/outcome" : "babies/outcomes"}`, { pregnancyCount: pregnancyGroups.length, outcomeCount: committedPanels.length }, locale)
            : formatNativeFormText(question.survey, "panel_entry_count", `${committedPanels.length} ${committedPanels.length === 1 ? "entry" : "entries"} added`, { entryCount: committedPanels.length }, locale)}
        </Text>
      </View>
      {isWqPregnancyHistory
        && question.allowAddPanel !== false
        && !question.dynamicHideAddButton
        && editorMode === null ? (
        <Pressable
          onPress={startAdding}
          style={styles.addButton}
        >
          <MaterialCommunityIcons color="#ffffff" name="plus" size={20} />
          <Text style={controlStyles.buttonText}>{question.addPanelText || getNativeFormText(question.survey, "add_row", "Add row", locale)}</Text>
        </Pressable>
      ) : null}
      {pregnancyGroups.length ? <View style={styles.pregnancyList}>
        {pregnancyGroups.map((group, groupPosition) => (
          <View key={`pregnancy-${group.groupIndex}`} style={styles.pregnancyGroup}>
            <View style={styles.pregnancyHeadingRow}>
              <Text style={styles.pregnancyTitle}>{formatNativeFormText(question.survey, "pregnancy_pregnancynumber", "Pregnancy {pregnancyNumber}", { pregnancyNumber: group.groupIndex }, locale)}</Text>
              {pregnancyGroups.length > 1 ? (
                <View style={styles.orderControls}>
                  <Pressable
                    accessibilityLabel={formatNativeFormText(question.survey, "move_pregnancy_pregnancynumber_earlier", "Move pregnancy {pregnancyNumber} earlier", { pregnancyNumber: group.groupIndex }, locale)}
                    disabled={groupPosition === 0 || editorMode !== null}
                    hitSlop={6}
                    onPress={() => movePregnancy(groupPosition, groupPosition - 1)}
                    style={styles.orderButton}
                  >
                    <MaterialCommunityIcons
                      color={groupPosition === 0 ? "#98a2b3" : "#1f6feb"}
                      name="arrow-up"
                      size={20}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={formatNativeFormText(question.survey, "move_pregnancy_pregnancynumber_later", "Move pregnancy {pregnancyNumber} later", { pregnancyNumber: group.groupIndex }, locale)}
                    disabled={groupPosition === pregnancyGroups.length - 1 || editorMode !== null}
                    hitSlop={6}
                    onPress={() => movePregnancy(groupPosition, groupPosition + 1)}
                    style={styles.orderButton}
                  >
                    <MaterialCommunityIcons
                      color={groupPosition === pregnancyGroups.length - 1 ? "#98a2b3" : "#1f6feb"}
                      name="arrow-down"
                      size={20}
                    />
                  </Pressable>
                </View>
              ) : null}
            </View>
            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
              <View style={styles.childTable}>
                <View style={styles.childTableHeader}>
                  <Text style={[styles.childHeaderText, styles.childSerialCell]}>{getNativeFormText(question.survey, "s_no", "S.No.", locale)}</Text>
                  <Text style={[styles.childHeaderText, styles.childStatusCell]}>{getNativeFormText(question.survey, "born_status", "Born status", locale)}</Text>
                  <Text style={[styles.childHeaderText, styles.childNameCell]}>{getNativeFormText(question.survey, "name_of_child", "Name of child", locale)}</Text>
                  <Text style={[styles.childHeaderText, styles.childSexCell]}>{getNativeFormText(question.survey, "sex", "Sex", locale)}</Text>
                  <Text style={[styles.childHeaderText, styles.childDurationCell]}>{getNativeFormText(question.survey, "pregnancy_lasts", "Pregnancy lasts", locale)}</Text>
                  <View style={styles.childActionCell} />
                </View>
                {group.rows.map(({ panel, panelIndex, multipleBirth }) => {
                  const child = getWqPregnancyChildSummary(panel);
                  return (
                    <PregnancyChildRow
                      child={child}
                      index={panelIndex}
                      key={panel.id || panelIndex}
                      number={multipleBirth.index}
                      onDelete={removeEntry}
                      onEdit={startEditing}
                      question={question}
                      selected={editorMode === "edit" && panelIndex === editingIndex}
                    />
                  );
                })}
              </View>
            </ScrollView>
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
            <Pressable accessibilityLabel={getNativeFormText(question.survey, "close_entry_editor", "Close entry editor", locale)} hitSlop={6} onPress={closeEditor}>
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
              configurePanelQuestion(child);
              markHhqMobilePanelChildren(question, panels[editingIndex]);
              return (
                <React.Fragment key={`${question.name}-${editingIndex}-${child.name}`}>
                  {renderQuestion(child, `${question.name}-${editingIndex}-${child.name}`)}
                  {registryEnabled && child.name === "member_name" && String(child.value ?? "").trim() ? (
                    <RegistryLinkControl
                      onClear={() => unlinkRegistryPerson(panels[editingIndex])}
                      onOpen={() => openRegistryLookup(panels[editingIndex])}
                      panel={panels[editingIndex]}
                    />
                  ) : null}
                </React.Fragment>
              );
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
      {!isWqPregnancyHistory
        && question.allowAddPanel !== false
        && !question.dynamicHideAddButton
        && editorMode === null ? (
        <Pressable
          onPress={startAdding}
          style={styles.addButton}
        >
          <MaterialCommunityIcons color="#ffffff" name="plus" size={20} />
          <Text style={controlStyles.buttonText}>{question.addPanelText || getNativeFormText(question.survey, "add_row", "Add row", locale)}</Text>
        </Pressable>
      ) : null}
      {registryPanel ? (
        <BhqRegistryLookupDrawer
          key={registryPanel.id || panels.indexOf(registryPanel)}
          linkedUids={new Set([...linkedRegistryUids].filter((uid) => uid !== getPanelRegistryDetails(findPanelByIdentity(panels, registryPanel) || registryPanel)?.uid))}
          onClose={() => setRegistryPanel(null)}
          onSelect={selectRegistryPerson}
          panel={registryPanel}
          survey={question.survey}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  registryControl: { gap: 6, padding: 9, borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 8, backgroundColor: "#ffffff" },
  registryControlHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  registryControlTitle: { color: "#1f4d7a", fontSize: 12, fontWeight: "900" },
  registryChip: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: "#a6f4c5", borderRadius: 8, backgroundColor: "#ecfdf3" },
  registryChipBody: { minWidth: 0, flex: 1, gap: 1 },
  registryChipId: { color: "#027a48", fontSize: 12, fontWeight: "900" },
  registryChipDetails: { color: "#344054", fontSize: 11 },
  registryChipButton: { alignSelf: "flex-start", minHeight: 36, minWidth: 36, alignItems: "center", justifyContent: "center" },
  registryLookupPressable: { minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 7, backgroundColor: "#eef6ff" },
  registryLookupText: { color: "#1f6feb", fontSize: 12, fontWeight: "900" },
  wrap: { gap: 8 },
  dedicatedEditor: { paddingBottom: 8 },
  dedicatedEditorHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 2, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "#d0d5dd" },
  dedicatedEditorHeading: { minWidth: 0, flex: 1, gap: 2 },
  dedicatedEditorEyebrow: { color: "#667085", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  dedicatedEditorTitle: { color: "#1f4d7a", fontSize: 19, fontWeight: "900" },
  dedicatedCloseButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 7, backgroundColor: "#ffffff" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { color: "#18202a", fontSize: 18, fontWeight: "800" },
  count: { color: "#1f6feb", fontSize: 13, fontWeight: "800" },
  entryList: { gap: 6 },
  pregnancyList: { gap: 9 },
  pregnancyGroup: { gap: 4, padding: 5, borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 8, backgroundColor: "#f8fbff" },
  pregnancyHeadingRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pregnancyTitle: { color: "#1f4d7a", fontSize: 15, fontWeight: "900" },
  orderControls: { flexDirection: "row", alignItems: "center", gap: 4 },
  orderButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 7, backgroundColor: "#ffffff" },
  childTable: { minWidth: 430, overflow: "hidden", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  childTableHeader: { minHeight: 32, flexDirection: "row", alignItems: "center", paddingHorizontal: 3, backgroundColor: "#eef4fb" },
  childHeaderText: { color: "#475467", fontSize: 9, fontWeight: "900" },
  childSerialCell: { width: 34 },
  childStatusCell: { width: 72, paddingHorizontal: 2 },
  childNameCell: { width: 92, paddingHorizontal: 2 },
  childSexCell: { width: 44, paddingHorizontal: 2 },
  childDurationCell: { width: 96, paddingHorizontal: 2 },
  childActionCell: { width: 64 },
  childRow: { minHeight: 38, flexDirection: "row", alignItems: "center", paddingHorizontal: 3, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  childRowActive: { backgroundColor: "#eef6ff" },
  childCellText: { color: "#18202a", fontSize: 10, fontWeight: "700" },
  childActions: { width: 64, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  childIconButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
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

function isWritableRegistryPanel(panel) {
  if (!panel || panel.isReadOnly || panel.readOnly) return false;
  return (panel.questions || []).some((child) => !child?.isReadOnly && !child?.readOnly);
}

function findPanelByIdentity(panels, target) {
  if (!target) return null;
  return panels.find((panel) => panel === target || (target.id && panel.id === target.id)) || null;
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
  const survey = panel?.survey;
  const multipleBirth = getWqMultipleBirthRow(panel);
  if (isWqPregnancyHistory) {
    const groupIndex = getPregnancyGroupIndex(panels, editingIndex);
    return formatNativeFormText(survey, "pregnancy_pregnancynumber_baby_childnumber_of_childcount", "Pregnancy {pregnancyNumber} - Baby {childNumber} of {childCount}", { pregnancyNumber: groupIndex, childNumber: multipleBirth.index, childCount: multipleBirth.count }, survey?.locale);
  }
  return editorMode === "add" ? getNativeFormText(survey, "new_entry", "New entry", survey?.locale) : formatNativeFormText(survey, "edit_entry_entrynumber", "Edit entry {entryNumber}", { entryNumber: editingIndex + 1 }, survey?.locale);
}

function RegistryLinkControl({ onClear, onOpen, panel }) {
  const details = getPanelRegistryDetails(panel);
  if (!details) {
    return (
      <Pressable
        accessibilityLabel={getNativeFormText(panel?.survey, "find_hdss_person", "Find HDSS person", panel?.survey?.locale)}
        accessibilityRole="button"
        onPress={onOpen}
        style={styles.registryLookupPressable}
      >
        <Text style={styles.registryLookupText}>{getNativeFormText(panel?.survey, "lookup", "Lookup", panel?.survey?.locale)}</Text>
      </Pressable>
    );
  }
  const summary = [details.name, details.age === null || details.age === undefined ? null : formatNativeFormText(panel?.survey, "age_years", "{age} years", { age: details.age }, panel?.survey?.locale), details.sex, details.status]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.registryChip}>
      <Pressable accessibilityLabel={getNativeFormText(panel?.survey, "replace_linked_hdss_person", "Replace linked HDSS person", panel?.survey?.locale)} onPress={onOpen} style={styles.registryChipBody}>
        <Text selectable style={styles.registryChipId}>{details.originalId}</Text>
        <Text selectable style={styles.registryChipDetails}>{summary || getNativeFormText(panel?.survey, "hdss_record_linked", "HDSS record linked", panel?.survey?.locale)}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={getNativeFormText(panel?.survey, "unlink_hdss_person", "Unlink HDSS person", panel?.survey?.locale)}
        accessibilityRole="button"
        hitSlop={6}
        onPress={onClear}
        style={styles.registryChipButton}
      >
        <MaterialCommunityIcons color="#b42318" name="close" size={19} />
      </Pressable>
    </View>
  );
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

function PregnancyChildRow({ child, index, number, onDelete, onEdit, question, selected }) {
  return (
    <View style={[styles.childRow, selected && styles.childRowActive]}>
      <Text style={[styles.childCellText, styles.childSerialCell]}>{number}</Text>
      <Text numberOfLines={2} style={[styles.childCellText, styles.childStatusCell]}>{child.bornStatus}</Text>
      <Text numberOfLines={2} style={[styles.childCellText, styles.childNameCell]}>{child.name}</Text>
      <Text numberOfLines={2} style={[styles.childCellText, styles.childSexCell]}>{child.sex}</Text>
      <Text numberOfLines={2} style={[styles.childCellText, styles.childDurationCell]}>{child.pregnancyLasts}</Text>
      <View style={styles.childActions}>
        <Pressable
          accessibilityLabel={`Edit child ${number}`}
          hitSlop={4}
          onPress={() => onEdit(index)}
          style={styles.childIconButton}
        >
          <MaterialCommunityIcons color="#475467" name="pencil-outline" size={19} />
        </Pressable>
        {question.allowRemovePanel !== false ? (
          <Pressable
            accessibilityLabel={`Delete child ${number}`}
            hitSlop={4}
            onPress={() => onDelete(index)}
            style={styles.childIconButton}
          >
            <MaterialCommunityIcons color="#b42318" name="delete-outline" size={21} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
