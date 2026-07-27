/**
 * Renders the active Survey Core page using only native controls and explicit section navigation.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  assertNativeSurveySupport,
  getVisiblePageQuestions,
  stripSurveyHtml,
} from "./nativeSurveyModel.js";
import { NativeQuestionRenderer } from "./renderers/NativeQuestionRenderer.js";
import { SectionNavigator } from "./SectionNavigator.js";

export function NativeSurveyRenderer({ model, onCompleteRequested, sections = [], onSectionSelect }) {
  const [, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const unsupported = useMemo(() => assertNativeSurveySupport(model), [model]);

  useEffect(() => {
    const events = [
      model.onValueChanged,
      model.onCurrentPageChanged,
      model.onDynamicPanelAdded,
      model.onDynamicPanelRemoved,
    ].filter(Boolean);
    events.forEach((event) => event.add(refresh));
    return () => events.forEach((event) => event.remove?.(refresh));
  }, [model, refresh]);

  if (unsupported.length) {
    throw new Error(
      `HHQ has unsupported native fields: ${unsupported.map((item) => `${item.name}:${item.type}`).join(", ")}`
    );
  }

  const page = model.currentPage || model.firstVisiblePage;
  const pageIndex = model.visiblePages.indexOf(page);
  const renderQuestion = (question, key = question.id || question.name) => (
    <NativeQuestionRenderer
      key={key}
      question={question}
      onChange={refresh}
      renderQuestion={renderQuestion}
    />
  );

  function previous() {
    model.prevPage();
    refresh();
  }

  function next() {
    model.nextPage();
    refresh();
  }

  async function complete() {
    await onCompleteRequested?.(model);
    refresh();
  }

  return (
    <View style={styles.wrap}>
      {sections.length ? <SectionNavigator sections={sections} onSelect={onSectionSelect} /> : null}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{stripSurveyHtml(page?.locTitle?.renderedHtml || page?.title || "Questionnaire")}</Text>
        <Text style={styles.pageCount}>{`Section ${pageIndex + 1} of ${model.visiblePages.length}`}</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.questions}>
        {getVisiblePageQuestions(page).map((question) => renderQuestion(question))}
      </ScrollView>
      <View style={styles.navigation}>
        <Pressable disabled={model.isFirstPage} onPress={previous} style={[styles.secondaryButton, model.isFirstPage && styles.disabled]}>
          <Text style={styles.secondaryText}>Previous</Text>
        </Pressable>
        {model.isLastPage ? (
          <Pressable onPress={complete} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Review & Submit</Text>
          </Pressable>
        ) : (
          <Pressable onPress={next} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Next</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#e4e7ec" },
  pageTitle: { flex: 1, color: "#18202a", fontSize: 20, fontWeight: "800" },
  pageCount: { color: "#667085", fontSize: 13, fontWeight: "700" },
  questions: { gap: 12, paddingVertical: 12, paddingBottom: 30 },
  navigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  primaryButton: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderRadius: 8, backgroundColor: "#1f6feb" },
  primaryText: { color: "#ffffff", fontWeight: "800" },
  secondaryButton: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  secondaryText: { color: "#18202a", fontWeight: "800" },
  disabled: { opacity: 0.35 },
});
