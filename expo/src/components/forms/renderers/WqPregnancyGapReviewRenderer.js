import { getNativeFormText } from "../../../lib/nativeFormText.js";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  getWqPregnancyChildSummary,
  getWqPregnancyGapPrompt,
  getWqPregnancyReviewLabel,
  groupWqPregnancyHistoryPanels,
  WQ_PREGNANCY_HISTORY_PANEL_FIELD,
  WQ_PREGNANCY_FOLLOW_UP_FIELD,
} from "../nativeSurveyModel.js";

export function WqPregnancyGapReviewRenderer({ question, onChange, onRequestTopLevelFocus }) {
  const t = (key, fallback) => getNativeFormText(question.survey, key, fallback);
  const history = question.survey?.getQuestionByName?.(WQ_PREGNANCY_HISTORY_PANEL_FIELD);
  const groups = useMemo(
    () => groupWqPregnancyHistoryPanels(history?.panels || []),
    [history?.panels, history?.panelCount, question.survey?.data]
  );
  const initialGap = Math.max(
    0,
    Math.min(groups.length - 1, Number(question.__nativePregnancyGapPosition) || 0)
  );
  const [gapPosition, setGapPosition] = useState(initialGap);
  const [decision, setDecision] = useState(question.__nativePregnancyGapDecision || null);

  function chooseDecision(value) {
    question.__nativePregnancyGapDecision = value;
    setDecision(value);
  }

  function addPregnancyAtGap() {
    if (!history) return;
    history.dynamicInsertGroupPosition = gapPosition;
    history.dynamicReturnPageName = question.page?.name || "page_02b_reproduction_follow_up";
    history.dynamicAddRequestToken = Date.now();
    question.__nativePregnancyGapDecision = null;
    question.survey?.setValue?.(question.name, undefined);
    const historyPage = question.survey?.getPageByName?.("page_02a_pregnancy_history");
    if (historyPage) question.survey.currentPage = historyPage;
    onChange?.();
  }

  function confirmNoMissingPregnancy() {
    if (gapPosition < groups.length - 1) {
      const nextGap = gapPosition + 1;
      question.__nativePregnancyGapPosition = nextGap;
      question.__nativePregnancyGapDecision = null;
      setGapPosition(nextGap);
      setDecision(null);
      onChange?.();
      return;
    }
    chooseDecision("no");
    question.__nativePregnancyGapPosition = 0;
    question.survey?.setValue?.(question.name, 2);
    onChange?.();
    requestAnimationFrame(() => onRequestTopLevelFocus?.(WQ_PREGNANCY_FOLLOW_UP_FIELD));
  }

  if (!groups.length) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.heading}>{t("pregnancy_history_review", "Pregnancy history review")}</Text>
        <Text style={styles.emptyText}>{t("no_pregnancy_has_been_recorded_yet", "No pregnancy has been recorded yet.")}</Text>
        <Pressable onPress={addPregnancyAtGap} style={styles.addButton}>
          <MaterialCommunityIcons color="#ffffff" name="plus" size={20} />
          <Text style={styles.addButtonText}>{t("add_pregnancy", "Add pregnancy")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t("review_pregnancies_in_chronological_order", "Review pregnancies in chronological order")}</Text>
      <Text style={styles.help}>{t("pregnancy_1_is_the_woman_s_first_pregnancy", "Pregnancy 1 is the woman's first pregnancy.")}</Text>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.headerText, styles.pregnancyCell]}>{t("pregnancy", "Pregnancy")}</Text>
            <Text style={[styles.headerText, styles.serialCell]}>{t("s_no", "S.No.")}</Text>
            <Text style={[styles.headerText, styles.statusCell]}>{t("born_status", "Born status")}</Text>
            <Text style={[styles.headerText, styles.nameCell]}>{t("name_of_child", "Name of child")}</Text>
            <Text style={[styles.headerText, styles.sexCell]}>{t("sex", "Sex")}</Text>
            <Text style={[styles.headerText, styles.durationCell]}>{t("pregnancy_lasts", "Pregnancy lasts")}</Text>
          </View>
          {groups.flatMap((group, groupIndex) => group.rows.map(({ panel }, childIndex) => {
            const child = getWqPregnancyChildSummary(panel, question.survey);
            return (
              <View key={`${group.groupIndex}-${childIndex}`} style={styles.row}>
                <Text style={[styles.cellText, styles.pregnancyCell]}>
                  {getWqPregnancyReviewLabel(groupIndex, childIndex, question.survey)}
                </Text>
                <Text style={[styles.cellText, styles.serialCell]}>{childIndex + 1}</Text>
                <Text style={[styles.cellText, styles.statusCell]}>{child.bornStatus}</Text>
                <Text style={[styles.cellText, styles.nameCell]}>{child.name}</Text>
                <Text style={[styles.cellText, styles.sexCell]}>{child.sex}</Text>
                <Text style={[styles.cellText, styles.durationCell]}>{child.pregnancyLasts}</Text>
              </View>
            );
          }))}
        </View>
      </ScrollView>

      <View style={styles.questionBox}>
        <Text style={styles.questionCode}>22_i.</Text>
        <Text style={styles.questionText}>{getWqPregnancyGapPrompt(groups.length, gapPosition, question.survey)}</Text>
        <View style={styles.answerRow}>
          <Pressable
            onPress={() => chooseDecision("yes")}
            style={[styles.answerButton, decision === "yes" && styles.answerButtonSelected]}
          >
            <Text style={styles.answerText}>{t("yes", "Yes")}</Text>
          </Pressable>
          <Pressable
            onPress={confirmNoMissingPregnancy}
            style={[styles.answerButton, decision === "no" && styles.answerButtonSelected]}
          >
            <Text style={styles.answerText}>{t("no", "No")}</Text>
          </Pressable>
        </View>
        {decision === "yes" ? (
          <Pressable onPress={addPregnancyAtGap} style={styles.addButton}>
            <MaterialCommunityIcons color="#ffffff" name="plus" size={20} />
            <Text style={styles.addButtonText}>{t("add_pregnancy_here", "Add pregnancy here")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  heading: { color: "#18202a", fontSize: 18, fontWeight: "900" },
  help: { color: "#667085", fontSize: 14 },
  emptyText: { color: "#667085", fontSize: 15 },
  table: { minWidth: 520, overflow: "hidden", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  row: { minHeight: 36, flexDirection: "row", alignItems: "center", paddingHorizontal: 3, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  headerRow: { borderTopWidth: 0, backgroundColor: "#eef4fb" },
  headerText: { color: "#475467", fontSize: 9, fontWeight: "900", paddingHorizontal: 2 },
  cellText: { color: "#18202a", fontSize: 10, fontWeight: "700", paddingHorizontal: 2 },
  pregnancyCell: { width: 78 },
  serialCell: { width: 38 },
  statusCell: { width: 78 },
  nameCell: { width: 108 },
  sexCell: { width: 52 },
  durationCell: { width: 102 },
  questionBox: { gap: 10, padding: 12, borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 8, backgroundColor: "#f8fbff" },
  questionCode: { color: "#24527a", fontSize: 16, fontWeight: "900" },
  questionText: { color: "#18202a", fontSize: 17, fontWeight: "800", lineHeight: 24 },
  answerRow: { flexDirection: "row", gap: 10 },
  answerButton: { minHeight: 48, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#b9cbe3", borderRadius: 7, backgroundColor: "#ffffff" },
  answerButtonSelected: { borderColor: "#1f6feb", backgroundColor: "#eaf3ff" },
  answerText: { color: "#18202a", fontSize: 16, fontWeight: "800" },
  addButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 7, backgroundColor: "#1f6feb" },
  addButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
});
