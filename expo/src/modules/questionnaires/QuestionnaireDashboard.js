import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Model } from "survey-core";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { NativeSurveyRenderer } from "../../components/forms/NativeSurveyRenderer.js";
import { RendererLanguageSwitcher } from "../../components/forms/RendererLanguageSwitcher.js";
import { PreviewRenderer } from "../../components/forms/renderers/PreviewRenderer.js";
import { getRuntimeFormByCode } from "../../data/runtimeFormCatalog";
import { ROUTES, navigateTo } from "../../navigation/routes";
import {
  listQuestionnaireSubmissions,
  saveQuestionnaireSubmission,
} from "./questionnaireSubmissionRepository";
import {
  getActiveQuestionnaireDraft,
  markQuestionnaireDraftSubmitted,
  saveQuestionnaireDraft,
} from "./questionnaireDraftRepository";
import {
  COMPACT_PREVIEW_SECTION_NAME,
  HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME,
  buildSurveySections,
  calculateSurveyProgress,
  goToSurveySection,
} from "./surveyNavigation";
import {
  attachHouseholdSurveyBehaviors,
  refreshHouseholdSurveyBehaviors,
} from "../../lib/householdSurveyBehaviors.js";
import { buildHouseholdMemberSummaryRows } from "./householdMemberSummary";
import {
  normalizeQuestionnaireSurveyData,
  prepareQuestionnaireSurveyJson,
} from "./questionnaireSurveyJsonTransforms";
import { applyReadOnlyFields } from "./questionnaireReadOnlyFields.js";
import { mergePrefillIntoBlankValues } from "../../lib/prefillMapper.js";
import { listHouseholdMembers } from "../households/householdRepository.js";
import { getDraftSavedMessage } from "./draftSaveMessages.js";
import {
  WQ_CURRENT_MARITAL_STATUS_FIELD,
  applyWqPregnancyHistoryCalculations,
  applyWqPregnancyTrackingEligibility,
  applyWqReproductionSummary,
  buildWqHusbandPartnerChoices,
  shouldRecalculateWqPregnancyHistory,
  shouldRecalculateWqPregnancyTrackingEligibility,
  shouldRecalculateWqReproductionSummary,
} from "../../lib/womanSurveyBehaviors.js";

const AUTOSAVE_INTERVAL_MS = 30000;
const HOUSEHOLD_SCHEDULE_PAGE_NAME = "page_02_household_schedule";
const HOUSEHOLD_CHARACTERISTICS_PAGE_NAME = "page_03_household_characteristics";
const MAX_WQ_VISIT_NO = 3;
const WQ_VISIT_NO_FIELD = "wq_visit_no";
const WQ_INTERVIEW_DATE_FIELD = "wq_interview_date";
const WQ_WOMAN_AVAILABLE_FIELD = "wq_woman_available";
const WQ_RESULT_INTERVIEW_FIELD = "wq_result_interview";
const WQ_OUTCOME_PAGE_NAME = "page_outcome";
const WQ_HUSBAND_PARTNER_NAME_FIELD = "wq_husband_partner_name";
const WQ_HUSBAND_PARTNER_LINE_NUMBER_FIELD = "wq_husband_partner_line_number";
const WQ_RESCHEDULE_MESSAGE = "Reschedule has been setup";
const WQ_EXCLUDED_MESSAGE = "This women is excluded from the study";

function isHouseholdQuestionnaire(form) {
  return String(form?.form_code || "").toUpperCase() === "HHQ";
}

function isWomanQuestionnaire(form) {
  return String(form?.form_code || "").toUpperCase() === "WQ";
}

function clampWqVisitNo(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.min(MAX_WQ_VISIT_NO, Math.max(1, Math.trunc(numericValue)));
}

function deriveWqVisitNo(taskContext) {
  const failedAttemptCount = Number(taskContext?.failed_attempt_count);
  if (!Number.isFinite(failedAttemptCount)) return 1;
  return clampWqVisitNo(failedAttemptCount + 1);
}

function applyWqVisitNo(model, taskContext) {
  const question = model?.getQuestionByName?.(WQ_VISIT_NO_FIELD);
  if (!question) return;
  const visitNo = deriveWqVisitNo(taskContext);
  model.setValue(WQ_VISIT_NO_FIELD, visitNo);
  question.readOnly = true;
  if (visitNo >= MAX_WQ_VISIT_NO && Number(model.getValue(WQ_WOMAN_AVAILABLE_FIELD)) === 3) {
    model.setValue(WQ_WOMAN_AVAILABLE_FIELD, undefined);
  }
}

function isWqRevisitStop(model) {
  const value = Number(model?.getValue?.(WQ_WOMAN_AVAILABLE_FIELD));
  return value === 3 || value === 4;
}

function getWqRevisitStopMessage(model) {
  if (!isWqRevisitStop(model)) return "";
  const visitNo = Number(model.getValue(WQ_VISIT_NO_FIELD));
  return visitNo >= MAX_WQ_VISIT_NO ? WQ_EXCLUDED_MESSAGE : WQ_RESCHEDULE_MESSAGE;
}

