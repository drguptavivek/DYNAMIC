/** Renders Q23_i as an ordered child table with a calculated outcome per row. */
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  getWqPregnancyChildSummary,
  groupWqPregnancyHistoryPanels,
  WQ_PREGNANCY_HISTORY_PANEL_FIELD,
} from "../nativeSurveyModel.js";
import { QuestionFrame } from "./QuestionFrame.js";

export function WqPregnancyOutcomeReviewRenderer({ locale, question }) {
  const history = question.survey?.getQuestionByName?.(WQ_PREGNANCY_HISTORY_PANEL_FIELD);
  const groups = useMemo(
    () => groupWqPregnancyHistoryPanels(history?.panels || []),
    [history?.panels, history?.panelCount, question.survey?.data]
  );

  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.headerText, styles.pregnancyCell]}>Pregnancy</Text>
          <Text style={[styles.headerText, styles.serialCell]}>No.</Text>
          <Text style={[styles.headerText, styles.nameCell]}>Child</Text>
          <Text style={[styles.headerText, styles.outcomeCell]}>Outcome</Text>
        </View>
        {groups.flatMap((group, groupIndex) =>
          group.rows.map(({ panel }, childIndex) => {
            const child = getWqPregnancyChildSummary(panel);
            return (
              <View key={`${group.groupIndex}-${childIndex}`} style={styles.row}>
                <Text style={[styles.cellText, styles.pregnancyCell]}>
                  {childIndex === 0 ? `Preg. ${groupIndex + 1}` : ""}
                </Text>
                <Text style={[styles.cellText, styles.serialCell]}>{childIndex + 1}</Text>
                <Text style={[styles.cellText, styles.nameCell]}>{child.name}</Text>
                <Text style={[styles.cellText, styles.outcomeCell]}>{child.outcome}</Text>
              </View>
            );
          })
        )}
      </View>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  table: { width: "100%", overflow: "hidden", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  row: { minHeight: 30, flexDirection: "row", alignItems: "center", paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  headerRow: { borderTopWidth: 0, backgroundColor: "#eef4fb" },
  headerText: { color: "#475467", fontSize: 8, fontWeight: "900", paddingHorizontal: 1 },
  cellText: { color: "#18202a", fontSize: 9, lineHeight: 11, fontWeight: "700", paddingHorizontal: 1 },
  pregnancyCell: { flex: 0.85 },
  serialCell: { width: 28, textAlign: "center" },
  nameCell: { flex: 1.05 },
  outcomeCell: { flex: 1.1 },
});
