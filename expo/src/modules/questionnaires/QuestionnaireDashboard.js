import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Model } from "survey-core";

import { NativeSurveyRenderer } from "../../components/forms/NativeSurveyRenderer.js";
import { RendererLanguageSwitcher } from "../../components/forms/RendererLanguageSwitcher.js";
import { PreviewRenderer } from "../../components/forms/renderers/PreviewRenderer.js";
import { formsByCode } from "../../data/formCatalog";
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

const AUTOSAVE_INTERVAL_MS = 30000;
const HOUSEHOLD_SCHEDULE_PAGE_NAME = "page_02_household_schedule";
const HOUSEHOLD_CHARACTERISTICS_PAGE_NAME = "page_03_household_characteristics";

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
}) {
  const [submissions, setSubmissions] = useState([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [sections, setSections] = useState([]);
  const [progress, setProgress] = useState({ answered: 0, total: 0, percent: 0 });
  const [draftId, setDraftId] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [memberSummaryOpen, setMemberSummaryOpen] = useState(false);
  const [memberSummaryConfirmed, setMemberSummaryConfirmed] = useState(false);
  const [sectionDrawerOpen, setSectionDrawerOpen] = useState(false);
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const form = formsByCode[formCode];
  const showForm = mode === "new";
  const draftIdRef = useRef(null);
  const dirtyRef = useRef(false);
  const hasPreviewedRef = useRef(false);
  const previewSignatureRef = useRef("");
  const memberSummaryConfirmedRef = useRef(false);

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

  async function saveDraftFromModel(model, { silent = false } = {}) {
    if (!model || !draftContext) return null;
    const draft = await saveQuestionnaireDraft({
      ...draftContext,
      draftId: draftIdRef.current,
      payload: model.data || {},
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
      setSaveMessage(`Draft saved ${draft.updated_at}`);
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
    if (!model || form?.form_code !== "HHQ") return;
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
      form?.form_code === "HHQ" &&
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
    navigateTo(ROUTES.questionnaire(formCode));
  }

  const survey = useMemo(() => {
    if (!showForm || !form) return null;
    const surveyJson = prepareQuestionnaireSurveyJson(form);
    const model = new Model(surveyJson);
    model.locale = locale;
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

    // Apply read-only constraints if provided
    if (readOnlyFields && Array.isArray(readOnlyFields)) {
      applyReadOnlyFields(model, readOnlyFields);
    }

    attachHouseholdSurveyBehaviors(model, form);

    model.onValueChanged.add((sender) => {
      markDirty();
      updateSurveyStatus(sender);
    });

    model.onCurrentPageChanging.add((sender, options) => {
      if (
        form.form_code === "HHQ" &&
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
      }
      await refreshSubmissions();
      setSaveMessage(`Finalized ${submission.submission_id}`);
      navigateTo(ROUTES.questionnaire(formCode));
    });
    return model;
  }, [showForm, form, locale, formCode, prefillData, readOnlyFields, taskContext, draftContext]);

  useEffect(() => {
    if (!showForm || !survey || !draftContext) return undefined;
    let cancelled = false;

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
        refreshHouseholdSurveyBehaviors(survey, form);
        hasPreviewedRef.current = false;
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

  const displayedSections = survey
    ? buildSurveySections(survey, {
        includeHouseholdMemberSummary: form.form_code === "HHQ",
        includeCompactPreview: true,
        currentSectionName: memberSummaryOpen
          ? HOUSEHOLD_MEMBER_SUMMARY_SECTION_NAME
          : previewOpen
            ? COMPACT_PREVIEW_SECTION_NAME
            : null,
        householdMemberSummaryConfirmed: memberSummaryConfirmed,
        compactPreviewConfirmed: previewConfirmed,
      })
    : sections;
  const memberSummaryRows = survey
    ? buildHouseholdMemberSummaryRows(survey.data || {}, form, locale)
    : [];

  return (
    <View style={styles.wrap}>
      {showForm && (
        <View style={styles.formWindow}>
          <View style={[styles.formWindowHeader, compact && styles.formWindowHeaderCompact]}>
            <View style={styles.titleBlock}>
              <Text style={styles.code}>{form.form_code}</Text>
              <View>
                <Text style={styles.formWindowTitle}>{form.title?.default || form.title}</Text>
                <Text style={styles.subtle}>
                  {lastSavedAt
                    ? `Draft saved ${lastSavedAt}${dirty ? " · unsaved changes" : ""}`
                    : "Draft not saved yet"}
                </Text>
              </View>
            </View>
            <View style={[styles.formWindowActions, compact && styles.formWindowActionsCompact]}>
              <Pressable
                onPress={() => saveDraftFromModel(survey)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Save Draft</Text>
              </Pressable>
              <Pressable
                onPress={() => openPreviewFromModel(survey)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Preview</Text>
              </Pressable>
              <RendererLanguageSwitcher locale={locale} onChange={onLocaleChange} />
              <Pressable
                onPress={() => handleCloseForm(survey)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.formWindowBody, compact && styles.formWindowBodyCompact]}>
            <View style={styles.progressHeader}>
              <View style={styles.progressTextRow}>
                <Text style={styles.panelTitle}>Progress</Text>
                <Text style={styles.subtle}>
                  {`${progress.answered}/${progress.total} fields · ${progress.percent}%`}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
              </View>
            </View>

            <View style={[styles.formWorkspace, compact && styles.formWorkspaceCompact]}>
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

              <View style={[styles.formContentPane, compact && styles.formContentPaneCompact]}>
                {memberSummaryOpen ? (
                  <View style={styles.memberSummaryPanel}>
                    <View style={styles.previewHeader}>
                      <View>
                        <Text style={styles.previewTitle}>02B-Household Member Summary</Text>
                        <Text style={styles.subtle}>Review the household listing before Section 03</Text>
                      </View>
                      <View style={styles.formWindowActions}>
                        <Pressable
                          onPress={() => goBackFromMemberSummary(survey)}
                          style={styles.secondaryButton}
                        >
                          <Text style={styles.secondaryButtonText}>Go Back</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => confirmMemberSummary(survey)}
                          style={styles.primaryButton}
                        >
                          <Text style={styles.primaryButtonText}>Confirm</Text>
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
                    <View style={styles.previewHeader}>
                      <View>
                        <Text style={styles.previewTitle}>Preview</Text>
                        <Text style={styles.subtle}>Compact final review from the saved local draft</Text>
                      </View>
                      <View style={styles.formWindowActions}>
                        <Pressable
                          onPress={() => {
                            setPreviewOpen(false);
                            if (survey) updateSurveyStatus(survey);
                          }}
                          style={styles.secondaryButton}
                        >
                          <Text style={styles.secondaryButtonText}>Edit Form</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => survey?.doComplete?.()}
                          style={styles.primaryButton}
                        >
                          <Text style={styles.primaryButtonText}>Confirm & Submit</Text>
                        </Pressable>
                      </View>
                    </View>
                    <PreviewRenderer model={survey} />
                  </View>
                ) : survey ? (
                  <NativeSurveyRenderer
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
    minHeight: 0,
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    justifyContent: "flex-start",
    gap: 8,
  },
  formWindowTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18202a",
  },
  secondaryButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    color: "#18202a",
    fontWeight: "700",
  },
  formWindowBody: {
    flex: 1,
    margin: 18,
    gap: 12,
    overflow: "hidden",
  },
  formWindowBodyCompact: {
    margin: 10,
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
