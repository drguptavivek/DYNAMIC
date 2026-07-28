/**
 * Renders the active Survey Core page using only native controls and explicit section navigation.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import {
  assertNativeSurveySupport,
  getVisiblePageQuestions,
  stripSurveyHtml,
} from "./nativeSurveyModel.js";
import { NativeQuestionRenderer } from "./renderers/NativeQuestionRenderer.js";
import { SectionNavigator } from "./SectionNavigator.js";

export function NativeSurveyRenderer({
  model,
  notice,
  onCompleteRequested,
  onSaveDraft,
  sections = [],
  onSectionSelect,
}) {
  const { width } = useWindowDimensions();
  const compact = width < 700;
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

  async function previous() {
    model.prevPage();
    refresh();
    await onSaveDraft?.({ silent: true, reason: "previous" });
  }

  async function next() {
    model.nextPage();
    refresh();
    await onSaveDraft?.({ silent: true, reason: "next" });
  }

  async function complete() {
    await onCompleteRequested?.(model);
    refresh();
  }

  const pageHeader = (
    <View style={[styles.pageHeader, compact && styles.pageHeaderCompact]}>
        <Text style={styles.pageTitle}>{stripSurveyHtml(page?.locTitle?.renderedHtml || page?.title || "Questionnaire")}</Text>
        <Text style={styles.pageCount}>{`Section ${pageIndex + 1} of ${model.visiblePages.length}`}</Text>
    </View>
  );
  const questions = (
    <View style={styles.questions}>
        {getVisiblePageQuestions(page).map((question) => renderQuestion(question))}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {compact ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.compactContent}>
          {sections.length ? <SectionNavigator sections={sections} onSelect={onSectionSelect} /> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {pageHeader}
          {questions}
        </ScrollView>
      ) : (
        <>
          {sections.length ? <SectionNavigator sections={sections} onSelect={onSectionSelect} /> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {pageHeader}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.questions}>
            {getVisiblePageQuestions(page).map((question) => renderQuestion(question))}
          </ScrollView>
        </>
      )}
      <View style={styles.navigation}>
        <Pressable disabled={model.isFirstPage} onPress={previous} style={[styles.secondaryButton, model.isFirstPage && styles.disabled]}>
          <Text style={styles.secondaryText}>Previous</Text>
        </Pressable>
        {onSaveDraft ? (
          <Pressable onPress={() => onSaveDraft()} style={styles.draftButton}>
            <Text style={styles.draftText}>Save draft</Text>
          </Pressable>
        ) : null}
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
  pageHeaderCompact: { paddingTop: 2, paddingBottom: 8 },
  pageTitle: { flex: 1, color: "#18202a", fontSize: 20, fontWeight: "800" },
  pageCount: { color: "#667085", fontSize: 13, fontWeight: "700" },
  compactContent: { gap: 10, paddingBottom: 22 },
  questions: { gap: 12, paddingVertical: 8, paddingBottom: 24 },
  notice: { padding: 9, borderRadius: 7, color: "#1f4d7a", backgroundColor: "#eef6ff", fontSize: 13, fontWeight: "700" },
  navigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  primaryButton: { minHeight: 46, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 8, backgroundColor: "#1f6feb" },
  primaryText: { color: "#ffffff", fontSize: 13, fontWeight: "800", textAlign: "center" },
  secondaryButton: { minHeight: 46, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  secondaryText: { color: "#18202a", fontSize: 13, fontWeight: "800", textAlign: "center" },
  draftButton: { minHeight: 46, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderWidth: 1, borderColor: "#98a2b3", borderRadius: 8, backgroundColor: "#ffffff" },
  draftText: { color: "#344054", fontSize: 13, fontWeight: "800", textAlign: "center" },
  disabled: { opacity: 0.35 },
});
