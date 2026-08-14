/**
 * Renders the active Survey Core page using only native controls and explicit section navigation.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  assertNativeSurveySupport,
  getVisiblePageQuestions,
  stripSurveyHtml,
} from "./nativeSurveyModel.js";
import { NativeQuestionRenderer } from "./renderers/NativeQuestionRenderer.js";
import { SectionNavigator } from "./SectionNavigator.js";

export function NativeSurveyRenderer({
  model,
  answerData,
  locale,
  notice,
  onCompleteRequested,
  onPreviewRequested,
  onSaveDraft,
  sectionDrawerOpen,
  onSectionDrawerOpenChange,
  sections = [],
  onSectionSelect,
  compactPager = false,
}) {
  const { width } = useWindowDimensions();
  const compact = Platform.OS !== "web" || width < 700;
  const [revision, setRevision] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const compactScrollRef = useRef(null);
  const desktopScrollRef = useRef(null);
  const questionsOffsetRef = useRef(0);
  const questionOffsetsRef = useRef(new Map());
  const refreshFrameRef = useRef(null);
  const refresh = useCallback(() => {
    if (refreshFrameRef.current !== null) return;
    refreshFrameRef.current = requestAnimationFrame(() => {
      refreshFrameRef.current = null;
      setRevision((value) => value + 1);
    });
  }, []);
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

  useEffect(() => () => {
    if (refreshFrameRef.current !== null) {
      cancelAnimationFrame(refreshFrameRef.current);
      refreshFrameRef.current = null;
    }
  }, []);

  if (unsupported.length) {
    throw new Error(
      `Questionnaire has unsupported native fields: ${unsupported.map((item) => `${item.name}:${item.type}`).join(", ")}`
    );
  }

  const page = model.currentPage || model.firstVisiblePage;
  const pageIndex = model.visiblePages.indexOf(page);
  const visibleQuestions = useMemo(() => getVisiblePageQuestions(page), [page, revision]);
  const useCompactPager = compact && compactPager && visibleQuestions.length > 1;
  const activeQuestionIndex = Math.min(questionIndex, Math.max(visibleQuestions.length - 1, 0));
  const visibleQuestionWindow = useCompactPager
    ? visibleQuestions.slice(activeQuestionIndex, activeQuestionIndex + 1)
    : visibleQuestions;

  useEffect(() => {
    questionOffsetsRef.current = new Map();
    setQuestionIndex(0);
  }, [page?.name]);

  useEffect(() => {
    if (questionIndex >= visibleQuestions.length) {
      setQuestionIndex(Math.max(visibleQuestions.length - 1, 0));
    }
  }, [questionIndex, visibleQuestions.length]);

  const renderQuestion = useCallback((question, key = question.id || question.name) => (
    <NativeQuestionRenderer
      key={key}
      answerData={answerData}
      locale={locale}
      question={question}
      onChange={refresh}
      renderQuestion={renderQuestion}
      renderRevision={revision}
    />
  ), [answerData, locale, refresh, revision]);
  const renderTopLevelQuestion = useCallback((question) => (
    <View
      key={question.id || question.name}
      onLayout={(event) => {
        questionOffsetsRef.current.set(question.name, event.nativeEvent.layout.y);
      }}
      style={styles.questionRow}
    >
      {renderQuestion(question)}
    </View>
  ), [renderQuestion]);

  function scrollToQuestion(question) {
    if (!question) return;
    const index = visibleQuestions.findIndex((item) => item.name === question.name);
    if (index < 0) return;
    if (useCompactPager) {
      setQuestionIndex(index);
      scrollToTop();
      return;
    }
    requestAnimationFrame(() => {
      if (compact) {
        const questionOffset = questionOffsetsRef.current.get(question.name);
        compactScrollRef.current?.scrollTo({
          animated: true,
          y: Math.max(0, questionsOffsetRef.current + (Number.isFinite(questionOffset) ? questionOffset : 0) - 8),
        });
      } else {
        desktopScrollRef.current?.scrollTo?.({ animated: true, y: 0 });
      }
    });
  }

  function scrollToTop() {
    compactScrollRef.current?.scrollTo?.({ animated: false, y: 0 });
    desktopScrollRef.current?.scrollTo?.({ animated: false, y: 0 });
  }

  function canMoveToPreviousQuestion() {
    return useCompactPager && activeQuestionIndex > 0;
  }

  function canMoveToNextQuestion() {
    return useCompactPager && activeQuestionIndex < visibleQuestions.length - 1;
  }

  async function previous() {
    if (canMoveToPreviousQuestion()) {
      setQuestionIndex((value) => Math.max(0, value - 1));
      scrollToTop();
      await onSaveDraft?.({ silent: true, reason: "previous-question" });
      return;
    }
    model.prevPage();
    refresh();
    scrollToTop();
    await onSaveDraft?.({ silent: true, reason: "previous" });
  }

  async function next() {
    if (canMoveToNextQuestion()) {
      const activeQuestion = visibleQuestions[activeQuestionIndex];
      const valid = activeQuestion?.validate?.() !== false;
      refresh();
      if (!valid || activeQuestion?.errors?.length) {
        scrollToQuestion(activeQuestion);
        return;
      }
      setQuestionIndex((value) => Math.min(visibleQuestions.length - 1, value + 1));
      scrollToTop();
      await onSaveDraft?.({ silent: true, reason: "next-question" });
      return;
    }
    const currentPage = model.currentPage;
    model.nextPage();
    refresh();
    if (model.currentPage === currentPage) {
      const firstQuestionWithError = getVisiblePageQuestions(currentPage).find(hasQuestionValidationProblem);
      scrollToQuestion(firstQuestionWithError);
    } else {
      scrollToTop();
    }
    await onSaveDraft?.({ silent: true, reason: "next" });
  }

  async function complete() {
    await onCompleteRequested?.(model);
    const firstQuestionWithError = getVisiblePageQuestions(model.currentPage).find(
      hasQuestionValidationProblem
    );
    scrollToQuestion(firstQuestionWithError);
    refresh();
  }

  const pageHeader = (
    <View style={[styles.pageHeader, compact && styles.pageHeaderCompact]}>
        <Text style={styles.pageTitle}>
          {stripSurveyHtml(
            (locale && locale !== "default" && page?.locTitle?.getLocaleText?.(locale)) ||
              page?.locTitle?.getLocaleText?.("default") ||
              page?.locTitle?.renderedHtml ||
              page?.title ||
              "Questionnaire"
          )}
        </Text>
        <Text style={styles.pageCount}>{`Section ${pageIndex + 1} of ${model.visiblePages.length}`}</Text>
    </View>
  );
  const questions = (
    <View
      onLayout={(event) => {
        questionsOffsetRef.current = event.nativeEvent.layout.y;
      }}
      style={styles.questions}
    >
        {visibleQuestionWindow.map((question) => renderTopLevelQuestion(question))}
    </View>
  );
  const compactListHeader = (
    <View style={styles.compactHeaderContent}>
      {sections.length ? (
        <SectionNavigator
          drawerOpen={sectionDrawerOpen}
          onDrawerOpenChange={onSectionDrawerOpenChange}
          onSelect={onSectionSelect}
          progressDotsPressable={false}
          sections={sections}
          showCompactTrigger={false}
        />
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {pageHeader}
      {useCompactPager ? (
        <Text style={styles.questionCounter}>
          {`Question ${activeQuestionIndex + 1} of ${visibleQuestions.length}`}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {compact ? (
        <ScrollView
          ref={compactScrollRef}
          contentContainerStyle={styles.compactContent}
          keyboardShouldPersistTaps="always"
        >
          {compactListHeader}
          {questions}
        </ScrollView>
      ) : (
        <>
          {sections.length ? <SectionNavigator sections={sections} onSelect={onSectionSelect} /> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {pageHeader}
          <ScrollView ref={desktopScrollRef} keyboardShouldPersistTaps="always" contentContainerStyle={styles.questions}>
            {visibleQuestions.map((question) => renderTopLevelQuestion(question))}
          </ScrollView>
        </>
      )}
      <View style={styles.navigation}>
        <Pressable
          accessibilityLabel="Previous section"
          disabled={model.isFirstPage && !canMoveToPreviousQuestion()}
          hitSlop={6}
          onPress={previous}
          style={[styles.iconButton, model.isFirstPage && !canMoveToPreviousQuestion() && styles.disabled]}
        >
          <MaterialCommunityIcons color="#344054" name="chevron-left" size={28} />
        </Pressable>
        <View style={styles.middleActions}>
          {onPreviewRequested ? (
            <Pressable
              accessibilityLabel="Preview answers"
              hitSlop={6}
              onPress={onPreviewRequested}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons color="#344054" name="eye-outline" size={23} />
            </Pressable>
          ) : null}
          {onSaveDraft ? (
            <Pressable
              accessibilityLabel="Save draft"
              hitSlop={6}
              onPress={() => onSaveDraft({ manual: true })}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons color="#344054" name="content-save-outline" size={23} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel={model.isLastPage ? "Review and submit" : "Next section"}
          hitSlop={6}
          onPress={model.isLastPage && !canMoveToNextQuestion() ? complete : next}
          style={styles.primaryIconButton}
        >
          <MaterialCommunityIcons color="#ffffff" name="chevron-right" size={28} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  compactHeaderContent: { gap: 10 },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#e4e7ec" },
  pageHeaderCompact: { paddingTop: 2, paddingBottom: 8 },
  pageTitle: { flex: 1, color: "#18202a", fontSize: 20, fontWeight: "800" },
  pageCount: { color: "#667085", fontSize: 13, fontWeight: "700" },
  compactContent: { gap: 10, paddingBottom: 22 },
  questions: { gap: 12, paddingVertical: 8, paddingBottom: 24 },
  questionRow: { marginBottom: 12 },
  questionCounter: { textAlign: "center", color: "#667085", fontSize: 12, fontWeight: "800" },
  notice: { padding: 9, borderRadius: 7, color: "#1f4d7a", backgroundColor: "#eef6ff", fontSize: 13, fontWeight: "700" },
  navigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  middleActions: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  iconButton: { width: 48, minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#98a2b3", borderRadius: 8, backgroundColor: "#ffffff" },
  primaryIconButton: { width: 48, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#1f6feb" },
  disabled: { opacity: 0.35 },
});

function hasQuestionValidationProblem(question) {
  if (Array.isArray(question?.errors) && question.errors.length > 0) return true;
  if (question?.isRequired && isEmptyQuestionValue(question.value)) return true;
  if (question?.getType?.() !== "paneldynamic") return false;
  return (question.panels || []).some((panel) =>
    (panel.questions || []).some((panelQuestion) => hasQuestionValidationProblem(panelQuestion))
  );
}

function isEmptyQuestionValue(value) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}
