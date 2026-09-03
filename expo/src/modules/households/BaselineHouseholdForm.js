/**
 * Composes the native baseline household interview, confirmation gate, and final preview flow.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Model } from "survey-core";

import { NativeSurveyRenderer } from "../../components/forms/NativeSurveyRenderer.js";
import { RendererLanguageSwitcher } from "../../components/forms/RendererLanguageSwitcher.js";
import { SectionNavigator } from "../../components/forms/SectionNavigator.js";
import { DisplayRenderer } from "../../components/forms/renderers/DisplayRenderer.js";
import { PreviewRenderer } from "../../components/forms/renderers/PreviewRenderer.js";
import { getNativeQuestionValue } from "../../components/forms/nativeSurveyModel.js";
import { applyHouseholdMasterChoices } from "../../lib/householdMasterChoices.js";
import {
  attachHouseholdSurveyBehaviors,
  refreshHouseholdSurveyBehaviors,
} from "../../lib/householdSurveyBehaviors.js";
import {
  COMPACT_PREVIEW_SECTION_NAME,
  HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME,
  buildSurveySections,
  goToSurveySection,
} from "../questionnaires/surveyNavigation.js";
import { buildHouseholdMemberSummaryRows } from "../questionnaires/householdMemberSummary.js";
import {
  getActiveQuestionnaireDraft,
  getQuestionnaireDraftById,
  markQuestionnaireDraftSubmitted,
  saveQuestionnaireDraft,
} from "../questionnaires/questionnaireDraftRepository.js";
import { getDraftSavedMessage } from "../questionnaires/draftSaveMessages.js";
import { saveQuestionnaireSubmission } from "../questionnaires/questionnaireSubmissionRepository.js";
import { getPreparedSurveyJson } from "../questionnaires/questionnaireSurveyJsonTransforms.js";
import { buildHhqPrefill, mergePrefillIntoBlankValues } from "../../lib/prefillMapper.js";
import { getHouseholdSync } from "../../lib/householdSync.js";
import { applyQuestionnaireLanguageFromLocale } from "../../lib/questionnaireLanguageField.js";
import { startTiming } from "../../lib/perfLog.js";
import { applyHhqTaskHouseholdPrefill } from "./hhqTaskPrefill.js";
import { buildHouseholdIdFromHhqData } from "./householdIds.js";
import { extractHouseholdRegistryFields } from "./householdRepository.js";

const AUTOSAVE_INTERVAL_MS = 30000;
const MAX_HHQ_VISIT_NO = 3;
const HOUSEHOLD_SCHEDULE_PAGE_NAME = "page_02_household_schedule";
const HOUSEHOLD_CHARACTERISTICS_PAGE_NAME = "page_03_household_characteristics";
const HOUSEHOLD_CONSENT_FIELD = "hhq_consent_study_provide_pis_explain_study_adult_member";
const HHQ_INTERVIEW_DATE_FIELD = "hhq_interview_date";
const HHQ_VISIT_NO_FIELD = "hhq_visit_no";
const HHQ_COMPETENT_RESPONDENT_FIELD = "hhq_competent_respondent_available";
const HHQ_REVISIT_NEEDED_MESSAGE = "Revisit Needed-fill the form again";
const HHQ_EXCLUDED_MESSAGE = "This household is excluded from the study";

function isEmptyDraftValue(value) {
  return value === undefined || value === null || value === "";
}

function cloneSurveyData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function isMeaningfulDraftValue(value) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(isMeaningfulDraftValue);
  if (typeof value === "object") return Object.values(value).some(isMeaningfulDraftValue);
  return true;
}

function countDraftAnswers(data) {
  return Object.values(data || {}).filter(isMeaningfulDraftValue).length;
}

function collectTopLevelSurveyData(model) {
  const data = {};
  const pages = model?.pages || [];
  for (const page of pages) {
    for (const question of page.questions || page.elements || []) {
      if (!question?.name || question.getType?.() === "html") continue;
      const value = getNativeQuestionValue(question);
      if (isMeaningfulDraftValue(value)) {
        data[question.name] = cloneSurveyData(value);
      }
    }
  }
  return data;
}

function hasQuestionOnPage(page, questionName) {
  if (!page || !questionName) return false;
  return (page.questions || page.elements || []).some((question) => {
    if (question?.name === questionName) return true;
    if (question?.getType?.() === "paneldynamic") {
      return (question.templateElements || question.template?.questions || []).some(
        (child) => child?.name === questionName,
      );
    }
    return false;
  });
}

function mergeModelDataIntoDraftSnapshot(snapshot, modelData, model, changedQuestionName, changedValue) {
  const next = {
    ...(snapshot || {}),
    ...(cloneSurveyData(modelData) || {}),
  };

  if (
    changedQuestionName &&
    isEmptyDraftValue(changedValue) &&
    hasQuestionOnPage(model?.currentPage, changedQuestionName)
  ) {
    delete next[changedQuestionName];
  }

  return next;
}

function applySurveyDataValues(model, data) {
  if (!model || !data || typeof data !== "object") return;
  const clonedData = cloneSurveyData(data);
  for (const [fieldName, value] of Object.entries(clonedData)) {
    if (fieldName && value !== undefined) {
      model.setValue(fieldName, value);
      const question = model.getQuestionByName?.(fieldName);
      if (question) {
        if (typeof question.data?.setValue === "function") {
          question.data.setValue(fieldName, value);
        }
        question.value = cloneSurveyData(value);
      }
    }
  }
  model.data = {
    ...(cloneSurveyData(model.data || {}) || {}),
    ...clonedData,
  };
  for (const [fieldName, value] of Object.entries(clonedData)) {
    const question = model.getQuestionByName?.(fieldName);
    if (question) question.value = cloneSurveyData(value);
  }
}

function hasDeclinedHouseholdConsent(model) {
  return Number(model.getValue(HOUSEHOLD_CONSENT_FIELD)) === 2;
}

function clampHhqVisitNo(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.min(MAX_HHQ_VISIT_NO, Math.max(1, Math.trunc(numericValue)));
}

function deriveHhqVisitNo(taskContext) {
  const failedAttemptCount = Number(taskContext?.failed_attempt_count);
  if (!Number.isFinite(failedAttemptCount)) return 1;
  return clampHhqVisitNo(failedAttemptCount + 1);
}

function applyHhqVisitNo(model, taskContext) {
  const question = model?.getQuestionByName?.(HHQ_VISIT_NO_FIELD);
  if (!question) return;
  const visitNo = deriveHhqVisitNo(taskContext);
  model.setValue(HHQ_VISIT_NO_FIELD, visitNo);
  question.readOnly = true;
  if (visitNo >= MAX_HHQ_VISIT_NO && Number(model.getValue(HHQ_COMPETENT_RESPONDENT_FIELD)) === 3) {
    model.setValue(HHQ_COMPETENT_RESPONDENT_FIELD, undefined);
  }
}

function getHhqTaskHousehold(taskContext) {
  const householdId = taskContext?.household_id || taskContext?.subject_id;
  if (!householdId) return null;
  return getHouseholdSync(householdId);
}

function getHhqDraftSubjectId(taskContext, selectedLocalityCode) {
  return taskContext?.household_id || taskContext?.subject_id || selectedLocalityCode || "unselected";
}

function applyHhqContextPrefill(model, taskContext) {
  const { prefill } = buildHhqPrefill(getHhqTaskHousehold(taskContext));
  for (const [fieldName, value] of Object.entries(prefill)) {
    if (value !== undefined && value !== null && value !== "") {
      model.setValue(fieldName, value);
    }
  }
  return prefill;
}

function isHhqAvailabilityStop(model) {
  const value = Number(model?.getValue?.(HHQ_COMPETENT_RESPONDENT_FIELD));
  return value === 2 || value === 3;
}

function getHhqAvailabilityStopMessage(model) {
  if (!isHhqAvailabilityStop(model)) return "";
  const visitNo = Number(model.getValue(HHQ_VISIT_NO_FIELD));
  const value = Number(model.getValue(HHQ_COMPETENT_RESPONDENT_FIELD));
  return visitNo >= MAX_HHQ_VISIT_NO && value === 2
    ? HHQ_EXCLUDED_MESSAGE
    : HHQ_REVISIT_NEEDED_MESSAGE;
}

function showHhqAvailabilityStopPopup(message) {
  if (!message) return;
  Alert.alert(message);
}

export function BaselineHouseholdForm({
  form,
  locale,
  onLocaleChange,
  user,
  localities,
  selectedLocalityCode,
  taskContext,
  preferredDraftId,
  onClose,
  onScrollOffsetChange,
  onSaved,
  onDraftSaved,
  onManualDraftSaved,
}) {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const [view, setView] = useState("form");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberSummaryConfirmed, setMemberSummaryConfirmed] = useState(false);
  const [memberChecklistStep, setMemberChecklistStep] = useState("a");
  const [previewSignature, setPreviewSignature] = useState("");
  const [finalReview, setFinalReview] = useState(false);
  const [sectionDrawerOpen, setSectionDrawerOpen] = useState(false);
  const [renderAnswerData, setRenderAnswerData] = useState({});
  const [draftLookup, setDraftLookup] = useState({ key: "", loading: true, draft: null });
  const [, setRevision] = useState(0);
  const memberSummaryConfirmedRef = useRef(false);
  const draftIdRef = useRef(null);
  const answerSnapshotRef = useRef({});
  const dirtyRef = useRef(false);
  const isRestoringDraftRef = useRef(false);
  const draftMutationVersionRef = useRef(0);
  const postRestoreDraftKeyRef = useRef(null);
  const draftLookupStartedKeyRef = useRef(null);
  const messageTimerRef = useRef(null);

  const draftContext = useMemo(() => ({
    formCode: form.form_code,
    formVersion: form.version,
    taskId: taskContext?.id || null,
    keyTaskId: null,
    subjectType: taskContext?.subject_type || (taskContext?.household_id ? "household" : "locality"),
    subjectId: getHhqDraftSubjectId(taskContext, selectedLocalityCode),
    deviceId: user?.device_id || "dev-device",
    userId: user?.user_id || user?.id || user?.username || "dev-user",
    preferredDraftId,
  }), [form, preferredDraftId, selectedLocalityCode, taskContext, user]);
  const draftLookupKey = useMemo(() => JSON.stringify({
    formCode: draftContext.formCode,
    formVersion: draftContext.formVersion,
    taskId: draftContext.taskId,
    subjectType: draftContext.subjectType,
    subjectId: draftContext.subjectId,
    deviceId: draftContext.deviceId,
    userId: draftContext.userId,
    preferredDraftId: draftContext.preferredDraftId || null,
  }), [draftContext]);

  const showTransientMessage = useCallback((text) => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setMessage(text);
    messageTimerRef.current = setTimeout(() => {
      setMessage("");
      messageTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => () => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
  }, []);

  useEffect(() => {
    // A locale change rerenders this screen, but must not restart the same
    // draft lookup or replace the loaded form with the loading screen.
    if (
      draftLookupStartedKeyRef.current === draftLookupKey &&
      draftLookup.key === draftLookupKey &&
      !draftLookup.loading
    ) {
      return undefined;
    }
    draftLookupStartedKeyRef.current = draftLookupKey;
    let cancelled = false;
    setDraftLookup({ key: draftLookupKey, loading: true, draft: null });

    async function loadInitialDraft() {
      try {
        const draft =
          (draftContext.preferredDraftId
            ? await getQuestionnaireDraftById(draftContext.preferredDraftId)
            : null) ||
          await getActiveQuestionnaireDraft(draftContext);
        if (!cancelled) {
          setDraftLookup({ key: draftLookupKey, loading: false, draft: draft || null });
        }
      } catch (error) {
        if (!cancelled) {
          setDraftLookup({ key: draftLookupKey, loading: false, draft: null });
          setMessage(`Could not restore draft: ${error.message}`);
        }
      }
    }

    loadInitialDraft();
    return () => {
      cancelled = true;
    };
  }, [draftContext, draftLookupKey]);

  const model = useMemo(() => {
    const endOpen = startTiming("form.open", { form: "HHQ" });
    const surveyJson = applyHouseholdMasterChoices(getPreparedSurveyJson(form), {
      user,
      localities,
    });
    const survey = new Model(surveyJson);
    survey.showCompletedPage = false;
    survey.checkErrorsMode = "onValueChanged";

    const availableSites = surveyJson.pages
      .flatMap((page) => page.elements)
      .find((element) => element.name === "hhq_site_id")?.choices || [];
    const availableLocalities = surveyJson.pages
      .flatMap((page) => page.elements)
      .find((element) => element.name === "hhq_locality_code")?.choices || [];
    if (availableSites.length === 1) survey.setValue("hhq_site_id", availableSites[0].value);
    const selectedLocality = availableLocalities.find(
      (choice) => String(choice.value) === String(selectedLocalityCode)
    );
    if (selectedLocality) survey.setValue("hhq_locality_code", selectedLocality.value);
    else if (availableLocalities.length === 1) {
      survey.setValue("hhq_locality_code", availableLocalities[0].value);
    }
    applyHhqContextPrefill(survey, taskContext);
    applyHhqTaskHouseholdPrefill(survey, taskContext);
    applyHhqVisitNo(survey, taskContext);

    const initialDraft = draftLookup.key === draftLookupKey && !draftLookup.loading
      ? draftLookup.draft
      : null;
    if (initialDraft) {
      draftIdRef.current = initialDraft.draft_id;
      isRestoringDraftRef.current = true;
      const restoredData = mergePrefillIntoBlankValues(
        { ...(survey.data || {}), ...(initialDraft.json_payload || {}) },
        buildHhqPrefill(getHhqTaskHousehold(taskContext)).prefill,
      );
      applySurveyDataValues(survey, restoredData);
      applyHhqTaskHouseholdPrefill(survey, taskContext);
      applyHhqVisitNo(survey, taskContext);
      answerSnapshotRef.current = cloneSurveyData(restoredData);
    } else {
      answerSnapshotRef.current = cloneSurveyData(survey.data || {});
    }

    attachHouseholdSurveyBehaviors(survey, form, undefined, {
      findExistingHousehold: null,
    });
    refreshHouseholdSurveyBehaviors(survey, form);
    answerSnapshotRef.current = mergeModelDataIntoDraftSnapshot(
      answerSnapshotRef.current,
      survey.data || {},
      survey,
    );
    dirtyRef.current = false;
    isRestoringDraftRef.current = false;
    survey.onValueChanged.add((sender, options) => {
      if (isRestoringDraftRef.current) return;
      dirtyRef.current = true;
      const nextSnapshot = mergeModelDataIntoDraftSnapshot(
        answerSnapshotRef.current,
        sender.data || {},
        sender,
        options.name,
        options.value,
      );
      answerSnapshotRef.current = nextSnapshot;
      setRenderAnswerData(cloneSurveyData(nextSnapshot) || {});
      setPreviewSignature("");
      if (options.name === HOUSEHOLD_CONSENT_FIELD) {
        const consentDeclined = Number(options.value) === 2;
        if (consentDeclined) {
          memberSummaryConfirmedRef.current = false;
          setMemberSummaryConfirmed(false);
          setFinalReview(false);
          setView("form");
          setSectionDrawerOpen(false);
          setMemberChecklistStep("a");
          setMessage("Consent declined. The interview ends after this section.");
          setTimeout(() => {
            const firstVisiblePageName = sender.firstVisiblePage?.name;
            if (firstVisiblePageName) goToSurveySection(sender, firstVisiblePageName);
            setRevision((value) => value + 1);
          }, 0);
        } else {
          setMessage((currentMessage) =>
            currentMessage === "Consent declined. The interview ends after this section."
              ? ""
              : currentMessage
          );
        }
      }
      if (
        options.name === "hhq_household_members" ||
        String(options.name || "").startsWith("member_")
      ) {
        memberSummaryConfirmedRef.current = false;
        setMemberSummaryConfirmed(false);
        setMemberChecklistStep("a");
      }
      if (options.name === HHQ_INTERVIEW_DATE_FIELD) {
        applyHhqVisitNo(sender, taskContext);
      }
      if (options.name === HHQ_COMPETENT_RESPONDENT_FIELD) {
        const stopMessage = getHhqAvailabilityStopMessage(sender);
        setMessage(stopMessage);
        showHhqAvailabilityStopPopup(stopMessage);
        if (isHhqAvailabilityStop(sender)) {
          memberSummaryConfirmedRef.current = false;
          setMemberSummaryConfirmed(false);
          setFinalReview(false);
          setView("form");
          setSectionDrawerOpen(false);
        }
      }
      setRevision((value) => value + 1);
      setTimeout(() => setRevision((value) => value + 1), 250);
    });
    survey.onCurrentPageChanging.add((sender, options) => {
      if (
        !hasDeclinedHouseholdConsent(sender) &&
        options.oldCurrentPage?.name === HOUSEHOLD_SCHEDULE_PAGE_NAME &&
        options.newCurrentPage?.name === HOUSEHOLD_CHARACTERISTICS_PAGE_NAME &&
        !memberSummaryConfirmedRef.current
      ) {
        options.allow = false;
        setView("member-summary");
        setMessage("Confirm the household roster before Section 03.");
      }
    });
    survey.onCurrentPageChanged.add(() => setRevision((value) => value + 1));
    endOpen({ questions: survey.getAllQuestions().length });
    return survey;
  }, [draftLookup, draftLookupKey, form, user, localities, selectedLocalityCode, taskContext]);

  useEffect(() => {
    model.locale = locale;
    // "Language of questionnaire" is recorded from the switcher, not asked.
    if (applyQuestionnaireLanguageFromLocale(model, locale)) {
      answerSnapshotRef.current = cloneSurveyData(model.data || {});
    }
    setRenderAnswerData(cloneSurveyData(answerSnapshotRef.current || model.data || {}) || {});
    setRevision((value) => value + 1);
  }, [model, locale]);

  useEffect(() => {
    if (draftLookup.key !== draftLookupKey || draftLookup.loading || !draftLookup.draft) return;
    const restoreKey = `${draftLookupKey}:${draftLookup.draft.draft_id}`;
    const firstRestorePass = postRestoreDraftKeyRef.current !== restoreKey;

    if (firstRestorePass) {
      postRestoreDraftKeyRef.current = restoreKey;
      const draftLocale = draftLookup.draft.completion_state?.locale;
      if (draftLocale && draftLocale !== locale) {
        onLocaleChange?.(draftLocale);
      }

      const consentDeclined = hasDeclinedHouseholdConsent(model);
      if (consentDeclined) {
        const firstVisiblePageName = model.firstVisiblePage?.name;
        if (firstVisiblePageName) goToSurveySection(model, firstVisiblePageName);
        setView("form");
        setFinalReview(false);
        setMessage("Consent declined. The interview ends after this section.");
      } else {
        if (draftLookup.draft.completion_state?.currentPageName) {
          goToSurveySection(model, draftLookup.draft.completion_state.currentPageName);
        }
        showTransientMessage(`Draft restored from this device (${countDraftAnswers(answerSnapshotRef.current)} answers).`);
      }

      memberSummaryConfirmedRef.current = consentDeclined
        ? false
        : Boolean(draftLookup.draft.completion_state?.memberSummaryConfirmed);
      setMemberSummaryConfirmed(memberSummaryConfirmedRef.current);
    }
    dirtyRef.current = false;
    setRenderAnswerData(cloneSurveyData(answerSnapshotRef.current || model.data || {}) || {});
    setRevision((value) => value + 1);
  }, [draftLookup, draftLookupKey, model, onLocaleChange, showTransientMessage]);

  const saveDraft = useCallback(async ({ silent = false, manual = false } = {}) => {
    try {
      if (isRestoringDraftRef.current) return null;
      draftMutationVersionRef.current += 1;
      applyHhqVisitNo(model, taskContext);
      refreshHouseholdSurveyBehaviors(model, form);
      const liveData = {
        ...(model.data || {}),
        ...collectTopLevelSurveyData(model),
      };
      const payload = mergeModelDataIntoDraftSnapshot(answerSnapshotRef.current, liveData, model);
      const householdId = buildHouseholdIdFromHhqData(payload);
      if (householdId) {
        payload.hhq_household_id = householdId;
      }
      answerSnapshotRef.current = cloneSurveyData(payload);
      setRenderAnswerData(cloneSurveyData(payload) || {});
      const savedAnswerCount = countDraftAnswers(payload);
      const endSave = startTiming("draft.save", { form: "HHQ", manual });
      const draft = await saveQuestionnaireDraft({
        ...draftContext,
        draftId: draftIdRef.current,
        payload,
        completionState: {
          currentPageName: model.currentPage?.name || null,
          memberSummaryConfirmed: memberSummaryConfirmedRef.current,
          locale,
        },
      });
      endSave({ answers: savedAnswerCount });
      draftIdRef.current = draft.draft_id;
      dirtyRef.current = false;
      if (!silent) {
        onDraftSaved?.();
        const savedMessage = getDraftSavedMessage(locale);
        showTransientMessage(savedMessage);
        if (manual) {
          Alert.alert(savedMessage, `${savedAnswerCount} answer fields saved on this device.`, [
            {
              text: "OK",
              onPress: () => onManualDraftSaved?.(),
            },
          ]);
        }
      }
      return draft;
    } catch (error) {
      setMessage(`Could not save draft: ${error.message}`);
      return null;
    }
  }, [draftContext, form, locale, model, onDraftSaved, onManualDraftSaved, showTransientMessage, taskContext]);

  // Keep every hook unconditional. The draft-loading screen below is a
  // render state, not a separate hook path; declaring this before the early
  // return prevents React's hook order crash while the draft is restored.
  const rendererAnswerData = useMemo(
    () => ({
      ...(renderAnswerData || {}),
      ...(answerSnapshotRef.current || {}),
    }),
    [renderAnswerData],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      if (dirtyRef.current) saveDraft({ silent: true });
    }, AUTOSAVE_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && dirtyRef.current) saveDraft({ silent: true });
    });
    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
      if (dirtyRef.current) saveDraft({ silent: true });
    };
  }, [saveDraft]);

  if (draftLookup.key !== draftLookupKey || draftLookup.loading) {
    return (
      <View style={styles.window}>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <Text numberOfLines={1} style={[styles.title, compact && styles.titleCompact]}>
            Baseline Household Questionnaire
          </Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.message}>Loading saved draft from this device...</Text>
        </View>
      </View>
    );
  }

  const signature = JSON.stringify(model.data || {});
  const sections = buildSurveySections(model, {
    includeHouseholdMemberSummary: true,
    includeCompactPreview: true,
    currentSectionName:
      view === "member-summary"
        ? HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME
        : view === "preview"
          ? COMPACT_PREVIEW_SECTION_NAME
          : null,
    householdMemberSummaryConfirmed: memberSummaryConfirmed,
    compactPreviewConfirmed: previewSignature === signature,
  });
  const memberRows = buildHouseholdMemberSummaryRows(model.data || {}, form, locale);
  const previewHouseholdId =
    taskContext?.household_id || buildHouseholdIdFromHhqData(model.data || {});

  async function openPreview({ final = false } = {}) {
    applyHhqVisitNo(model, taskContext);
    refreshHouseholdSurveyBehaviors(model, form);
    if (!(await saveDraft({ silent: true }))) return;
    setPreviewSignature(JSON.stringify(model.data || {}));
    setFinalReview(final);
    setView("preview");
    setMessage(final ? "Review all entered data before final save." : "Previewing data entered so far.");
  }

  async function openMemberSummary() {
    if (hasDeclinedHouseholdConsent(model)) return;
    applyHhqVisitNo(model, taskContext);
    refreshHouseholdSurveyBehaviors(model, form);
    await saveDraft({ silent: true });
    setFinalReview(false);
    setView("member-summary");
    setMemberChecklistStep("a");
    setMessage("Confirm the household roster before Section 03.");
  }

  function validateSchedule() {
    applyHhqVisitNo(model, taskContext);
    refreshHouseholdSurveyBehaviors(model, form);
    const page = model.getPageByName(HOUSEHOLD_SCHEDULE_PAGE_NAME);
    const questions = page?.getAllQuestions?.().filter(
      (question) => question.isVisible !== false && question.getType?.() !== "html"
    ) || [];
    const results = questions.map((question) => question.validate?.() !== false);
    refreshHouseholdSurveyBehaviors(model, form);
    return results.every(Boolean) && !questions.some((question) => question.errors?.length);
  }

  async function confirmMemberSummary() {
    if (!validateSchedule()) {
      goToSurveySection(model, HOUSEHOLD_SCHEDULE_PAGE_NAME);
      setView("form");
      setMessage("Complete the highlighted household roster fields before confirming.");
      setRevision((value) => value + 1);
      return;
    }
    memberSummaryConfirmedRef.current = true;
    setMemberSummaryConfirmed(true);
    goToSurveySection(model, HOUSEHOLD_CHARACTERISTICS_PAGE_NAME);
    setView("form");
    setMessage("Household roster confirmed.");
    setRevision((value) => value + 1);
    await saveDraft({ silent: true });
  }

  async function requestAdditionalHouseholdMember(reason) {
    const roster = model.getQuestionByName?.("hhq_household_members");
    if (roster) {
      roster.dynamicAddRequestToken = Date.now();
    }
    memberSummaryConfirmedRef.current = false;
    setMemberSummaryConfirmed(false);
    setMemberChecklistStep("a");
    goToSurveySection(model, HOUSEHOLD_SCHEDULE_PAGE_NAME);
    setView("form");
    setMessage(reason);
    setRevision((value) => value + 1);
    await saveDraft({ silent: true });
  }

  function continueToChecklistB() {
    setMemberChecklistStep("b");
    setMessage("");
  }

  async function handleSectionSelect(section) {
    if (!section.applicable) return;
    if (section.name === HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME) {
      await openMemberSummary();
      return;
    }
    if (section.name === COMPACT_PREVIEW_SECTION_NAME) {
      await openPreview();
      return;
    }
    if (
      section.name === HOUSEHOLD_CHARACTERISTICS_PAGE_NAME &&
      !memberSummaryConfirmedRef.current
    ) {
      await openMemberSummary();
      return;
    }
    goToSurveySection(model, section.name);
    setView("form");
    setMessage("");
    setFinalReview(false);
    setRevision((value) => value + 1);
    await saveDraft({ silent: true });
  }

  function closePreview() {
    setView("form");
    setMessage("");
    setFinalReview(false);
  }

  async function requestFinalReview() {
    applyHhqVisitNo(model, taskContext);
    refreshHouseholdSurveyBehaviors(model, form);
    const availabilityStop = isHhqAvailabilityStop(model);
    if (!availabilityStop && !hasDeclinedHouseholdConsent(model) && !memberSummaryConfirmedRef.current) {
      await openMemberSummary();
      return;
    }
    if (!model.validate()) {
      const firstError = model.getAllQuestions().find((question) => question.errors?.length);
      if (firstError?.page?.name) goToSurveySection(model, firstError.page.name);
      setView("form");
      setMessage("Complete the highlighted required fields before final review.");
      setRevision((value) => value + 1);
      return;
    }
    await openPreview({ final: true });
  }

  async function submitFinal() {
    if (previewSignature !== JSON.stringify(model.data || {})) {
      setMessage("Answers changed after preview. Generate the preview again.");
      setView("form");
      return;
    }
    setSaving(true);
    try {
      if (!(await saveDraft({ silent: true }))) return;
      applyHhqVisitNo(model, taskContext);
      if (!model.validate()) {
        setView("form");
        setMessage("Complete the highlighted required fields before final save.");
        return;
      }
      const availabilityStop = isHhqAvailabilityStop(model);
      const registryRecord = extractHouseholdRegistryFields(model.data);
      const submission = await saveQuestionnaireSubmission({
        formCode: form.form_code,
        formVersion: form.version,
        payload: model.data,
        taskContext,
        deviceId: user?.device_id || "dev-device",
      });
      if (draftIdRef.current) {
        await markQuestionnaireDraftSubmitted({
          draftId: draftIdRef.current,
          submittedFormResponseId: submission.submission_id,
        });
        onDraftSaved?.();
      }
      setMessage(availabilityStop ? getHhqAvailabilityStopMessage(model) : `Saved household ${registryRecord.household_id}`);
      await onSaved?.(registryRecord);
    } catch (error) {
      setMessage(`Could not save household: ${error.message}`);
      setView("form");
    } finally {
      setSaving(false);
    }
  }

  async function closeForm() {
    if (dirtyRef.current && !(await saveDraft({ silent: true }))) return;
    onClose?.();
  }

  return (
    <View style={styles.window}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <Pressable
          accessibilityLabel="Open sections"
          onPress={() => setSectionDrawerOpen(true)}
          style={styles.headerIconButton}
        >
          <MaterialCommunityIcons color="#344054" name="format-list-bulleted-square" size={23} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, compact && styles.titleCompact]}>
          Baseline Household Questionnaire
        </Text>
        {!compact ? (
          <View style={styles.wideLanguage}>
            <RendererLanguageSwitcher locale={locale} onChange={onLocaleChange} />
          </View>
        ) : null}
        <Pressable accessibilityLabel="Close questionnaire" onPress={closeForm} style={styles.headerIconButton}>
          <MaterialCommunityIcons color="#d92d20" name="close-circle" size={25} />
        </Pressable>
      </View>
      <View style={styles.body}>
        {compact ? (
          <View pointerEvents="box-none" style={styles.languageOverlay}>
            <RendererLanguageSwitcher iconOnly locale={locale} onChange={onLocaleChange} />
          </View>
        ) : null}
        {view === "form" ? (
          <NativeSurveyRenderer
            answerData={rendererAnswerData}
            model={model}
            notice={message}
            onPreviewRequested={() => openPreview()}
            onScrollOffsetChange={onScrollOffsetChange}
            sections={sections}
            sectionDrawerOpen={sectionDrawerOpen}
            onSectionDrawerOpenChange={setSectionDrawerOpen}
            onSectionSelect={handleSectionSelect}
            onCompleteRequested={requestFinalReview}
            onSaveDraft={saveDraft}
          />
        ) : (
          <>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <SectionNavigator
              drawerOpen={sectionDrawerOpen}
              onDrawerOpenChange={setSectionDrawerOpen}
              onSelect={handleSectionSelect}
              sections={sections}
              showCompactTrigger={false}
            />
            {view === "member-summary" ? (
              <View style={styles.specialView}>
                <DisplayRenderer
                  title="02B-Household Member Summary"
                  subtitle={`${memberRows.length} ${memberRows.length === 1 ? "member" : "members"} added. Confirm name, age, and sex before check listing.`}
                  rows={memberRows}
                  columns={[
                    { key: "sr", title: "Count", width: 54 },
                    { key: "memberName", title: "Name", width: 110 },
                    { key: "age", title: "Age", width: 42 },
                    { key: "sex", title: "Sex", width: 70 },
                  ]}
                />
                {memberRows.length ? (
                  <View style={styles.checkListingCard}>
                    <Text style={styles.checkListingCode}>CHECK LISTING</Text>
                    <Text style={styles.checkListingTitle}>
                      Just to make sure that I have a complete household listing.
                    </Text>
                    {memberChecklistStep === "a" ? (
                      <>
                        <Text style={styles.checkListingQuestion}>
                          A) Are there any other persons such as small children or infants that we have not listed?
                        </Text>
                        <View style={styles.checkListingActions}>
                          <Pressable
                            onPress={() => requestAdditionalHouseholdMember("Add the missing small child or infant, then review the listing again.")}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Yes, add member</Text>
                          </Pressable>
                          <Pressable onPress={continueToChecklistB} style={styles.primaryButton}>
                            <Text style={styles.primaryButtonText}>No</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={styles.checkListingQuestion}>
                          B) Are there other people who may not be members of your family such as domestic servants, lodgers or friends who usually live here?
                        </Text>
                        <View style={styles.checkListingActions}>
                          <Pressable
                            onPress={() => requestAdditionalHouseholdMember("Add the other usual resident, then review the listing again.")}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Yes, add member</Text>
                          </Pressable>
                          <Pressable onPress={confirmMemberSummary} style={styles.primaryButton}>
                            <Text style={styles.primaryButtonText}>No, go to Section 3</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ) : (
                  <View style={styles.checkListingCard}>
                    <Text style={styles.checkListingTitle}>Add at least one household member before continuing.</Text>
                  </View>
                )}
                <View style={styles.footerActions}>
                  <Pressable onPress={() => { goToSurveySection(model, HOUSEHOLD_SCHEDULE_PAGE_NAME); setView("form"); }} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Edit roster</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.specialView}>
                {finalReview && previewHouseholdId ? (
                  <View style={styles.reviewHouseholdBanner}>
                    <Text style={styles.reviewHouseholdLabel}>Household ID</Text>
                    <Text style={styles.reviewHouseholdValue}>{previewHouseholdId}</Text>
                  </View>
                ) : null}
                <PreviewRenderer model={model} />
                <View style={styles.footerActions}>
                  <Pressable onPress={closePreview} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Edit form</Text>
                  </Pressable>
                  {finalReview ? (
                    <Pressable disabled={saving} onPress={submitFinal} style={[styles.primaryButton, saving && styles.disabled]}>
                      <Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Confirm & Save"}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, backgroundColor: "#eef2f5" },
  header: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#d8dee4", backgroundColor: "#ffffff" },
  headerCompact: { minHeight: 56, paddingVertical: 6 },
  headerIconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#ffffff" },
  title: { flex: 1, color: "#18202a", fontSize: 18, fontWeight: "800", textAlign: "center" },
  titleCompact: { fontSize: 15 },
  wideLanguage: { width: 260 },
  body: { flex: 1, position: "relative", gap: 10, padding: 12 },
  languageOverlay: { position: "absolute", top: 2, right: 12, zIndex: 5, elevation: 5 },
  message: { padding: 9, borderRadius: 7, color: "#1f4d7a", backgroundColor: "#eef6ff", fontSize: 13, fontWeight: "700" },
  specialView: { flex: 1, gap: 10, minHeight: 0 },
  reviewHouseholdBanner: { gap: 2, padding: 12, borderWidth: 1, borderColor: "#b9d6f2", borderRadius: 8, backgroundColor: "#f4f9ff" },
  reviewHouseholdLabel: { color: "#475467", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  reviewHouseholdValue: { color: "#18202a", fontSize: 20, fontWeight: "800" },
  footerActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, paddingTop: 8 },
  checkListingCard: { gap: 10, padding: 12, borderWidth: 1, borderColor: "#c7d7ea", borderRadius: 8, backgroundColor: "#ffffff" },
  checkListingCode: { color: "#1f4d7a", fontSize: 12, fontWeight: "900", letterSpacing: 0, textTransform: "uppercase" },
  checkListingTitle: { color: "#18202a", fontSize: 15, fontWeight: "800" },
  checkListingQuestion: { color: "#344054", fontSize: 14, fontWeight: "700", lineHeight: 20 },
  checkListingActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  primaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#1f6feb" },
  primaryButtonText: { color: "#ffffff", fontWeight: "800" },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  secondaryButtonText: { color: "#18202a", fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
