/**
 * Renders the active Survey Core page using only native controls and explicit section navigation.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  assertNativeSurveySupport,
  getVisiblePageQuestions,
  stripSurveyHtml,
  validateNativeQuestionTree,
} from "./nativeSurveyModel.js";
import { buildQuestionRenderSignature } from "./questionRenderMemo.js";
import { findFirstNativeValidationQuestion, getValidationPanelIndex } from "./nativeValidationFocus.js";
import { NativeQuestionRenderer } from "./renderers/NativeQuestionRenderer.js";
import { SectionNavigator } from "./SectionNavigator.js";
import { getLogicalSurveySectionPosition } from "../../modules/questionnaires/surveyNavigation.js";

export const NativeSurveyRenderer = forwardRef(function NativeSurveyRenderer({
  model,
  answerData,
  locale,
  notice,
  pageIntro,
  pageFooter,
  onCompleteRequested,
  onNextRequested,
  onPreviewRequested,
  onSaveDraft,
  sectionDrawerOpen,
  onSectionDrawerOpenChange,
  sections = [],
  onSectionSelect,
  compactPager = false,
  validationFocusRequest,
}, ref) {
  const { width } = useWindowDimensions();
  const compact = Platform.OS !== "web" || width < 700;
  const [revision, setRevision] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const compactScrollRef = useRef(null);
  const desktopScrollRef = useRef(null);
  const questionsOffsetRef = useRef(0);
  const questionOffsetsRef = useRef(new Map());
  const questionsContainerRef = useRef(null);
  const questionRowRefsRef = useRef(new Map());
  const refreshFrameRef = useRef(null);
  const focusedQuestionRef = useRef(null);
  const keyboardScrollTimersRef = useRef([]);
  const [activeFocusRequest, setActiveFocusRequest] = useState(null);
  const focusSequenceRef = useRef(0);
  const pendingFocusRef = useRef(null);
  const questionNodesRef = useRef(new Map());
  const focusRequestRef = useRef(null);
  focusRequestRef.current = activeFocusRequest;
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
    keyboardScrollTimersRef.current.forEach((timer) => clearTimeout(timer));
    keyboardScrollTimersRef.current = [];
  }, []);

  if (unsupported.length) {
    throw new Error(
      `Questionnaire has unsupported native fields: ${unsupported.map((item) => `${item.name}:${item.type}`).join(", ")}`
    );
  }

  const page = model.currentPage || model.firstVisiblePage;
  const resolvedPageIntro = typeof pageIntro === "function" ? pageIntro(page) : pageIntro;
  const resolvedPageFooter = typeof pageFooter === "function" ? pageFooter(page) : pageFooter;
  const logicalSectionPosition = getLogicalSurveySectionPosition(model, page);
  // Read visibility on every render. Draft restoration assigns the saved
  // answer object in one operation and can update SurveyJS conditions without
  // producing a separate renderer revision for each restored answer.
  const visibleQuestions = getVisiblePageQuestions(page);
  const useCompactPager = compact && compactPager && visibleQuestions.length > 1;
  const activeQuestionIndex = Math.min(questionIndex, Math.max(visibleQuestions.length - 1, 0));
  const visibleQuestionWindow = useCompactPager
    ? visibleQuestions.slice(activeQuestionIndex, activeQuestionIndex + 1)
    : visibleQuestions;

  useEffect(() => {
    questionOffsetsRef.current = new Map();
    if (pendingFocusRef.current?.page !== page) setQuestionIndex(0);
    const frame = requestAnimationFrame(() => {
      if (!pendingFocusRef.current) scrollToTop();
    });
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

  const onQuestionLayout = useCallback((question) => {
    if (pendingFocusRef.current === question) {
      scrollToQuestionRef.current?.(question, { revealInput: true });
    }
  }, []);
  const onRegisterQuestion = useCallback((question, node) => {
    if (node) questionNodesRef.current.set(question, node);
    else questionNodesRef.current.delete(question);
  }, []);

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
      validationFocusRequest={focusRequestRef.current}
      onRegisterQuestion={onRegisterQuestion}
      onQuestionLayout={onQuestionLayout}
    />
  ), [refresh, onRegisterQuestion, onQuestionLayout]);

  const scrollToQuestionByName = useCallback((name) => {
    if (typeof name === "object" && name) {
      return requestQuestionFocusRef.current?.(name) ?? false;
    }
    focusedQuestionRef.current = name;
    const target = getVisiblePageQuestions(pageRef.current).find((item) => item.name === name);
    if (!target) return false;
    scrollToQuestionRef.current?.(target, { revealInput: true });
    return true;
  }, []);
  const requestQuestionFocusRef = useRef(null);

  // Android reports focus before the keyboard has finished opening. A single
  // scroll at that point is calculated against the old viewport and the
  // bottom text/number field can still be hidden by the keyboard. Re-apply
  // the question scroll after the keyboard frame and its final layout settle.
  useEffect(() => {
    const rescheduleFocusedQuestion = () => {
      const name = focusedQuestionRef.current;
      if (!name) return;
      keyboardScrollTimersRef.current.forEach((timer) => clearTimeout(timer));
      keyboardScrollTimersRef.current = [80, 220, 500].map((delay) => setTimeout(() => {
        scrollToQuestionByName(name);
      }, delay));
    };
    const updateKeyboardInset = (event) => {
      const height = Number(event?.endCoordinates?.height);
      setKeyboardInset(Number.isFinite(height) ? Math.max(0, height) : 0);
      rescheduleFocusedQuestion();
    };
    const subscriptions = [
      Keyboard.addListener("keyboardDidShow", updateKeyboardInset),
      Keyboard.addListener("keyboardDidChangeFrame", updateKeyboardInset),
      Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0)),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      keyboardScrollTimersRef.current.forEach((timer) => clearTimeout(timer));
      keyboardScrollTimersRef.current = [];
    };
  }, [scrollToQuestionByName]);

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

  function scrollToQuestion(question, options = {}) {
    if (!question) return;
    // Re-read visibility at call time: answer-driven skips (WQ Section 2
    // Q1 "no" -> Q6) fire before the refresh re-render, so a closure over
    // the previous render's visibleQuestions would carry stale indices.
    const currentQuestions = getVisiblePageQuestions(model.currentPage);
    const index = currentQuestions.findIndex((item) => item === question || getValidationPanelIndex(item, question) >= 0);
    if (index < 0) return;
    if (useCompactPager) {
      setQuestionIndex(index);
    }
    // The cached onLayout offsets go stale when an answer change hides
    // questions above the target (Q2-Q5/Q8/Q9 hide on Q1 "no"), which made
    // the scroll land far below the target. Measure the row's live position
    // when the scroll runs; the double frame lets the visibility re-render
    // commit and re-layout first, with the cached offset as the fallback.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const owner = currentQuestions[index];
        const cachedY = questionOffsetsRef.current.get(owner?.name);
        const scrollY = (y, exact = false) => {
          (compact ? compactScrollRef : desktopScrollRef).current?.scrollTo?.({
            animated: true,
            // Leave context above the field without hiding it under the keyboard.
            y: Math.max(0, questionsOffsetRef.current + (Number.isFinite(y) ? y : 0) -
              (options.revealInput ? 80 : 8)),
          });
          if (exact && pendingFocusRef.current === question) pendingFocusRef.current = null;
        };
        const exactRow = questionNodesRef.current.get(question);
        const row = exactRow || questionRowRefsRef.current.get(owner?.name);
        if (row?.measureLayout && questionsContainerRef.current) {
          row.measureLayout(
            questionsContainerRef.current,
            (_x, y) => scrollY(y, Boolean(exactRow)),
            () => scrollY(cachedY),
          );
          return;
        }
        scrollY(cachedY);
      });
    });
  }
  scrollToQuestionRef.current = scrollToQuestion;

  function requestQuestionFocus(question) {
    if (!question || question.page?.isVisible === false) return false;
    focusedQuestionRef.current = null;
    pendingFocusRef.current = question;
    if (question.page && model.currentPage !== question.page) model.currentPage = question.page;
    if (question.page && model.currentPage !== question.page) {
      pendingFocusRef.current = null;
      return false;
    }
    const request = { question, sequence: ++focusSequenceRef.current };
    focusRequestRef.current = request;
    setActiveFocusRequest(request);
    scrollToQuestion(question, { revealInput: true });
    refresh();
    return true;
  }
  requestQuestionFocusRef.current = requestQuestionFocus;

  useEffect(() => {
    if (validationFocusRequest?.question) requestQuestionFocusRef.current(validationFocusRequest.question);
  }, [validationFocusRequest]);

  useImperativeHandle(
    ref,
    () => ({
      focusQuestion(name) {
        const target = typeof name === "object" ? name : model.getQuestionByName?.(name);
        if (!target) return false;
        return requestQuestionFocus(findFirstNativeValidationQuestion([target]) || target);
      },
      focusFirstError() {
        const target = findFirstNativeValidationQuestion(getVisiblePageQuestions(model.currentPage));
        return target ? requestQuestionFocus(target) : false;
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
        requestQuestionFocus(findFirstNativeValidationQuestion([activeQuestion]) || activeQuestion);
        return;
      }
      setQuestionIndex((value) => Math.min(visibleQuestions.length - 1, value + 1));
      scrollToTop();
      return;
    }
    const currentPage = model.currentPage;
    const pageQuestions = getVisiblePageQuestions(currentPage);
    pageQuestions.forEach(validateNativeQuestionTree);
    refresh();
    const firstQuestionWithError = findFirstNativeValidationQuestion(pageQuestions);
    if (firstQuestionWithError) {
      requestQuestionFocus(firstQuestionWithError);
      await onSaveDraft?.({ silent: true, reason: "next" });
      return;
    }
    if (await onNextRequested?.(model, currentPage)) {
      refresh();
      await onSaveDraft?.({ silent: true, reason: "next" });
      return;
    }
    model.nextPage();
    refresh();
    if (model.currentPage === currentPage) {
      const error = findFirstNativeValidationQuestion(getVisiblePageQuestions(model.currentPage));
      if (error) requestQuestionFocus(error);
    } else {
      scrollToTop();
    }
    await onSaveDraft?.({ silent: true, reason: "next" });
  }

  async function complete() {
    await onCompleteRequested?.(model);
    const firstQuestionWithError = findFirstNativeValidationQuestion(getVisiblePageQuestions(model.currentPage));
    if (firstQuestionWithError) requestQuestionFocus(firstQuestionWithError);
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
        {resolvedPageFooter ? <Text style={styles.pageFooter}>{resolvedPageFooter}</Text> : null}
    </View>
  );
  const compactListHeader = (
    <View style={styles.compactHeaderContent}>
      {sections.length ? (
        <SectionNavigator
          model={model}
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
      {resolvedPageIntro ? <Text style={styles.pageIntro}>{resolvedPageIntro}</Text> : null}
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
          contentContainerStyle={[styles.compactContent, keyboardInset > 0 && { paddingBottom: keyboardInset + 22 }]}
          keyboardShouldPersistTaps="always"
        >
          {compactListHeader}
          {questions}
        </ScrollView>
      ) : (
        <>
          {sections.length ? <SectionNavigator model={model} sections={sections} onSelect={onSectionSelect} /> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {pageHeader}
          {resolvedPageIntro ? <Text style={styles.pageIntro}>{resolvedPageIntro}</Text> : null}
          <ScrollView
            ref={desktopScrollRef}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={keyboardInset > 0 ? { paddingBottom: keyboardInset + 24 } : undefined}
          >
            {questions}
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
  pageIntro: {
    marginHorizontal: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e4c94d",
    borderRadius: 8,
    color: "#5f4b00",
    backgroundColor: "#fff8cc",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  pageFooter: {
    marginHorizontal: 8,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#f0b4ae",
    borderRadius: 8,
    color: "#b42318",
    backgroundColor: "#fff1f0",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  navigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e4e7ec" },
  middleActions: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  iconButton: { width: 48, minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#98a2b3", borderRadius: 8, backgroundColor: "#ffffff" },
  primaryIconButton: { width: 48, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#1f6feb" },
  disabled: { opacity: 0.35 },
});

