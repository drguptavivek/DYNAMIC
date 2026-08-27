/** Renders Q23_i as an ordered child table with a calculated outcome per row. */
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

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
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.headerText, styles.pregnancyCell]}>Pregnancy</Text>
            <Text style={[styles.headerText, styles.serialCell]}>S.No.</Text>
            <Text style={[styles.headerText, styles.nameCell]}>Name of child</Text>
            <Text style={[styles.headerText, styles.outcomeCell]}>Outcome</Text>
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
                  <Text style={[styles.cellText, styles.nameCell]}>{child.name}</Text>
                  <Text style={[styles.cellText, styles.outcomeCell]}>{child.outcome}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  table: { minWidth: 570, overflow: "hidden", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  row: { minHeight: 46, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  headerRow: { borderTopWidth: 0, backgroundColor: "#eef4fb" },
  headerText: { color: "#475467", fontSize: 12, fontWeight: "900", paddingHorizontal: 4 },
  cellText: { color: "#18202a", fontSize: 13, fontWeight: "700", paddingHorizontal: 4 },
  pregnancyCell: { width: 110 },
  serialCell: { width: 60 },
  nameCell: { width: 190 },
  outcomeCell: { width: 190 },
});