const WQ_CONSENT_FIELD = "wq_consent_study";
const WQ_CONSENT_NO_VALUE = 2;
const WQ_NEVER_MARRIED_VALUE = 7;
const WQ_OUTCOME_COMPLETED_VALUE = 1;
const WQ_OUTCOME_REFUSED_CONSENT_VALUE = 8;
const WQ_STOP_OUTCOME_BY_AVAILABILITY = { 2: 6, 3: 3, 4: 2 };
const WQ_EVER_GIVEN_BIRTH_FIELD = "wq_02_reproduction_now_i_would_like_to_ask_about_all_the_birt";
const WQ_EVER_GIVEN_BIRTH_NO = 2;
const WQ_BORN_ALIVE_LATER_DIED_FIELD = "wq_02_reproduction_have_you_ever_given_birth_to_a_boy_or_girl";
const WQ_STOP_MESSAGES = {
  2: "Interview stopped. Complete the outcome before final save.",
  3: "Visit postponed. Complete the outcome before final save.",
  4: "Woman not at home. Complete the outcome before final save.",
};
const WQ_CONSENT_STOP_MESSAGE =
  "Consent not provided. Complete the outcome before final save.";

function forcedWqOutcomeFor(availability, consent, marital) {
  const stopOutcome = WQ_STOP_OUTCOME_BY_AVAILABILITY[availability];
  if (stopOutcome !== undefined) return stopOutcome;
  if (consent === WQ_CONSENT_NO_VALUE) return WQ_OUTCOME_REFUSED_CONSENT_VALUE;
  // Never-married stops the questionnaire but the interview itself completed;
  // follow-up/revisit workflow is decided server-side by the task workflow.
  if (marital === WQ_NEVER_MARRIED_VALUE) return WQ_OUTCOME_COMPLETED_VALUE;
  return undefined;
}

function routeWqStopToOutcome(model, { navigate = true } = {}) {
  if (!model) return;
  const forcedOutcome = forcedWqOutcomeFor(
    Number(model.getValue(WQ_WOMAN_AVAILABLE_FIELD)),
    Number(model.getValue(WQ_CONSENT_FIELD)),
    Number(model.getValue(WQ_CURRENT_MARITAL_STATUS_FIELD)),
  );
  if (forcedOutcome === undefined) return;
  model.setValue(WQ_RESULT_INTERVIEW_FIELD, forcedOutcome);
  if (!navigate) return;
  const outcomePage = model.getPageByName?.(WQ_OUTCOME_PAGE_NAME);
  if (outcomePage?.isVisible) {
    goToSurveySection(model, WQ_OUTCOME_PAGE_NAME);
  }
}

// When a stop answer (availability stop, consent refusal, or never married)
// changes back to a continue answer, the outcome it forced must not linger as
// a stale pre-selection on the outcome page.
function clearStaleWqForcedOutcome(model, changedName, oldValue) {
  if (!model) return;
  const previousForced = forcedWqOutcomeFor(
    changedName === WQ_WOMAN_AVAILABLE_FIELD
      ? Number(oldValue)
      : Number(model.getValue(WQ_WOMAN_AVAILABLE_FIELD)),
    changedName === WQ_CONSENT_FIELD
      ? Number(oldValue)
      : Number(model.getValue(WQ_CONSENT_FIELD)),
    changedName === WQ_CURRENT_MARITAL_STATUS_FIELD
      ? Number(oldValue)
      : Number(model.getValue(WQ_CURRENT_MARITAL_STATUS_FIELD)),
  );
  if (previousForced === undefined) return;
  const currentForced = forcedWqOutcomeFor(
    Number(model.getValue(WQ_WOMAN_AVAILABLE_FIELD)),
    Number(model.getValue(WQ_CONSENT_FIELD)),
    Number(model.getValue(WQ_CURRENT_MARITAL_STATUS_FIELD)),
  );
  if (currentForced !== undefined) return;
  if (Number(model.getValue(WQ_RESULT_INTERVIEW_FIELD)) === previousForced) {
    model.setValue(WQ_RESULT_INTERVIEW_FIELD, undefined);
  }
}

function deriveHouseholdIdFromTask(taskContext, prefillData) {
  const directId =
    taskContext?.household_id ||
    taskContext?.payload?.household_id ||
    prefillData?.household_id ||
    prefillData?.hhq_household_id;
  if (directId) return String(directId);
  const subjectId = taskContext?.subject_id || taskContext?.woman_id;
  const parts = String(subjectId || "").split("-");
  if (parts.length >= 5) return parts.slice(0, 4).join("-");
  return "";
}

function deriveCurrentWomanIdFromTask(taskContext, prefillData) {
  return String(
    taskContext?.subject_id ||
      taskContext?.woman_id ||
      taskContext?.payload?.woman_id ||
      taskContext?.payload?.subject_id ||
      prefillData?.wq_enter_structure_id_woman ||
      ""
  );
}

function applyWqHusbandPartnerChoices(model, members, taskContext, prefillData) {
  const question = model?.getQuestionByName?.(WQ_HUSBAND_PARTNER_NAME_FIELD);
  if (!question) return;
  question.householdMemberChoices = buildWqHusbandPartnerChoices(members, {
    currentWomanId: deriveCurrentWomanIdFromTask(taskContext, prefillData),
  });
  question.husbandPartnerLineNumberField = WQ_HUSBAND_PARTNER_LINE_NUMBER_FIELD;
}

function getDataSignature(data) {
  return JSON.stringify(data || {});
}

