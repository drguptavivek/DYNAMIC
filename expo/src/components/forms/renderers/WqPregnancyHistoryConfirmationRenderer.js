/** Shows Q22b's ordered pregnancy/child review and returns corrections to Q14. */
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  getWqPregnancyChildSummary,
  groupWqPregnancyHistoryPanels,
  setNativeQuestionValue,
  WQ_PREGNANCY_HISTORY_PANEL_FIELD,
} from "../nativeSurveyModel.js";
import { QuestionFrame } from "./QuestionFrame.js";

export function WqPregnancyHistoryConfirmationRenderer({
  locale,
  question,
  onChange,
}) {
  const history = question.survey?.getQuestionByName?.(WQ_PREGNANCY_HISTORY_PANEL_FIELD);
  const groups = useMemo(
    () => groupWqPregnancyHistoryPanels(history?.panels || []),
    [history?.panels, history?.panelCount, question.survey?.data]
  );
  const value = question.value;
  const disabled = question?.readOnly === true;

  function chooseAnswer(answer) {
    if (disabled) return;
    if (Number(answer) === 2) {
      // "No" is transient: it always sends the interviewer back to revise Q14,
      // so it must not persist as the terminal confirmation of the list.
      question.survey?.setValue?.(question.name, undefined);
      const historyPage = question.survey?.getPageByName?.("page_02a_pregnancy_history");
      if (historyPage) question.survey.currentPage = historyPage;
      onChange?.();
      return;
    }
    setNativeQuestionValue(question, answer);
    question.validate?.();
    onChange?.();
  }

  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={styles.wrap}>
        <Text style={styles.heading}>Complete pregnancy history in chronological order</Text>
        <Text style={styles.help}>Pregnancy 1 is the woman&apos;s first pregnancy.</Text>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.headerText, styles.pregnancyCell]}>Pregnancy</Text>
              <Text style={[styles.headerText, styles.serialCell]}>S.No.</Text>
              <Text style={[styles.headerText, styles.statusCell]}>Born status</Text>
              <Text style={[styles.headerText, styles.nameCell]}>Name of child</Text>
              <Text style={[styles.headerText, styles.sexCell]}>Sex</Text>
              <Text style={[styles.headerText, styles.durationCell]}>Pregnancy lasts</Text>
            </View>
            {groups.flatMap((group, groupIndex) =>
              group.rows.map(({ panel }, childIndex) => {
                const child = getWqPregnancyChildSummary(panel);
                return (
                  <View key={`${group.groupIndex}-${childIndex}`} style={styles.row}>
                    <Text style={[styles.cellText, styles.pregnancyCell]}>
                      {childIndex === 0 ? `Pregnancy ${groupIndex + 1}` : ""}
                    </Text>
                    <Text style={[styles.cellText, styles.serialCell]}>{childIndex + 1}</Text>
                    <Text style={[styles.cellText, styles.statusCell]}>{child.bornStatus}</Text>
                    <Text style={[styles.cellText, styles.nameCell]}>{child.name}</Text>
                    <Text style={[styles.cellText, styles.sexCell]}>{child.sex}</Text>
                    <Text style={[styles.cellText, styles.durationCell]}>{child.pregnancyLasts}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
        <View style={styles.answerRow}>
          {[
            { label: "Yes", value: 1 },
            { label: "No", value: 2 },
          ].map((choice) => {
            const selected = String(value) === String(choice.value);
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ disabled, selected }}
                disabled={disabled}
                key={choice.value}
                onPress={() => chooseAnswer(choice.value)}
                style={[styles.answerButton, selected && styles.answerButtonSelected]}
              >
                <View style={[styles.optionMark, selected && styles.optionMarkSelected]} />
                <Text style={styles.answerText}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  heading: { color: "#18202a", fontSize: 18, fontWeight: "900" },
  help: { color: "#667085", fontSize: 14 },
  table: { minWidth: 720, overflow: "hidden", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  row: { minHeight: 46, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  headerRow: { borderTopWidth: 0, backgroundColor: "#eef4fb" },
  headerText: { color: "#475467", fontSize: 12, fontWeight: "900", paddingHorizontal: 4 },
  cellText: { color: "#18202a", fontSize: 13, fontWeight: "700", paddingHorizontal: 4 },
  pregnancyCell: { width: 104 },
  serialCell: { width: 52 },
  statusCell: { width: 108 },
  nameCell: { width: 150 },
  sexCell: { width: 76 },
  durationCell: { width: 140 },
  answerRow: { flexDirection: "row", gap: 10 },
  answerButton: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 7, backgroundColor: "#ffffff" },
  answerButtonSelected: { borderColor: "#1f6feb", backgroundColor: "#eaf3ff" },
  optionMark: { width: 18, height: 18, borderWidth: 2, borderColor: "#98a2b3", borderRadius: 9 },
  optionMarkSelected: { borderWidth: 5, borderColor: "#1f6feb" },
  answerText: { color: "#18202a", fontSize: 16, fontWeight: "800" },
});
