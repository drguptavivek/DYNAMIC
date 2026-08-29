/** Compares WQ summary counts with completed detailed pregnancy-history counts before Q29. */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { calculateWqReproductionComparison } from "../../../lib/womanSurveyBehaviors.js";
import { QuestionFrame } from "./QuestionFrame.js";

const COLUMNS = [
  { key: "living", fields: ["wq_02_reproduction_how_many_sons_live_with_you", "wq_02_reproduction_how_many_daugthers_live_with_you"], left: "Q3a + Q3b\nSons/daughters living with you", right: "Born Alive + Q24 Yes + Q26 Yes" },
  { key: "elsewhere", fields: ["wq_02_reproduction_how_many_sons_are_alive_but_do_not_live_wi", "wq_02_reproduction_how_many_daugthers_are_alive_but_do_not_li"], left: "Q5a + Q5b\nAlive, not living with you", right: "Born Alive + Q24 Yes + Q26 No" },
  { key: "died", fields: ["wq_02_reproduction_how_many_boys_have_died", "wq_02_reproduction_how_many_girls_have_died"], left: "Q7a + Q7b\nBoys/girls died", right: "Born Alive + Q24 No" },
  { key: "losses", fields: ["wq_02_reproduction_how_many_miscarriages_abortions_and_stillb"], left: "Q11\nAbortions/stillbirths/miscarriages", right: "Born Dead + Miscarriage + Abortion" },
];

const Q3_FIELD = "wq_02_reproduction_how_many_sons_live_with_you";
const Q14_FIELD = "wq_pregnancy_history";

export function WqReproductionComparisonRenderer({
  locale,
  onRequestTopLevelFocus,
  question,
}) {
  const comparison = calculateWqReproductionComparison(question.survey);
  const summaryTotal = COLUMNS.reduce(
    (total, column) => total + comparison.summary[column.key],
    0
  );
  const detailedTotal = COLUMNS.reduce(
    (total, column) => total + comparison.detailed[column.key],
    0
  );
  const needsReverification = detailedTotal < summaryTotal;

  function goToQuestion(name) {
    const survey = question.survey;
    const targetPage = (survey?.pages || []).find((page) => page.getQuestionByName?.(name));
    if (!targetPage) return;
    survey.currentPage = targetPage;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onRequestTopLevelFocus?.(name));
    });
  }
  return (
    <QuestionFrame locale={locale} question={question}>
      <View style={styles.table}>
        <View style={styles.groupRow}>
          <Text style={styles.group}>Earlier summary</Text>
          <Text style={[styles.group, styles.rightGroup]}>Detailed history</Text>
        </View>
        {COLUMNS.map((column) => (
          <View key={column.key} style={styles.row}>
            <Text style={styles.leftLabelCell}>{column.left}</Text>
            <Text style={styles.valueCell}>{comparison.summary[column.key]}</Text>
            <Text style={styles.rightLabelCell}>{column.right}</Text>
            <Text style={[styles.valueCell, comparison.summary[column.key] !== comparison.detailed[column.key] && styles.mismatch]}>{comparison.detailed[column.key]}</Text>
          </View>
        ))}
        <View style={[styles.row, styles.grandTotalRow]}>
          <Text style={[styles.leftLabelCell, styles.grandTotalLabel]}>Total</Text>
          <Text style={[styles.valueCell, styles.grandTotalValue]}>{summaryTotal}</Text>
          <Text style={[styles.rightLabelCell, styles.grandTotalLabel]}>Total</Text>
          <Text style={[
            styles.valueCell,
            styles.grandTotalValue,
            summaryTotal !== detailedTotal && styles.mismatch,
          ]}>{detailedTotal}</Text>
        </View>
      </View>
      <Text style={styles.note}>Highlighted detailed totals do not match the corresponding earlier answer.</Text>
      {needsReverification ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Detailed birth History has less births, miscarriages etc than what was initially told. Maybe some pregnancies/births have been missed in detailed history? Lets Reverify.
          </Text>
          <View style={styles.buttonRow}>
            <Pressable onPress={() => goToQuestion(Q3_FIELD)} style={styles.correctionButton}>
              <Text style={styles.buttonText}>Go to Q3</Text>
            </Pressable>
            <Pressable onPress={() => goToQuestion(Q14_FIELD)} style={styles.correctionButton}>
              <Text style={styles.buttonText}>Go to Q14</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </QuestionFrame>
  );
}

const styles = StyleSheet.create({
  table: { width: "100%", overflow: "hidden", borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#fff" },
  groupRow: { flexDirection: "row", backgroundColor: "#dbeafe" },
  group: { flex: 1, paddingHorizontal: 4, paddingVertical: 7, color: "#1d4f7a", fontSize: 11, fontWeight: "900", textAlign: "center" },
  rightGroup: { borderLeftWidth: 1, borderLeftColor: "#b8cce3" },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#d0d5dd" },
  leftLabelCell: { flex: 1, minHeight: 42, padding: 5, color: "#344054", fontSize: 10, lineHeight: 13, fontWeight: "800" },
  rightLabelCell: { flex: 1, minHeight: 42, padding: 5, color: "#344054", fontSize: 10, lineHeight: 13, fontWeight: "800", borderLeftWidth: 1, borderLeftColor: "#d0d5dd" },
  valueCell: { width: 34, paddingHorizontal: 2, paddingVertical: 8, color: "#18202a", fontSize: 16, fontWeight: "900", textAlign: "center" },
  grandTotalRow: { backgroundColor: "#e8f1fb" },
  grandTotalLabel: { minHeight: 36, color: "#1d4f7a", fontSize: 12, fontWeight: "900" },
  grandTotalValue: { color: "#1d4f7a" },
  mismatch: { color: "#b42318", backgroundColor: "#fff1f0" },
  note: { color: "#667085", fontSize: 10, fontWeight: "700" },
  warningBox: { gap: 10, padding: 10, borderWidth: 1, borderColor: "#f04438", borderRadius: 8, backgroundColor: "#fff1f0" },
  warningText: { color: "#b42318", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  buttonRow: { flexDirection: "row", gap: 10 },
  correctionButton: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#b42318" },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
});
