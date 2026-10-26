import { getNativeFormText, formatNativeFormText } from "../../../lib/nativeFormText.js";
/** Collects Q24_i-Q28_i one born-alive child at a time, then summarizes committed rows. */
import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  getNativeQuestionValue,
  isNativeInternalPanelField,
  WQ_FOLLOWUP_CHILD_INDEX_FIELD,
  WQ_FOLLOWUP_COMPLETED_FIELD,
  WQ_FOLLOWUP_PREGNANCY_INDEX_FIELD,
  WQ_PREGNANCY_BABY_NAME_FIELD,
} from "../nativeSurveyModel.js";
import { controlStyles } from "./QuestionFrame.js";
import { findFirstNativeValidationQuestion, getValidationPanelIndex } from "../nativeValidationFocus.js";
import { getWqChildBirthdayPrompt } from "../../../lib/womanSurveyBehaviors.js";

const CHILD_ALIVE_FIELD = "pregnancy_02_reproduction_is_name_still_alive";
const CHILD_AGE_FIELD = "pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b";
const CHILD_LIVING_WITH_FIELD = "pregnancy_02_reproduction_if_born_alive_and_still_living_is_name_liv";
const CHILD_LINE_FIELD = "pregnancy_02_reproduction_if_born_alive_and_still_living_record_hous";
const CHILD_DEATH_AGE_FIELD = "pregnancy_02_reproduction_if_born_alive_and_now_dead_if_19_i_1_boy_h";
const CHILD_SEX_FIELD = "pregnancy_02_reproduction_is_name_a_boy_or_a_girl";
const FOLLOWUP_METADATA_FIELDS = new Set([
  WQ_FOLLOWUP_PREGNANCY_INDEX_FIELD,
  WQ_FOLLOWUP_CHILD_INDEX_FIELD,
  WQ_FOLLOWUP_COMPLETED_FIELD,
  WQ_PREGNANCY_BABY_NAME_FIELD,
  CHILD_SEX_FIELD,
]);

function panelValue(panel, name) {
  return getNativeQuestionValue(panel?.getQuestionByName?.(name));
}

function hasAnswer(question) {
  const value = getNativeQuestionValue(question);
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => item !== undefined && item !== null && item !== "");
  }
  return value !== undefined && value !== null && value !== "";
}

function codedYesNo(value, survey) {
  const t = (key, fallback) => getNativeFormText(survey, key, fallback);
  if (Number(value) === 1) return t("yes", "Yes");
  if (Number(value) === 2) return t("no", "No");
  return "-";
}

function deathAge(value, survey) {
  const f = (key, fallback, values) => formatNativeFormText(survey, key, fallback, values);
  if (!value || typeof value !== "object") return "-";
  return [
    value.days && f("value_days", "{value} days", { value: value.days }),
    value.months && f("value_months", "{value} months", { value: value.months }),
    value.years && f("value_years", "{value} years", { value: value.years }),
  ].filter(Boolean).join(", ") || "-";
}

function padTwoDigitValue(value) {
  if (value === undefined || value === null || value === "") return value;
  const digits = String(value).replace(/\D/g, "");
  return digits ? digits.slice(-2).padStart(2, "0") : value;
}

function normalizeVisibleNumericAnswers(panel) {
  const age = panel?.getQuestionByName?.(CHILD_AGE_FIELD);
  if (age?.isVisible) age.value = padTwoDigitValue(age.value);
  const death = panel?.getQuestionByName?.(CHILD_DEATH_AGE_FIELD);
  if (death?.isVisible && death.value && typeof death.value === "object") {
    const entered = Object.values(death.value).some((value) => value !== undefined && value !== null && value !== "");
    if (entered) {
      death.value = Object.fromEntries(
        ["days", "months", "years"].map((name) => [name, padTwoDigitValue(death.value[name] || "0")])
      );
    }
  }
}

