/**
 * Composes the native baseline household interview, confirmation gate, and final preview flow.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
import { buildHouseholdIdFromHhqData } from "./householdIds.js";
import {
  extractHouseholdRegistryFields,
  findExistingHouseholdForHhqData,
} from "./householdRepository.js";

const AUTOSAVE_INTERVAL_MS = 30000;
const HOUSEHOLD_SCHEDULE_PAGE_NAME = "page_02_household_schedule";
const HOUSEHOLD_CHARACTERISTICS_PAGE_NAME = "page_03_household_characteristics";

export function BaselineHouseholdForm({
  form,
  locale,
  onLocaleChange,
  user,
  localities,
  selectedLocalityCode,
  onClose,
  onSaved,
}) {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const [view, setView] = useState("form");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberSummaryConfirmed, setMemberSummaryConfirmed] = useState(false);
  const [previewSignature, setPreviewSignature] = useState("");
  const [finalReview, setFinalReview] = useState(false);
  const [, setRevision] = useState(0);
  const memberSummaryConfirmedRef = useRef(false);
  const draftIdRef = useRef(null);
  const dirtyRef = useRef(false);
  const messageTimerRef = useRef(null);

  const draftContext = useMemo(() => ({
    formCode: form.form_code,
    formVersion: form.version,
    taskId: null,
    subjectType: "locality",
    subjectId: selectedLocalityCode || "unselected",
    deviceId: user?.device_id || "dev-device",
    userId: user?.user_id || user?.id || user?.username || "dev-user",
  }), [form, selectedLocalityCode, user]);

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

    attachHouseholdSurveyBehaviors(survey, form, undefined, {
      findExistingHousehold: findExistingHouseholdForHhqData,
    });
    survey.onValueChanged.add((sender, options) => {
      dirtyRef.current = true;
      setPreviewSignature("");
      if (
        options.name === "hhq_household_members" ||
        String(options.name || "").startsWith("member_")
      ) {
        memberSummaryConfirmedRef.current = false;
        setMemberSummaryConfirmed(false);
      }
      setRevision((value) => value + 1);
      setTimeout(() => setRevision((value) => value + 1), 250);
    });
    survey.onCurrentPageChanging.add((sender, options) => {
      if (
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
  }, [form, user, localities, selectedLocalityCode]);

  useEffect(() => {
    model.locale = locale;
    setRevision((value) => value + 1);
  }, [model, locale]);

  const saveDraft = useCallback(async ({ silent = false } = {}) => {
    try {
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
  }, [draftContext, form, model, showTransientMessage]);

  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      try {
        const draft = await getActiveQuestionnaireDraft(draftContext);
        if (cancelled || !draft) return;
        draftIdRef.current = draft.draft_id;
        model.data = { ...(model.data || {}), ...(draft.json_payload || {}) };
        refreshHouseholdSurveyBehaviors(model, form);
        if (draft.completion_state?.currentPageName) {
          goToSurveySection(model, draft.completion_state.currentPageName);
        }
        memberSummaryConfirmedRef.current = Boolean(
          draft.completion_state?.memberSummaryConfirmed
        );
        setMemberSummaryConfirmed(memberSummaryConfirmedRef.current);
        dirtyRef.current = false;
        showTransientMessage("Draft restored from this device.");
        setRevision((value) => value + 1);
      } catch (error) {
        if (!cancelled) setMessage(`Could not restore draft: ${error.message}`);
      }
    }

    restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [draftContext, form, model, showTransientMessage]);

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
  const householdId = buildHouseholdIdFromHhqData(model.data || {}) || "Pending household ID";

  async function openPreview({ final = false } = {}) {
    refreshHouseholdSurveyBehaviors(model, form);
    if (!(await saveDraft({ silent: true }))) return;
    setPreviewSignature(JSON.stringify(model.data || {}));
    setFinalReview(final);
    setView("preview");
    setMessage(final ? "Review all entered data before final save." : "Previewing data entered so far.");
  }

  async function openMemberSummary() {
    refreshHouseholdSurveyBehaviors(model, form);
    await saveDraft({ silent: true });
    setFinalReview(false);
    setView("member-summary");
    setMessage("Confirm the household roster before Section 03.");
  }

  function validateSchedule() {
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

  async function handleSectionSelect(section) {
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
    setFinalReview(false);
    setRevision((value) => value + 1);
    await saveDraft({ silent: true });
  }

  async function requestFinalReview() {
    refreshHouseholdSurveyBehaviors(model, form);
    if (!memberSummaryConfirmedRef.current) {
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
    const householdValidation = await validateHouseholdSurveyForFinalization(model, {
      findExistingHousehold: findExistingHouseholdForHhqData,
    });
    if (!householdValidation.valid) {
      setView("form");
      setMessage(householdValidation.message);
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
      if (!model.validate()) {
        setView("form");
        setMessage("Complete the highlighted required fields before final save.");
        return;
      }
      const householdValidation = await validateHouseholdSurveyForFinalization(model, {
        findExistingHousehold: findExistingHouseholdForHhqData,
      });
      if (!householdValidation.valid) {
        setView("form");
        setMessage(householdValidation.message);
        setRevision((value) => value + 1);
        return;
      }
      const registryRecord = extractHouseholdRegistryFields(model.data);
      const submission = await saveQuestionnaireSubmission({
        formCode: form.form_code,
        formVersion: form.version,
        payload: model.data,
        deviceId: user?.device_id || "dev-device",
      });
      if (draftIdRef.current) {
        await markQuestionnaireDraftSubmitted({
          draftId: draftIdRef.current,
          submittedFormResponseId: submission.submission_id,
        });
      }
      setMessage(`Saved household ${registryRecord.household_id}`);
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
        <View style={styles.headerText}>
          <Text numberOfLines={compact ? 1 : undefined} style={[styles.title, compact && styles.titleCompact]}>
            Baseline Household Questionnaire
          </Text>
          <Text style={styles.subtle}>{`${householdId} · Native Expo renderer`}</Text>
        </View>
        <View style={[styles.actions, compact && styles.actionsCompact]}>
          <Pressable onPress={() => openPreview()} style={[styles.secondaryButton, compact && styles.actionButtonCompact]}>
            <Text style={styles.secondaryButtonText}>Preview</Text>
          </Pressable>
          <RendererLanguageSwitcher locale={locale} onChange={onLocaleChange} />
          <Pressable onPress={closeForm} style={[styles.secondaryButton, compact && styles.actionButtonCompact]}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.body}>
        {view === "form" ? (
          <NativeSurveyRenderer
            model={model}
            notice={message}
            sections={sections}
            onSectionSelect={handleSectionSelect}
            onCompleteRequested={requestFinalReview}
            onSaveDraft={saveDraft}
          />
        ) : (
          <>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <SectionNavigator sections={sections} onSelect={handleSectionSelect} />
            {view === "member-summary" ? (
              <View style={styles.specialView}>
                <DisplayRenderer
                  title="02B-Household Member Summary"
                  subtitle="Confirm names, generated member IDs, age, sex, relationship, and WQ eligibility."
                  rows={memberRows}
                  columns={[
                    { key: "sr", title: "Sr", width: 55 },
                    { key: "memberId", title: "Member ID", width: 210 },
                    { key: "memberName", title: "Name", width: 150 },
                    { key: "age", title: "Age", width: 65 },
                    { key: "sex", title: "Sex", width: 90 },
                    { key: "relation", title: "Relation", width: 150 },
                    { key: "wqEligible", title: "WQ eligible", width: 100 },
                  ]}
                />
                <View style={styles.footerActions}>
                  <Pressable onPress={() => { goToSurveySection(model, HOUSEHOLD_SCHEDULE_PAGE_NAME); setView("form"); }} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Edit roster</Text>
                  </Pressable>
                  <Pressable onPress={confirmMemberSummary} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Confirm roster</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.specialView}>
                <PreviewRenderer model={model} />
                <View style={styles.footerActions}>
                  <Pressable onPress={() => setView("form")} style={styles.secondaryButton}>
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
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#d8dee4", backgroundColor: "#ffffff" },
  headerCompact: { minHeight: 0, alignItems: "stretch", gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  headerText: { flex: 1, minWidth: 240 },
  title: { color: "#18202a", fontSize: 20, fontWeight: "800" },
  titleCompact: { fontSize: 17 },
  subtle: { color: "#667085", fontSize: 13 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  actionsCompact: { width: "100%", flexWrap: "nowrap", gap: 7 },
  actionButtonCompact: { flex: 1 },
  body: { flex: 1, gap: 10, padding: 12 },
  message: { padding: 9, borderRadius: 7, color: "#1f4d7a", backgroundColor: "#eef6ff", fontSize: 13, fontWeight: "700" },
  specialView: { flex: 1, gap: 10, minHeight: 0 },
  footerActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, paddingTop: 8 },
  primaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#1f6feb" },
  primaryButtonText: { color: "#ffffff", fontWeight: "800" },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, backgroundColor: "#ffffff" },
  secondaryButtonText: { color: "#18202a", fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
