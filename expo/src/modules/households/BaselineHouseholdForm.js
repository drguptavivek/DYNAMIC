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
import { applyHouseholdMasterChoices } from "../../lib/householdMasterChoices.js";
import {
  attachHouseholdSurveyBehaviors,
  refreshHouseholdSurveyBehaviors,
  validateHouseholdSurveyForFinalization,
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
  markQuestionnaireDraftSubmitted,
  saveQuestionnaireDraft,
} from "../questionnaires/questionnaireDraftRepository.js";
import { saveQuestionnaireSubmission } from "../questionnaires/questionnaireSubmissionRepository.js";
import { prepareQuestionnaireSurveyJson } from "../questionnaires/questionnaireSurveyJsonTransforms.js";
import { buildHhqPrefill, mergePrefillIntoBlankValues } from "../../lib/prefillMapper.js";
import { getHouseholdSync } from "../../lib/householdSync.js";
import { applyHhqTaskHouseholdPrefill } from "./hhqTaskPrefill.js";
import { buildHouseholdIdFromHhqData } from "./householdIds.js";
import {
  extractHouseholdRegistryFields,
  findExistingHouseholdForHhqData,
} from "./householdRepository.js";

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
  onClose,
  onScrollOffsetChange,
  onSaved,
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
  const [, setRevision] = useState(0);
  const memberSummaryConfirmedRef = useRef(false);
  const draftIdRef = useRef(null);
  const restoredDraftKeyRef = useRef(null);
  const dirtyRef = useRef(false);
  const messageTimerRef = useRef(null);

  const draftContext = useMemo(() => ({
    formCode: form.form_code,
    formVersion: form.version,
    taskId: taskContext?.id || null,
    subjectType: taskContext?.subject_type || "locality",
    subjectId: taskContext?.subject_id || taskContext?.household_id || selectedLocalityCode || "unselected",
    deviceId: user?.device_id || "dev-device",
    userId: user?.user_id || user?.id || user?.username || "dev-user",
  }), [form, selectedLocalityCode, taskContext, user]);

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

  const model = useMemo(() => {
    const surveyJson = applyHouseholdMasterChoices(prepareQuestionnaireSurveyJson(form), {
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

    attachHouseholdSurveyBehaviors(survey, form, undefined, {
      findExistingHousehold: findExistingHouseholdForHhqData,
    });
    survey.onValueChanged.add((sender, options) => {
      dirtyRef.current = true;
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
    return survey;
  }, [form, user, localities, selectedLocalityCode, taskContext]);

  useEffect(() => {
    model.locale = locale;
    setRevision((value) => value + 1);
  }, [model, locale]);

  const saveDraft = useCallback(async ({ silent = false } = {}) => {
    try {
      applyHhqVisitNo(model, taskContext);
      refreshHouseholdSurveyBehaviors(model, form);
      const draft = await saveQuestionnaireDraft({
        ...draftContext,
        draftId: draftIdRef.current,
        payload: model.data || {},
        completionState: {
          currentPageName: model.currentPage?.name || null,
          memberSummaryConfirmed: memberSummaryConfirmedRef.current,
        },
      });
      draftIdRef.current = draft.draft_id;
      dirtyRef.current = false;
      if (!silent) showTransientMessage("Draft saved on this device.");
      return draft;
    } catch (error) {
      setMessage(`Could not save draft: ${error.message}`);
      return null;
    }
  }, [draftContext, form, model, showTransientMessage, taskContext]);

  useEffect(() => {
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
      try {
        const draft = await getActiveQuestionnaireDraft(draftContext);
        if (cancelled || !draft) return;
        draftIdRef.current = draft.draft_id;
        model.data = mergePrefillIntoBlankValues(
          { ...(model.data || {}), ...(draft.json_payload || {}) },
          buildHhqPrefill(getHhqTaskHousehold(taskContext)).prefill,
        );
        applyHhqTaskHouseholdPrefill(model, taskContext);
        applyHhqVisitNo(model, taskContext);
        refreshHouseholdSurveyBehaviors(model, form);
        const consentDeclined = hasDeclinedHouseholdConsent(model);
        if (consentDeclined) {
          const firstVisiblePageName = model.firstVisiblePage?.name;
          if (firstVisiblePageName) goToSurveySection(model, firstVisiblePageName);
        } else if (draft.completion_state?.currentPageName) {
          goToSurveySection(model, draft.completion_state.currentPageName);
        }
        memberSummaryConfirmedRef.current = consentDeclined
          ? false
          : Boolean(draft.completion_state?.memberSummaryConfirmed);
        setMemberSummaryConfirmed(memberSummaryConfirmedRef.current);
        dirtyRef.current = false;
        if (consentDeclined) {
          setView("form");
          setFinalReview(false);
          setMessage("Consent declined. The interview ends after this section.");
        } else {
          showTransientMessage("Draft restored from this device.");
        }
        setRevision((value) => value + 1);
      } catch (error) {
        if (!cancelled) setMessage(`Could not restore draft: ${error.message}`);
      }
    }

    restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [draftContext, form, model, showTransientMessage, taskContext]);

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
    if (!availabilityStop) {
      const householdValidation = await validateHouseholdSurveyForFinalization(model, {
        findExistingHousehold: findExistingHouseholdForHhqData,
      });
      if (!householdValidation.valid) {
        setView("form");
        setMessage(householdValidation.message);
        setRevision((value) => value + 1);
        return;
      }
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
      if (!availabilityStop) {
        const householdValidation = await validateHouseholdSurveyForFinalization(model, {
          findExistingHousehold: findExistingHouseholdForHhqData,
        });
        if (!householdValidation.valid) {
          setView("form");
          setMessage(householdValidation.message);
          setRevision((value) => value + 1);
          return;
        }
      }
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
          <View style={styles.languageOverlay}>
            <RendererLanguageSwitcher iconOnly locale={locale} onChange={onLocaleChange} />
          </View>
        ) : null}
        {view === "form" ? (
          <NativeSurveyRenderer
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
                    { key: "sr", title: "Count", width: 70 },
                    { key: "memberName", title: "Name", width: 190 },
                    { key: "age", title: "Age", width: 65 },
                    { key: "sex", title: "Sex", width: 110 },
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