function validateActiveChild(panel, survey) {
  const t = (key, fallback) => getNativeFormText(survey, key, fallback);
  const issue = (name, message) => ({ question: panel?.getQuestionByName?.(name), message });
  const alive = Number(panelValue(panel, CHILD_ALIVE_FIELD));
  if (![1, 2].includes(alive)) return issue(CHILD_ALIVE_FIELD, t("answer_q24_i_for_this_child", "Answer Q24_i for this child."));
  if (alive === 1) {
    if (!/^\d{2}$/.test(String(panelValue(panel, CHILD_AGE_FIELD) || ""))) {
      return issue(CHILD_AGE_FIELD, t("enter_q25_i_age_in_completed_years", "Enter Q25_i age in completed years."));
    }
    if (![1, 2].includes(Number(panelValue(panel, CHILD_LIVING_WITH_FIELD)))) {
      return issue(CHILD_LIVING_WITH_FIELD, t("answer_q26_i_for_this_child", "Answer Q26_i for this child."));
    }
    if (!/^\d{2}$/.test(String(panelValue(panel, CHILD_LINE_FIELD) || ""))) {
      return issue(CHILD_LIVING_WITH_FIELD, t("the_q27_i_household_child_number_could_not_be_generated", "The Q27_i household child number could not be generated."));
    }
    return null;
  }
  const death = panelValue(panel, CHILD_DEATH_AGE_FIELD);
  if (!death || typeof death !== "object") return issue(CHILD_DEATH_AGE_FIELD, t("enter_q28_i_age_at_death", "Enter Q28_i age at death."));
  const values = ["days", "months", "years"].map((name) => String(death[name] || ""));
  if (values.some((value) => !/^\d{2}$/.test(value))) {
    return issue(CHILD_DEATH_AGE_FIELD, t("enter_q28_i_days_months_and_years_as_two_digits", "Enter Q28_i days, months, and years as two digits."));
  }
  return null;
}