export function QuestionnaireDashboard({
  formCode,
  locale,
  mode,
  onLocaleChange,
  taskContext,
  prefillData,
  readOnlyFields,
  user,
  allowNewResponse = false,
  onDraftSaved,
}) {
  const [submissions, setSubmissions] = useState([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeLocale, setActiveLocale] = useState(locale || "default");
  const [sections, setSections] = useState([]);
  const [progress, setProgress] = useState({ answered: 0, total: 0, percent: 0 });
  const [rendererAnswerData, setRendererAnswerData] = useState({});
  const [draftId, setDraftId] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [memberSummaryOpen, setMemberSummaryOpen] = useState(false);
  const [memberSummaryConfirmed, setMemberSummaryConfirmed] = useState(false);
  const [sectionDrawerOpen, setSectionDrawerOpen] = useState(false);
  const { width } = useWindowDimensions();
  const compact = Platform.OS !== "web" || width < 700;
  const form = getRuntimeFormByCode(formCode);
  const showForm = mode === "new";
  const draftIdRef = useRef(null);
  const restoredDraftKeyRef = useRef(null);
  const dirtyRef = useRef(false);
  const hasPreviewedRef = useRef(false);
  const previewSignatureRef = useRef("");
  const memberSummaryConfirmedRef = useRef(false);
  const surveyRef = useRef(null);
  const answerSnapshotRef = useRef({});
  const rendererRef = useRef(null);

  useEffect(() => {
    if (!showForm) {
      setActiveLocale(locale || "default");
    }
  }, [locale, showForm]);

  const changeFormLocale = useCallback(
    (nextLocale) => {
      const normalizedLocale = nextLocale || "default";
      setActiveLocale(normalizedLocale);
      requestAnimationFrame(() => {
        onLocaleChange?.(normalizedLocale);
      });
    },
    [onLocaleChange],
  );

  const refreshSubmissions = async () => {
    setSubmissions(await listQuestionnaireSubmissions(formCode));
  };

  useEffect(() => {
    refreshSubmissions();
  }, [formCode]);

  const draftContext = useMemo(() => {
    if (!form) return null;
    return {
      formCode: form.form_code,
      formVersion: form.version,
      taskId: taskContext?.id,
      subjectType: taskContext?.subject_type,
      subjectId: taskContext?.subject_id,
      deviceId: user?.device_id || "dev-device",
      userId: user?.user_id || user?.id || user?.username || "dev-user",
    };
  }, [form, taskContext, user]);

  function updateSurveyStatus(model) {
    const nextData = { ...(model?.data || {}) };
    answerSnapshotRef.current = nextData;
    setRendererAnswerData(nextData);
    setSections(buildSurveySections(model));
    setProgress(calculateSurveyProgress(model));
  }

  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
    hasPreviewedRef.current = false;
    setPreviewConfirmed(false);
    memberSummaryConfirmedRef.current = false;
    setMemberSummaryConfirmed(false);
  }

  async function saveDraftFromModel(model, { silent = false, manual = false } = {}) {
    if (!model || !draftContext) return null;
    const payload = {
      ...(answerSnapshotRef.current || {}),
      ...(model.data || {}),
    };
    answerSnapshotRef.current = payload;
    setRendererAnswerData(payload);
    const draft = await saveQuestionnaireDraft({
      ...draftContext,
      draftId: draftIdRef.current,
      payload,
      completionState: {
        currentPageName: model.currentPage?.name || null,
      },
    });
    draftIdRef.current = draft.draft_id;
    setDraftId(draft.draft_id);
    setLastSavedAt(draft.updated_at);
    dirtyRef.current = false;
    setDirty(false);
    if (!silent) {
      onDraftSaved?.();
      const savedMessage = getDraftSavedMessage(activeLocale);
      setSaveMessage(savedMessage);
      if (manual) {
        Alert.alert(savedMessage, "", [
          {
            text: "OK",
            onPress: () => navigateTo(ROUTES.worklist, { replace: true }),
          },
        ]);
      }
    }
    return draft;
  }

  async function openPreviewFromModel(model) {
    if (!model) return;
    await saveDraftFromModel(model, { silent: true });
    setPreviewOpen(true);
    setMemberSummaryOpen(false);
    setSectionDrawerOpen(false);
    hasPreviewedRef.current = true;
    setPreviewConfirmed(true);
    previewSignatureRef.current = getDataSignature(model.data);
    updateSurveyStatus(model);
    setSaveMessage("Preview generated from the saved local draft");
  }

  function openMemberSummaryFromModel(model) {
    if (!model || !isHouseholdQuestionnaire(form)) return;
    refreshHouseholdSurveyBehaviors(model, form);
    setPreviewOpen(false);
    setSectionDrawerOpen(false);
    setMemberSummaryOpen(true);
    updateSurveyStatus(model);
    setSaveMessage("Confirm household member summary before Section 03");
  }

  async function confirmMemberSummary(model) {
    if (!model) return;
    refreshHouseholdSurveyBehaviors(model, form);
    memberSummaryConfirmedRef.current = true;
    setMemberSummaryConfirmed(true);
    setMemberSummaryOpen(false);
    setSectionDrawerOpen(false);
    await saveDraftFromModel(model, { silent: true });
    goToSurveySection(model, HOUSEHOLD_CHARACTERISTICS_PAGE_NAME);
    updateSurveyStatus(model);
  }

  function goBackFromMemberSummary(model) {
    setMemberSummaryOpen(false);
    if (model) {
      goToSurveySection(model, HOUSEHOLD_SCHEDULE_PAGE_NAME);
      updateSurveyStatus(model);
    }
  }

  function handleSectionNavPress(model, sectionName) {
    if (!model) return;
    if (sectionName === COMPACT_PREVIEW_SECTION_NAME) {
      openPreviewFromModel(model);
      return;
    }
    if (sectionName === HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME) {
      openMemberSummaryFromModel(model);
      return;
    }
    if (
      isHouseholdQuestionnaire(form) &&
      sectionName === HOUSEHOLD_CHARACTERISTICS_PAGE_NAME &&
      !memberSummaryConfirmedRef.current
    ) {
      openMemberSummaryFromModel(model);
      return;
    }
    goToSurveySection(model, sectionName);
    setPreviewOpen(false);
    setMemberSummaryOpen(false);
    setSectionDrawerOpen(false);
    updateSurveyStatus(model);
  }

  async function handleCloseForm(model) {
    if (model && dirtyRef.current) {
      await saveDraftFromModel(model, { silent: true });
    }
    navigateTo(ROUTES.worklist, { replace: true });
  }

  const survey = useMemo(() => {
    if (!showForm || !form) return null;
    const surveyJson = prepareQuestionnaireSurveyJson(form);
    const model = new Model(surveyJson);
    model.showCompletedPage = false;
    model.showPreviewBeforeComplete = "noPreview";
    model.completeText = "Submit";

    // Apply prefill values if provided
    if (prefillData && typeof prefillData === "object") {
      for (const [key, value] of Object.entries(prefillData)) {
        model.setValue(key, value);
      }
      model.data = normalizeQuestionnaireSurveyData(form, model.data || {});
    }
    answerSnapshotRef.current = { ...(model.data || {}) };

    // Apply read-only constraints if provided
    if (readOnlyFields && Array.isArray(readOnlyFields)) {
      applyReadOnlyFields(model, readOnlyFields);
    }

    if (isWomanQuestionnaire(form)) {
      applyWqVisitNo(model, taskContext);
      applyWqReproductionSummary(model);
      applyWqPregnancyHistoryCalculations(model);
      applyWqPregnancyTrackingEligibility(model);
    }

    if (isHouseholdQuestionnaire(form)) {
      attachHouseholdSurveyBehaviors(model, form);
    }

    model.onValueChanged.add((sender, options) => {
      markDirty();
      const nextData = {
        ...(answerSnapshotRef.current || {}),
        ...(sender.data || {}),
      };
      if (options?.name) {
        nextData[options.name] = options.value;
      }
      answerSnapshotRef.current = nextData;
      setRendererAnswerData(nextData);
      if (isWomanQuestionnaire(form)) {
        if (options.name === WQ_INTERVIEW_DATE_FIELD) {
          applyWqVisitNo(sender, taskContext);
        }
        const isWqOutcomeDriver =
          options.name === WQ_WOMAN_AVAILABLE_FIELD ||
          options.name === WQ_CONSENT_FIELD ||
          options.name === WQ_CURRENT_MARITAL_STATUS_FIELD;
        if (isWqOutcomeDriver) {
          clearStaleWqForcedOutcome(sender, options.name, options.oldValue);
        }
        if (options.name === WQ_WOMAN_AVAILABLE_FIELD) {
          const stopMessage = WQ_STOP_MESSAGES[Number(options.value)];
          if (stopMessage) {
            setSaveMessage(stopMessage);
            requestAnimationFrame(() => {
              routeWqStopToOutcome(sender);
              updateSurveyStatus(sender);
            });
          }
        }
        if (options.name === WQ_CONSENT_FIELD && Number(options.value) === WQ_CONSENT_NO_VALUE) {
          setSaveMessage(WQ_CONSENT_STOP_MESSAGE);
          requestAnimationFrame(() => {
            routeWqStopToOutcome(sender);
            updateSurveyStatus(sender);
          });
        }
        if (
          options.name === WQ_CURRENT_MARITAL_STATUS_FIELD &&
          Number(options.value) === WQ_NEVER_MARRIED_VALUE
        ) {
          setSaveMessage("Never married selected. Complete the outcome before final save.");
          requestAnimationFrame(() => {
            routeWqStopToOutcome(sender);
            updateSurveyStatus(sender);
          });
        }
        if (
          options.name === WQ_EVER_GIVEN_BIRTH_FIELD &&
          Number(options.value) === WQ_EVER_GIVEN_BIRTH_NO
        ) {
          // Excel 02 row 4: Q1 "no" skips straight to Q6 (born alive but
          // later died); the remaining living-children questions are hidden
          // by their visibleIf rules.
          requestAnimationFrame(() => {
            rendererRef.current?.focusQuestion(WQ_BORN_ALIVE_LATER_DIED_FIELD);
          });
        }
        if (shouldRecalculateWqPregnancyTrackingEligibility(options.name)) {
          applyWqPregnancyTrackingEligibility(sender);
        }
        if (shouldRecalculateWqReproductionSummary(options.name)) {
          applyWqReproductionSummary(sender);
        }
        if (shouldRecalculateWqPregnancyHistory(options.name)) {
          applyWqPregnancyHistoryCalculations(sender);
        }
      }
    });

    model.onCurrentPageChanging.add((sender, options) => {
      if (
        isHouseholdQuestionnaire(form) &&
        options.oldCurrentPage?.name === HOUSEHOLD_SCHEDULE_PAGE_NAME &&
        options.newCurrentPage?.name === HOUSEHOLD_CHARACTERISTICS_PAGE_NAME &&
        !memberSummaryConfirmedRef.current
      ) {
        options.allow = false;
        openMemberSummaryFromModel(sender);
      }
    });

    model.onCurrentPageChanged.add((sender) => {
      dirtyRef.current = true;
      setDirty(true);
      setPreviewOpen(false);
      setMemberSummaryOpen(false);
      updateSurveyStatus(sender);
    });

    model.onCompleting.add((sender, options) => {
      if (isWomanQuestionnaire(form) && isWqRevisitStop(sender)) {
        return;
      }
      const currentSignature = getDataSignature(sender.data);
      if (!hasPreviewedRef.current || previewSignatureRef.current !== currentSignature) {
        options.allow = false;
        options.allowComplete = false;
        openPreviewFromModel(sender);
        setSaveMessage("Preview the saved draft before final save");
      }
    });

    model.onComplete.add(async (sender) => {
      const submission = await saveQuestionnaireSubmission({
        formCode: form.form_code,
        formVersion: form.version,
        payload: sender.data,
        taskId: taskContext?.id,
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
      setSaveMessage(`Finalized ${submission.submission_id}`);
      if (isWomanQuestionnaire(form) && isWqRevisitStop(sender)) {
        const message = getWqRevisitStopMessage(sender);
        Alert.alert(message, "", [
          {
            text: "OK",
            onPress: () => navigateTo(ROUTES.completedForms),
          },
        ]);
      } else {
        navigateTo(ROUTES.completedForms);
      }
    });
    return model;
  }, [showForm, form, formCode, prefillData, readOnlyFields, taskContext, draftContext]);

  useEffect(() => {
    surveyRef.current = survey;
    return () => {
      if (surveyRef.current === survey) {
        surveyRef.current = null;
      }
    };
  }, [survey]);

  useEffect(() => {
    if (!showForm || !survey) return;
    updateSurveyStatus(survey);
  }, [showForm, survey]);

  useEffect(() => {
    if (!showForm || !survey || !isWomanQuestionnaire(form)) return undefined;
    let cancelled = false;
    const householdId = deriveHouseholdIdFromTask(taskContext, prefillData);
    async function loadChoices() {
      const members = householdId ? await listHouseholdMembers(householdId) : [];
      if (cancelled) return;
      applyWqHusbandPartnerChoices(survey, members, taskContext, prefillData);
      updateSurveyStatus(survey);
    }
    loadChoices();
    return () => {
      cancelled = true;
    };
  }, [showForm, survey, form, taskContext, prefillData]);

  useEffect(() => {
    if (!showForm || !survey || !draftContext) return undefined;
    let cancelled = false;
    const restoreKey = [
      draftContext.formCode,
      draftContext.formVersion,
      draftContext.taskId,
      draftContext.subjectType,
      draftContext.subjectId,
      draftContext.deviceId,
      draftContext.userId,
    ].join("|");

    if (restoredDraftKeyRef.current === restoreKey) {
      return () => {
        cancelled = true;
      };
    }
    restoredDraftKeyRef.current = restoreKey;

    async function restoreDraft() {
      const draft = await getActiveQuestionnaireDraft(draftContext);
      if (cancelled) return;

      if (draft) {
        draftIdRef.current = draft.draft_id;
        setDraftId(draft.draft_id);
        const restoredData = {
          ...(survey.data || {}),
          ...(draft.json_payload || {}),
        };
        survey.data = normalizeQuestionnaireSurveyData(
          form,
          mergePrefillIntoBlankValues(restoredData, survey.data || {}),
        );
        answerSnapshotRef.current = { ...(survey.data || {}) };
        setRendererAnswerData(answerSnapshotRef.current);
        if (isHouseholdQuestionnaire(form)) {
          refreshHouseholdSurveyBehaviors(survey, form);
        }
        if (isWomanQuestionnaire(form)) {
          applyWqReproductionSummary(survey);
          applyWqPregnancyHistoryCalculations(survey);
          applyWqPregnancyTrackingEligibility(survey);
          routeWqStopToOutcome(survey, { navigate: false });
        }
        setPreviewConfirmed(false);
        memberSummaryConfirmedRef.current = false;
        setMemberSummaryConfirmed(false);
        if (draft.completion_state?.currentPageName) {
          goToSurveySection(survey, draft.completion_state.currentPageName);
        }
        setLastSavedAt(draft.updated_at);
        dirtyRef.current = false;
        setDirty(false);
      } else {
        await saveDraftFromModel(survey, { silent: true });
        answerSnapshotRef.current = { ...(survey.data || {}) };
        setRendererAnswerData(answerSnapshotRef.current);
      }

      updateSurveyStatus(survey);
    }

    restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [showForm, survey, draftContext]);

  useEffect(() => {
    if (!showForm || !survey) return undefined;

    const interval = setInterval(() => {
      if (dirtyRef.current) {
        saveDraftFromModel(survey, { silent: true });
      }
    }, AUTOSAVE_INTERVAL_MS);

    const saveBeforeLeave = () => {
      if (dirtyRef.current) {
        saveDraftFromModel(survey, { silent: true });
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", saveBeforeLeave);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", saveBeforeLeave);
    }

    return () => {
      clearInterval(interval);
      saveBeforeLeave();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", saveBeforeLeave);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", saveBeforeLeave);
      }
    };
  }, [showForm, survey, draftContext]);

  if (!form) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Questionnaire not found</Text>
      </View>
    );
  }

  const displayedSections = useMemo(
    () =>
      survey
        ? buildSurveySections(survey, {
            includeHouseholdMemberSummary: isHouseholdQuestionnaire(form),
            includeCompactPreview: true,
            currentSectionName: memberSummaryOpen
              ? HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME
              : previewOpen
                ? COMPACT_PREVIEW_SECTION_NAME
                : null,
            householdMemberSummaryConfirmed: memberSummaryConfirmed,
            compactPreviewConfirmed: previewConfirmed,
          })
        : sections,
    [survey, form, memberSummaryOpen, previewOpen, memberSummaryConfirmed, previewConfirmed, sections],
  );
  const memberSummaryRows = survey
    ? buildHouseholdMemberSummaryRows(survey.data || {}, form, activeLocale)
    : [];
  const hideDashboardShell = showForm && compact;
  const activeRendererAnswerData = {
    ...(rendererAnswerData || {}),
    ...(answerSnapshotRef.current || {}),
  };

  return (
    <View style={styles.wrap}>
      {showForm && (
        <View style={[styles.formWindow, compact && styles.formWindowCompact]}>
          {compact ? (
            <View style={[styles.formWindowHeader, styles.formWindowHeaderCompact]}>
              <Pressable
                accessibilityLabel="Open sections"
                onPress={() => setSectionDrawerOpen(true)}
                style={styles.headerIconButton}
              >
                <MaterialCommunityIcons color="#344054" name="format-list-bulleted-square" size={23} />
              </Pressable>
              <Text numberOfLines={1} style={[styles.formWindowTitle, styles.formWindowTitleCompact]}>
                {form.title?.default || form.title}
              </Text>
              <Pressable
                accessibilityLabel="Close questionnaire"
                onPress={() => handleCloseForm(survey)}
                style={styles.headerIconButton}
              >
                <MaterialCommunityIcons color="#d92d20" name="close-circle" size={25} />
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.formWindowHeader, compact && styles.formWindowHeaderHidden]}>
            <View style={[styles.titleBlock, compact && styles.formHeaderTitleBlockCompact]}>
              <Text style={styles.code}>{form.form_code}</Text>
              <View>
                <Text numberOfLines={compact ? 1 : undefined} style={[styles.formWindowTitle, compact && styles.formWindowTitleCompact]}>{form.title?.default || form.title}</Text>
                <Text style={styles.subtle}>
                  {lastSavedAt
                    ? `Draft saved ${lastSavedAt}${dirty ? " · unsaved changes" : ""}`
                    : "Draft not saved yet"}
                </Text>
              </View>
            </View>
            <View style={[styles.formWindowActions, compact && styles.formWindowActionsCompact]}>
              <Pressable
                onPress={() => saveDraftFromModel(survey, { manual: true })}
                style={[styles.secondaryButton, compact && styles.compactHeaderButtonHidden]}
              >
                <Text style={styles.secondaryButtonText}>Save Draft</Text>
              </Pressable>
              <Pressable
                onPress={() => openPreviewFromModel(survey)}
                style={[styles.secondaryButton, compact && styles.compactHeaderButtonHidden]}
              >
                <Text style={styles.secondaryButtonText}>Preview</Text>
              </Pressable>
              {!compact ? <RendererLanguageSwitcher locale={activeLocale} onChange={changeFormLocale} /> : null}
              <Pressable
                onPress={() => handleCloseForm(survey)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
          <View pointerEvents="box-none" style={[styles.formWindowBody, compact && styles.formWindowBodyCompact]}>
            {compact && !previewOpen && !memberSummaryOpen ? (
              <View pointerEvents="box-none" style={styles.languageOverlay}>
                <RendererLanguageSwitcher iconOnly locale={activeLocale} onChange={changeFormLocale} />
              </View>
            ) : null}
            {!compact ? <View style={styles.progressHeader}>
              <View style={styles.progressTextRow}>
                <Text style={styles.panelTitle}>Progress</Text>
                <Text style={styles.subtle}>
                  {`${progress.answered}/${progress.total} fields · ${progress.percent}%`}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
              </View>
            </View> : null}

            <View pointerEvents="box-none" style={[styles.formWorkspace, compact && styles.formWorkspaceCompact]}>
              {!compact ? <View style={styles.sectionNav}>
                <Text style={styles.sectionNavTitle}>Table of Contents</Text>
                <ScrollView style={styles.sectionNavList}>
                  {displayedSections.map((section) => (
                    <Pressable
                      key={section.name}
                      onPress={() => {
                        handleSectionNavPress(survey, section.name);
                      }}
                      style={[
                        styles.sectionNavItem,
                        section.isCurrent && styles.sectionNavItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sectionNavItemText,
                          section.isCurrent && styles.sectionNavItemTextActive,
                        ]}
                        numberOfLines={2}
                      >
                        {section.title}
                      </Text>
                      <Text style={styles.sectionNavMeta}>
                        {`${section.answered}/${section.total}`}
                        {section.hasErrors ? " · check" : ""}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View> : null}

              <View pointerEvents="box-none" style={[styles.formContentPane, compact && styles.formContentPaneCompact]}>
                {memberSummaryOpen ? (
                  <View style={styles.memberSummaryPanel}>
                    <View style={[styles.previewHeader, compact && styles.previewHeaderCompact]}>
                      <View style={compact && styles.previewTitleBlockCompact}>
                        <Text style={styles.previewTitle}>02B-Household Member Summary</Text>
                        <Text style={styles.subtle}>Review the household listing before Section 03</Text>
                      </View>
                      <View style={[styles.formWindowActions, compact && styles.previewActionsCompact]}>
                        <Pressable
                          onPress={() => goBackFromMemberSummary(survey)}
                          style={[styles.secondaryButton, compact && styles.previewActionButtonCompact]}
                        >
                          <Text numberOfLines={1} style={[styles.secondaryButtonText, compact && styles.previewActionTextCompact]}>Go Back</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => confirmMemberSummary(survey)}
                          style={[styles.primaryButton, compact && styles.previewActionButtonCompact]}
                        >
                          <Text numberOfLines={1} style={[styles.primaryButtonText, compact && styles.previewActionTextCompact]}>Confirm</Text>
                        </Pressable>
                      </View>
                    </View>
                    <ScrollView style={styles.memberSummaryTableWrap}>
                      <View style={styles.memberSummaryTable}>
                        <View style={[styles.memberSummaryRow, styles.memberSummaryHeaderRow]}>
                          <Text style={[styles.memberSummaryCell, styles.memberSummarySrCell]}>Sr</Text>
                          <Text style={[styles.memberSummaryCell, styles.memberSummaryNameCell]}>Member name</Text>
                          <Text style={styles.memberSummaryCell}>Age</Text>
                          <Text style={styles.memberSummaryCell}>Sex</Text>
                          <Text style={[styles.memberSummaryCell, styles.memberSummaryRelationCell]}>Relation</Text>
                          <Text style={styles.memberSummaryCell}>WQ Eligible</Text>
                        </View>
                        {memberSummaryRows.length ? (
                          memberSummaryRows.map((row) => (
                            <View key={row.sr} style={styles.memberSummaryRow}>
                              <Text style={[styles.memberSummaryCell, styles.memberSummarySrCell]}>{row.sr}</Text>
                              <Text style={[styles.memberSummaryCell, styles.memberSummaryNameCell]}>{row.memberName}</Text>
                              <Text style={styles.memberSummaryCell}>{row.age}</Text>
                              <Text style={styles.memberSummaryCell}>{row.sex}</Text>
                              <Text style={[styles.memberSummaryCell, styles.memberSummaryRelationCell]}>{row.relation}</Text>
                              <Text style={styles.memberSummaryCell}>{row.wqEligible}</Text>
                            </View>
                          ))
                        ) : (
                          <View style={styles.emptyPanel}>
                            <Text style={styles.subtle}>No household members listed yet.</Text>
                          </View>
                        )}
                      </View>
                    </ScrollView>
                  </View>
                ) : previewOpen ? (
                  <View style={styles.previewPanel}>
                    <View style={[styles.previewHeader, compact && styles.previewHeaderCompact]}>
                      <View style={compact && styles.previewTitleBlockCompact}>
                        <Text style={styles.previewTitle}>Preview</Text>
                        <Text style={styles.subtle}>Compact final review from the saved local draft</Text>
                      </View>
                      <View style={[styles.formWindowActions, compact && styles.previewActionsCompact]}>
                        <Pressable
                          onPress={() => {
                            setPreviewOpen(false);
                            if (survey) updateSurveyStatus(survey);
                          }}
                          style={[styles.secondaryButton, compact && styles.previewActionButtonCompact]}
                        >
                          <Text numberOfLines={1} style={[styles.secondaryButtonText, compact && styles.previewActionTextCompact]}>Edit Form</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => survey?.doComplete?.()}
                          style={[styles.primaryButton, compact && styles.previewActionButtonCompact]}
                        >
                          <Text numberOfLines={1} style={[styles.primaryButtonText, compact && styles.previewActionTextCompact]}>Confirm & Submit</Text>
                        </Pressable>
                      </View>
                    </View>
                    <PreviewRenderer locale={activeLocale} model={survey} />
                  </View>
                ) : survey ? (
                  <NativeSurveyRenderer
                    ref={rendererRef}
                    answerData={activeRendererAnswerData}
                    compactPager={false}
                    locale={activeLocale}
                    model={survey}
                    notice={saveMessage}
                    onCompleteRequested={(activeModel) => activeModel?.doComplete?.()}
                    onPreviewRequested={() => openPreviewFromModel(survey)}
                    onSaveDraft={(options) => saveDraftFromModel(survey, options)}
                    sectionDrawerOpen={sectionDrawerOpen}
                    onSectionDrawerOpenChange={setSectionDrawerOpen}
                    sections={compact ? displayedSections : []}
                    onSectionSelect={(section) => handleSectionNavPress(survey, section.name)}
                  />
                ) : null}
              </View>
            </View>
          </View>
        </View>
      )}

      {!hideDashboardShell ? (
        <>
      <View style={styles.toolbar}>
        <View style={styles.titleBlock}>
          <Text style={styles.code}>{form.form_code}</Text>
          <View>
            <Text style={styles.title}>{form.title?.default || form.title}</Text>
            <Text style={styles.subtle}>
              {`Version ${form.version} · ${form.question_count} fields`}
            </Text>
          </View>
        </View>
        {allowNewResponse ? (
          <View style={styles.toolbarActions}>
            <Pressable
              onPress={() => navigateTo(ROUTES.questionnaireNew(formCode))}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Add</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {saveMessage ? <Text style={styles.saveMessage}>{saveMessage}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Submissions</Text>
        {submissions.length ? (
          <ScrollView style={styles.submissionList}>
            {submissions.map((submission) => (
              <View key={submission.submission_id} style={styles.submissionRow}>
                <Text style={styles.submissionId}>{submission.submission_id}</Text>
                <Text style={styles.subtle}>
                  {`${submission.sync_status} · ${submission.created_at}`}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyPanel} />
        )}
      </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 14,
    padding: 22,
    ...(Platform.OS === "web" ? { minHeight: "calc(100vh - 76px)" } : {}),
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  titleBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  formHeaderTitleBlockCompact: {
    display: "none",
  },
  code: {
    minWidth: 52,
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#1f6feb",
    color: "#ffffff",
    fontWeight: "800",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#18202a",
  },
  subtle: {
    fontSize: 13,
    color: "#667085",
  },
  primaryButton: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 6,
    backgroundColor: "#1f6feb",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  saveMessage: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "700",
  },
  panel: {
    minHeight: 180,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    gap: 10,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#18202a",
  },
  emptyPanel: {
    minHeight: 120,
  },
  submissionList: {
    maxHeight: 220,
  },
  submissionRow: {
    minHeight: 48,
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "#eef2f5",
  },
  submissionId: {
    fontSize: 13,
    fontWeight: "800",
    color: "#18202a",
  },
  formWindow: {
    ...(Platform.OS === "web"
      ? { position: "fixed", top: 0, right: 0, bottom: 0, left: 0 }
      : { flex: 1 }),
    zIndex: 20,
    backgroundColor: "#eef2f5",
  },
  formWindowCompact: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    elevation: 50,
  },
  formWindowHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 22,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4",
  },
  formWindowHeaderCompact: {
    height: 56,
    maxHeight: 56,
    minHeight: 56,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 10,
  },
  formWindowHeaderHidden: {
    display: "none",
  },
  headerIconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  formWindowActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 12,
  },
  formWindowActionsCompact: {
    flex: 1,
    width: "100%",
    flexShrink: 0,
    justifyContent: "flex-end",
    gap: 6,
  },
  formWindowTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18202a",
    flexShrink: 1,
  },
  formWindowTitleCompact: {
    flex: 1,
    maxWidth: undefined,
    textAlign: "center",
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    color: "#18202a",
    fontWeight: "700",
  },
  compactHeaderButtonHidden: {
    display: "none",
  },
  formWindowBody: {
    flex: 1,
    margin: 18,
    gap: 12,
    overflow: "hidden",
  },
  formWindowBodyCompact: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    margin: 0,
    padding: 12,
  },
  languageOverlay: {
    position: "absolute",
    top: 2,
    right: 12,
    zIndex: 5,
    elevation: 5,
  },
  progressHeader: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    gap: 8,
  },
  progressTextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e5e7eb",
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1f6feb",
  },
  formWorkspace: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    gap: 12,
  },
  formWorkspaceCompact: {
    flexDirection: "column",
    gap: 0,
  },
  sectionNav: {
    width: 260,
    minWidth: 220,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  sectionNavTitle: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: "800",
    color: "#18202a",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
  },
  sectionNavList: {
    maxHeight: "calc(100vh - 190px)",
  },
  sectionNavItem: {
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
    backgroundColor: "#ffffff",
  },
  sectionNavItemActive: {
    backgroundColor: "#eef6ff",
    borderLeftWidth: 4,
    borderLeftColor: "#1f6feb",
  },
  sectionNavItemText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#18202a",
  },
  sectionNavItemTextActive: {
    color: "#1f6feb",
  },
  sectionNavMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#667085",
  },
  formContentPane: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    padding: 12,
    ...(Platform.OS === "web" ? { overflow: "auto" } : {}),
  },
  formContentPaneCompact: {
    borderWidth: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  previewPanel: {
    flex: 1,
    minHeight: "100%",
    gap: 12,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
  },
  previewHeaderCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  previewTitleBlockCompact: {
    width: "100%",
    minWidth: 0,
  },
  previewActionsCompact: {
    width: "100%",
    flexWrap: "nowrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  previewActionButtonCompact: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  previewActionTextCompact: {
    fontSize: 14,
  },
  previewTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#18202a",
  },
  previewRows: {
    flex: 1,
  },
  previewTable: {
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 8,
    overflow: "hidden",
  },
  previewRow: {
    minHeight: 44,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
  },
  previewHeaderRow: {
    backgroundColor: "#f6f8fa",
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475467",
  },
  previewValue: {
    fontSize: 13,
    color: "#18202a",
  },
  previewFieldCell: {
    width: "48%",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: "#eef2f5",
  },
  previewAnswerCell: {
    width: "52%",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  previewRepeatBlock: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
    gap: 8,
  },
  previewRepeatTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475467",
  },
  previewRepeatWrap: {
    width: "100%",
  },
  previewRepeatHeader: {
    flexDirection: "row",
    backgroundColor: "#f6f8fa",
    borderWidth: 1,
    borderColor: "#eef2f5",
  },
  previewRepeatRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderLeftColor: "#eef2f5",
    borderRightWidth: 1,
    borderRightColor: "#eef2f5",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
  },
  previewRepeatHeaderCell: {
    flex: 1,
    minWidth: 56,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: "#eef2f5",
    fontSize: 11,
    fontWeight: "800",
    color: "#475467",
  },
  previewRepeatCell: {
    flex: 1,
    minWidth: 56,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: "#eef2f5",
    fontSize: 11,
    color: "#18202a",
  },
  memberSummaryPanel: {
    flex: 1,
    minHeight: "100%",
    gap: 12,
  },
  memberSummaryTableWrap: {
    flex: 1,
  },
  memberSummaryTable: {
    minWidth: 560,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 8,
    overflow: "hidden",
  },
  memberSummaryRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: "#eef2f5",
    backgroundColor: "#ffffff",
  },
  memberSummaryHeaderRow: {
    borderTopWidth: 0,
    backgroundColor: "#f6f8fa",
  },
  memberSummaryCell: {
    width: 82,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: "#eef2f5",
    fontSize: 13,
    color: "#18202a",
  },
  memberSummarySrCell: {
    width: 42,
    fontWeight: "800",
  },
  memberSummaryNameCell: {
    width: 150,
  },
  memberSummaryRelationCell: {
    width: 130,
  },
});
