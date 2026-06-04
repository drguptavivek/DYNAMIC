import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";

import { LanguageToggle } from "../../components/LanguageToggle";
import { formsByCode } from "../../data/formCatalog";
import { prepareSurveyJson } from "../../lib/prepareSurveyJson";
import { ROUTES, navigateTo } from "../../navigation/routes";
import {
  listQuestionnaireSubmissions,
  saveQuestionnaireSubmission,
} from "./questionnaireSubmissionRepository";

/**
 * Apply read-only constraints to survey elements
 * Recursively traverses pages and sets readOnly on matching question names
 */
function applyReadOnlyFields(model, readOnlyFields) {
  if (!readOnlyFields || readOnlyFields.length === 0 || !model.pages) {
    return;
  }

  const readOnlySet = new Set(readOnlyFields);

  for (const page of model.pages) {
    if (!page.elements) continue;
    for (const element of page.elements) {
      if (readOnlySet.has(element.name)) {
        element.readOnly = true;
      }
    }
  }
}

export function QuestionnaireDashboard({
  formCode,
  locale,
  mode,
  onLocaleChange,
  taskContext,
  prefillData,
  readOnlyFields,
}) {
  const [submissions, setSubmissions] = useState([]);
  const [saveMessage, setSaveMessage] = useState("");
  const form = formsByCode[formCode];
  const showForm = mode === "new";

  const refreshSubmissions = async () => {
    setSubmissions(await listQuestionnaireSubmissions(formCode));
  };

  useEffect(() => {
    refreshSubmissions();
  }, [formCode]);

  const survey = useMemo(() => {
    if (!showForm || !form) return null;
    const model = new Model(prepareSurveyJson(form));
    model.locale = locale;
    model.showCompletedPage = false;

    // Apply prefill values if provided
    if (prefillData && typeof prefillData === "object") {
      for (const [key, value] of Object.entries(prefillData)) {
        model.setValue(key, value);
      }
    }

    // Apply read-only constraints if provided
    if (readOnlyFields && Array.isArray(readOnlyFields)) {
      applyReadOnlyFields(model, readOnlyFields);
    }

    model.onComplete.add(async (sender) => {
      // Generate domain events if taskContext provided
      if (taskContext) {
        try {
          const { generateEventForSubmission } =
            await import("../../modules/events/eventGenerators.js");
          generateEventForSubmission(taskContext, sender.data);
        } catch (error) {
          console.error("Error generating events:", error);
        }
      }

      const submission = await saveQuestionnaireSubmission({
        formCode: form.form_code,
        formVersion: form.version,
        payload: sender.data,
        taskId: taskContext?.id,
      });
      await refreshSubmissions();
      setSaveMessage(`Saved ${submission.submission_id}`);
      navigateTo(ROUTES.questionnaire(formCode));
    });
    return model;
  }, [showForm, form, locale, formCode, prefillData, readOnlyFields, taskContext]);

  if (!form) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Questionnaire not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {showForm && (
        <View style={styles.formWindow}>
          <View style={styles.formWindowHeader}>
            <View style={styles.titleBlock}>
              <Text style={styles.code}>{form.form_code}</Text>
              <View>
                <Text style={styles.formWindowTitle}>{form.title?.default || form.title}</Text>
                <Text style={styles.subtle}>New questionnaire</Text>
              </View>
            </View>
            <View style={styles.formWindowActions}>
              <LanguageToggle locale={locale} onChange={onLocaleChange} />
              <Pressable
                onPress={() => navigateTo(ROUTES.questionnaire(formCode))}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.formWindowBody}>{survey ? <Survey model={survey} /> : null}</View>
        </View>
      )}

      <View style={styles.toolbar}>
        <View style={styles.titleBlock}>
          <Text style={styles.code}>{form.form_code}</Text>
          <View>
            <Text style={styles.title}>{form.title?.default || form.title}</Text>
            <Text style={styles.subtle}>
              Version {form.version} · {form.question_count} fields
            </Text>
          </View>
        </View>
        <View style={styles.toolbarActions}>
          <Pressable
            onPress={() => navigateTo(ROUTES.questionnaireNew(formCode))}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Add</Text>
          </Pressable>
        </View>
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
                  {submission.sync_status} · {submission.created_at}
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
    minHeight: "calc(100vh - 76px)",
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
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
  formWindowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    padding: 12,
    overflow: "auto",
  },
});