export function WqBornAliveChildFollowupsRenderer({
  question,
  onChange,
  onRequestTopLevelFocus,
  renderQuestion,
  validationFocusRequest,
}) {
  const t = (key, fallback) => getNativeFormText(question.survey, key, fallback);
  const f = (key, fallback, values) => formatNativeFormText(question.survey, key, fallback, values);
  const panels = question.panels || [];
  const eligibleChildCount = Number(question.wqEligibleChildCount) || panels.length;
  const [editingIndex, setEditingIndex] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!panels.length) {
      setEditingIndex(null);
      return;
    }
    if (editingIndex !== null && editingIndex < panels.length) return;
    const firstIncomplete = panels.findIndex(
      (panel) => Number(panelValue(panel, WQ_FOLLOWUP_COMPLETED_FIELD)) !== 1
    );
    setEditingIndex(firstIncomplete >= 0 ? firstIncomplete : null);
  }, [editingIndex, panels.length, question.value]);

  useEffect(() => {
    let index = getValidationPanelIndex(question, validationFocusRequest?.question);
    if (validationFocusRequest?.question === question) {
      index = panels.findIndex((panel) => Number(panelValue(panel, WQ_FOLLOWUP_COMPLETED_FIELD)) !== 1);
    }
    if (index < 0) return;
    setEditingIndex(index);
    setError("");
    if (validationFocusRequest?.question === question) {
      const children = (panels[index]?.questions || []).filter((child) =>
        !isNativeInternalPanelField(child.name) && !FOLLOWUP_METADATA_FIELDS.has(child.name) &&
        child.isVisible !== false && child.renderAs !== "background");
      const target = findFirstNativeValidationQuestion(children) || children.find((child) => !child.isReadOnly);
      if (target) requestAnimationFrame(() => onRequestTopLevelFocus?.(target));
    }
  }, [question, validationFocusRequest]);

  const pendingLinePanel = editingIndex === null ? null : panels[editingIndex];
  const pendingAlive = Number(panelValue(pendingLinePanel, CHILD_ALIVE_FIELD));
  const pendingLivingWith = Number(panelValue(pendingLinePanel, CHILD_LIVING_WITH_FIELD));
  const pendingLine = panelValue(pendingLinePanel, CHILD_LINE_FIELD);
  const pendingDeathAge = panelValue(pendingLinePanel, CHILD_DEATH_AGE_FIELD);
  const pendingDeathAgeSignature = ["days", "months", "years"]
    .map((name) => String(pendingDeathAge?.[name] ?? ""))
    .join("|");
  const birthdayPromptStateRef = useRef({ editingIndex: null, signature: "" });
  useEffect(() => {
    const previous = birthdayPromptStateRef.current;
    const panelChanged = previous.editingIndex !== editingIndex;
    const valueChanged = previous.signature !== pendingDeathAgeSignature;
    birthdayPromptStateRef.current = {
      editingIndex,
      signature: pendingDeathAgeSignature,
    };
    const birthdayPrompt = getWqChildBirthdayPrompt(pendingDeathAge);
    if (!pendingLinePanel || panelChanged || !valueChanged || !birthdayPrompt) {
      return;
    }
    Alert.alert(t("confirm_child_age", "Confirm child age"), birthdayPrompt === "If the child celebrated fifth birthday?"
      ? t("if_the_child_celebrated_fifth_birthday", "If the child celebrated fifth birthday?")
      : birthdayPrompt === "If the child celebrated first birthday?"
        ? t("if_the_child_celebrated_first_birthday", "If the child celebrated first birthday?")
        : birthdayPrompt, [{ text: t("popup_ok", "OK") }]);
  }, [editingIndex, pendingDeathAge, pendingDeathAgeSignature, pendingLinePanel]);
  useEffect(() => {
    if (validationFocusRequest?.question === question ||
      getValidationPanelIndex(question, validationFocusRequest?.question) === editingIndex) return;
    if (
      pendingLinePanel &&
      pendingAlive === 1 &&
      [1, 2].includes(pendingLivingWith) &&
      !/^\d{2}$/.test(String(pendingLine || ""))
    ) {
      question.wqAdvanceToNextChild?.();
      onChange?.();
    }
  }, [editingIndex, onChange, pendingAlive, pendingLine, pendingLinePanel, pendingLivingWith, question]);

  if (!panels.length) return null;
  const committed = panels
    .map((panel, index) => ({ index, panel }))
    .filter(({ panel }) => Number(panelValue(panel, WQ_FOLLOWUP_COMPLETED_FIELD)) === 1);
  const activePanel = editingIndex === null ? null : panels[editingIndex];
  const activeQuestions = (activePanel?.questions || []).filter((child) =>
    !isNativeInternalPanelField(child.name) &&
    !FOLLOWUP_METADATA_FIELDS.has(child.name) &&
    child.visible !== false &&
    child.isVisible !== false
  );

  function commitChild() {
    normalizeVisibleNumericAnswers(activePanel);
    const validationIssue = validateActiveChild(activePanel, question.survey);
    if (validationIssue) {
      setError(validationIssue.message);
      activeQuestions.forEach((child) => child.validate?.());
      validationIssue.question?.addError?.(validationIssue.message);
      onChange?.();
      onRequestTopLevelFocus?.(validationIssue.question || findFirstNativeValidationQuestion(activeQuestions) || question);
      return;
    }
    const completed = activePanel?.getQuestionByName?.(WQ_FOLLOWUP_COMPLETED_FIELD);
    if (completed) completed.value = 1;
    question.wqAdvanceToNextChild?.();
    setError("");
    const refreshedPanels = question.panels || [];
    const nextIndex = refreshedPanels.findIndex((panel, index) =>
      index > editingIndex && Number(panelValue(panel, WQ_FOLLOWUP_COMPLETED_FIELD)) !== 1
    );
    setEditingIndex(nextIndex >= 0 ? nextIndex : null);
    onChange?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onRequestTopLevelFocus?.(question.name));
    });
  }

  function editChild(index) {
    setError("");
    setEditingIndex(index);
    requestAnimationFrame(() => onRequestTopLevelFocus?.(question.name));
  }

  function deleteChild(index, panel) {
    const name = panelValue(panel, WQ_PREGNANCY_BABY_NAME_FIELD) || f("child_number", "Child {number}", { number: index + 1 });
    Alert.alert(t("delete_child_details", "Delete child details?"), f("clear_the_saved_q24_i_q28_i_details_for_name", "Clear the saved Q24_i-Q28_i details for {name}?", { name }), [
      { text: t("cancel", "Cancel"), style: "cancel" },
      {
        text: t("delete", "Delete"),
        style: "destructive",
        onPress: () => {
          for (const fieldName of [
            CHILD_ALIVE_FIELD,
            CHILD_AGE_FIELD,
            CHILD_LIVING_WITH_FIELD,
            CHILD_LINE_FIELD,
            CHILD_DEATH_AGE_FIELD,
          ]) {
            const child = panel?.getQuestionByName?.(fieldName);
            if (child) child.value = undefined;
          }
          const completed = panel?.getQuestionByName?.(WQ_FOLLOWUP_COMPLETED_FIELD);
          if (completed) completed.value = undefined;
          setError("");
          setEditingIndex(index);
          onChange?.();
          requestAnimationFrame(() => onRequestTopLevelFocus?.(question.name));
        },
      },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t("born_alive_child_details_table", "Born-alive child details table")}</Text>
        <Text style={styles.count}>{f("count_of_total_added", "{count} of {total} added", { count: committed.length, total: eligibleChildCount })}</Text>
      </View>
      {committed.length ? (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.headerText, styles.pregnancyCell]}>{t("pregnancy", "Pregnancy")}</Text>
              <Text style={[styles.headerText, styles.childCell]}>{t("child", "Child")}</Text>
              <Text style={[styles.headerText, styles.nameCell]}>{t("name", "Name")}</Text>
              <Text style={[styles.headerText, styles.aliveCell]}>{t("still_alive", "Still alive")}</Text>
              <Text style={[styles.headerText, styles.detailCell]}>{t("age_death_age", "Age / death age")}</Text>
              <Text style={[styles.headerText, styles.livingCell]}>{t("living_with_respondent", "Living with respondent")}</Text>
              <Text style={[styles.headerText, styles.actionsCell]}>{t("actions", "Actions")}</Text>
            </View>
            {committed.map(({ index, panel }) => {
              const alive = panelValue(panel, CHILD_ALIVE_FIELD);
              return (
                <View key={`${panelValue(panel, WQ_FOLLOWUP_PREGNANCY_INDEX_FIELD)}-${panelValue(panel, WQ_FOLLOWUP_CHILD_INDEX_FIELD)}-${panelValue(panel, WQ_PREGNANCY_BABY_NAME_FIELD)}`} style={styles.row}>
                  <Text style={[styles.cellText, styles.pregnancyCell]}>{panelValue(panel, WQ_FOLLOWUP_PREGNANCY_INDEX_FIELD)}</Text>
                  <Text style={[styles.cellText, styles.childCell]}>{panelValue(panel, WQ_FOLLOWUP_CHILD_INDEX_FIELD)}</Text>
                  <Text style={[styles.cellText, styles.nameCell]}>{panelValue(panel, WQ_PREGNANCY_BABY_NAME_FIELD) || "-"}</Text>
                  <Text style={[styles.cellText, styles.aliveCell]}>{codedYesNo(alive, question.survey)}</Text>
                  <Text style={[styles.cellText, styles.detailCell]}>
                    {Number(alive) === 1 ? f("value_years", "{value} years", { value: panelValue(panel, CHILD_AGE_FIELD) || "-" }) : deathAge(panelValue(panel, CHILD_DEATH_AGE_FIELD), question.survey)}
                  </Text>
                  <Text style={[styles.cellText, styles.livingCell]}>
                    {Number(alive) === 1
                      ? f("answer_line_number", "{answer} / line {number}", { answer: codedYesNo(panelValue(panel, CHILD_LIVING_WITH_FIELD), question.survey), number: panelValue(panel, CHILD_LINE_FIELD) || "-" })
                      : "-"}
                  </Text>
                  <View style={styles.actionsCell}>
                    <Pressable onPress={() => editChild(index)} style={styles.editButton}>
                      <Text style={styles.actionText}>{t("edit", "Edit")}</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteChild(index, panel)} style={styles.deleteButton}>
                      <Text style={styles.deleteText}>{t("delete", "Delete")}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : <Text style={styles.empty}>{t("the_table_will_be_created_after_the_first_child_s_details_are_added", "The table will be created after the first child's details are added.")}</Text>}

      {activePanel ? (
        <View style={styles.editor}>
          <Text style={styles.editorTitle}>
            {f("pregnancy_pregnancy_child_child_name", "Pregnancy {pregnancy} - Child {child}{name}", { pregnancy: panelValue(activePanel, WQ_FOLLOWUP_PREGNANCY_INDEX_FIELD), child: panelValue(activePanel, WQ_FOLLOWUP_CHILD_INDEX_FIELD), name: panelValue(activePanel, WQ_PREGNANCY_BABY_NAME_FIELD) ? `: ${panelValue(activePanel, WQ_PREGNANCY_BABY_NAME_FIELD)}` : "" })}
          </Text>
          <Text style={styles.editorInstruction}>{t("complete_this_child_only_after_saving_the_next_born_alive_child_will_be_asked", "Complete this child only. After saving, the next Born Alive child will be asked.")}</Text>
          {activeQuestions.map((child) => renderQuestion(
            child,
            `${question.name}-${editingIndex}-${child.name}`
          ))}
          {Number(panelValue(activePanel, CHILD_ALIVE_FIELD)) === 1 &&
          Number(panelValue(activePanel, CHILD_LIVING_WITH_FIELD)) === 1 ? (
            <View style={styles.generatedLineBox}>
              <Text style={styles.generatedLineLabel}>{t("q27_i_automatically_generated_household_child_number", "Q27_i. Automatically generated household child number")}</Text>
              <Text style={styles.generatedLineValue}>{panelValue(activePanel, CHILD_LINE_FIELD) || t("generating", "Generating...")}</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={commitChild} style={styles.commitButton}>
            <Text style={controlStyles.buttonText}>
              {Number(panelValue(activePanel, WQ_FOLLOWUP_COMPLETED_FIELD)) === 1
                ? t("update_child_details", "Update child details")
                : t("add_child_details", "Add child details")}
            </Text>
          </Pressable>
        </View>
      ) : committed.length === eligibleChildCount ? (
        <Text style={styles.complete}>{t("all_born_alive_children_have_been_added", "All Born Alive children have been added.")}</Text>
      ) : (
        <Text style={styles.empty}>{t("preparing_the_next_born_alive_child", "Preparing the next Born Alive child...")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heading: { color: "#18202a", fontSize: 18, fontWeight: "900" },
  count: { color: "#24527a", fontSize: 14, fontWeight: "900" },
  empty: { color: "#667085", fontSize: 14 },
  complete: { color: "#067647", fontSize: 15, fontWeight: "800" },
  table: { minWidth: 660, overflow: "hidden", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  row: { minHeight: 36, flexDirection: "row", alignItems: "center", paddingHorizontal: 3, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  headerRow: { borderTopWidth: 0, backgroundColor: "#eef4fb" },
  headerText: { color: "#475467", fontSize: 9, fontWeight: "900", paddingHorizontal: 2 },
  cellText: { color: "#18202a", fontSize: 10, fontWeight: "700", paddingHorizontal: 2 },
  pregnancyCell: { width: 66 },
  childCell: { width: 42 },
  nameCell: { width: 92 },
  aliveCell: { width: 68 },
  detailCell: { width: 108 },
  livingCell: { width: 132 },
  actionsCell: { width: 116, flexDirection: "row", alignItems: "center", gap: 3 },
  editButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 5, backgroundColor: "#eaf2ff" },
  deleteButton: { paddingHorizontal: 7, paddingVertical: 6, borderRadius: 5, backgroundColor: "#fff1f0" },
  actionText: { color: "#175cd3", fontSize: 10, fontWeight: "900" },
  deleteText: { color: "#b42318", fontSize: 10, fontWeight: "900" },
  editor: { gap: 10, padding: 12, borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 8, backgroundColor: "#f8fbff" },
  editorTitle: { color: "#24527a", fontSize: 17, fontWeight: "900" },
  editorInstruction: { color: "#475467", fontSize: 14, fontWeight: "700" },
  generatedLineBox: { gap: 4, padding: 12, borderWidth: 1, borderColor: "#84adff", borderRadius: 7, backgroundColor: "#eff6ff" },
  generatedLineLabel: { color: "#344054", fontSize: 14, fontWeight: "800" },
  generatedLineValue: { color: "#175cd3", fontSize: 24, fontWeight: "900" },
  error: { color: "#b42318", fontSize: 14, fontWeight: "700" },
  commitButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#1f6feb" },
});
