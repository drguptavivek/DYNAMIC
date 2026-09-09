/**
 * Renders the active Survey Core page using only native controls and explicit section navigation.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  assertNativeSurveySupport,
  getVisiblePageQuestions,
  hasNativeValidationProblem,
  stripSurveyHtml,
} from "./nativeSurveyModel.js";
import { buildQuestionRenderSignature } from "./questionRenderMemo.js";
import { NativeQuestionRenderer } from "./renderers/NativeQuestionRenderer.js";
import { SectionNavigator } from "./SectionNavigator.js";
import { getLogicalSurveySectionPosition } from "../../modules/questionnaires/surveyNavigation.js";

export const NativeSurveyRenderer = forwardRef(function NativeSurveyRenderer({
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
}, ref) {
  const { width } = useWindowDimensions();
  const compact = Platform.OS !== "web" || width < 700;
  const [revision, setRevision] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const compactScrollRef = useRef(null);
  const desktopScrollRef = useRef(null);
  const questionsOffsetRef = useRef(0);
  const questionOffsetsRef = useRef(new Map());
  const questionsContainerRef = useRef(null);
  const questionRowRefsRef = useRef(new Map());
  const refreshFrameRef = useRef(null);
  const scrollToTop = useCallback(() => {
    compactScrollRef.current?.scrollTo?.({ animated: false, y: 0 });
    desktopScrollRef.current?.scrollTo?.({ animated: false, y: 0 });
  }, []);
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
  const logicalSectionPosition = getLogicalSurveySectionPosition(model, page);
  const visibleQuestions = useMemo(() => getVisiblePageQuestions(page), [page, revision]);
  const useCompactPager = compact && compactPager && visibleQuestions.length > 1;
  const activeQuestionIndex = Math.min(questionIndex, Math.max(visibleQuestions.length - 1, 0));
  const visibleQuestionWindow = useCompactPager
    ? visibleQuestions.slice(activeQuestionIndex, activeQuestionIndex + 1)
    : visibleQuestions;

  useEffect(() => {
    questionOffsetsRef.current = new Map();
    setQuestionIndex(0);
    const frame = requestAnimationFrame(scrollToTop);
    return () => cancelAnimationFrame(frame);
  }, [page?.name, scrollToTop]);

  useEffect(() => {
    if (questionIndex >= visibleQuestions.length) {
      setQuestionIndex(Math.max(visibleQuestions.length - 1, 0));
    }
  }, [questionIndex, visibleQuestions.length]);

  // Hold render-affecting values in refs so renderQuestion/scrollToQuestionByName
  // keep a stable identity across keystrokes: NativeQuestionRenderer's memo
  // compares these callbacks by reference, so a fresh identity on every
  // revision bump would defeat the memo for every dependent (non-leaf)
  // question that receives renderQuestion/onRequestTopLevelFocus as a prop.
  const answerDataRef = useRef(answerData);
  answerDataRef.current = answerData;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const pageRef = useRef(page);
  pageRef.current = page;
  const scrollToQuestionRef = useRef(null);

  const renderQuestion = useCallback((question, key = question.id || question.name) => (
    <NativeQuestionRenderer
      key={key}
      answerData={answerDataRef.current}
      locale={localeRef.current}
      question={question}
      onChange={refresh}
      onRequestTopLevelFocus={scrollToQuestionByName}
      renderQuestion={renderQuestion}
      renderRevision={revisionRef.current}
      renderSignature={buildQuestionRenderSignature(question, localeRef.current)}
    />
  ), [refresh]);

  const scrollToQuestionByName = useCallback((name) => {
    const target = getVisiblePageQuestions(pageRef.current).find((item) => item.name === name);
    if (!target) return false;
    scrollToQuestionRef.current?.(target);
    return true;
  }, []);

  const renderTopLevelQuestion = useCallback((question) => (
    <View
      key={question.id || question.name}
      ref={(node) => {
        if (node) questionRowRefsRef.current.set(question.name, node);
        else questionRowRefsRef.current.delete(question.name);
      }}
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
    // Re-read visibility at call time: answer-driven skips (WQ Section 2
    // Q1 "no" -> Q6) fire before the refresh re-render, so a closure over
    // the previous render's visibleQuestions would carry stale indices.
    const currentQuestions = getVisiblePageQuestions(page);
    const index = currentQuestions.findIndex((item) => item.name === question.name);
    if (index < 0) return;
    if (useCompactPager) {
      setQuestionIndex(index);
      scrollToTop();
      return;
    }
    // The cached onLayout offsets go stale when an answer change hides
    // questions above the target (Q2-Q5/Q8/Q9 hide on Q1 "no"), which made
    // the scroll land far below the target. Measure the row's live position
    // when the scroll runs; the double frame lets the visibility re-render
    // commit and re-layout first, with the cached offset as the fallback.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!compact) {
          desktopScrollRef.current?.scrollTo?.({ animated: true, y: 0 });
          return;
        }
        const cachedY = questionOffsetsRef.current.get(question.name);
        const scrollY = (y) => compactScrollRef.current?.scrollTo?.({
          animated: true,
          y: Math.max(0, questionsOffsetRef.current + (Number.isFinite(y) ? y : 0) - 8),
        });
        const row = questionRowRefsRef.current.get(question.name);
        if (row?.measureLayout && questionsContainerRef.current) {
          row.measureLayout(
            questionsContainerRef.current,
            (_x, y) => scrollY(y),
            () => scrollY(cachedY),
          );
          return;
        }
        scrollY(cachedY);
      });
    });
  }
  scrollToQuestionRef.current = scrollToQuestion;

  useImperativeHandle(
    ref,
    () => ({
      focusQuestion(name) {
        const target = getVisiblePageQuestions(page).find((item) => item.name === name);
        if (!target) return false;
        scrollToQuestion(target);
        return true;
      },
    }),
    [scrollToQuestion, useCompactPager, page],
  );

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
      const firstQuestionWithError = getVisiblePageQuestions(currentPage).find(hasNativeValidationProblem);
      scrollToQuestion(firstQuestionWithError);
    } else {
      scrollToTop();
    }
    await onSaveDraft?.({ silent: true, reason: "next" });
  }

  async function complete() {
    await onCompleteRequested?.(model);
    const firstQuestionWithError = getVisiblePageQuestions(model.currentPage).find(hasNativeValidationProblem);
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
        <Text style={styles.pageCount}>
          {`Section ${logicalSectionPosition.index + 1} of ${logicalSectionPosition.total}`}
        </Text>
    </View>
  );
  const questions = (
    <View
      ref={questionsContainerRef}
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
});

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

