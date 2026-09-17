/**
 * Routes questionnaire launches to either the native HHQ flow or the generic form dashboard.
 */
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getRuntimeFormByCode } from "../data/runtimeFormCatalog.js";
import { getFormDisplayCode } from "../lib/formDisplayCodes.js";
import { QuestionnaireDashboard } from "../modules/questionnaires/QuestionnaireDashboard.js";
import { HouseholdModule } from "../modules/households/HouseholdModule.js";
import { getFormResponseById, getTask } from "../modules/tasks/taskRepository.js";
import {
  buildWqVisitorCorrectionDraftId,
  canCorrectExcludedWqResponse,
  getWqVisitorCorrectionDraftId,
} from "../modules/questionnaires/wqVisitorExclusion.js";
import { useFieldApp } from "./FieldAppProvider.js";
import { FieldAppShell } from "./FieldAppShell.js";

function normalizeSearchParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveRouteTask(taskId) {
  const normalizedTaskId = normalizeSearchParam(taskId);
  if (!normalizedTaskId) return null;
  return getTask(normalizedTaskId);
}

export function QuestionnaireRouteScreen({ correctionResponseId, draftId, formCode, mode, openKey, taskId }) {
  const app = useFieldApp();
  const normalizedFormCode = String(formCode || "").toUpperCase();
  const form = useMemo(() => getRuntimeFormByCode(normalizedFormCode), [normalizedFormCode]);
  const route = { view: "questionnaire", formCode: normalizedFormCode, mode };
  const title = getFormDisplayCode(normalizedFormCode) || "Questionnaire";
  const isEntryRoute = mode === "new";
  const normalizedTaskId = normalizeSearchParam(taskId);
  const normalizedCorrectionResponseId = normalizeSearchParam(correctionResponseId);
  const routeTaskContext = useMemo(() => resolveRouteTask(normalizedTaskId), [normalizedTaskId]);
  const correctionResponse = useMemo(
    () => (normalizedCorrectionResponseId ? getFormResponseById(normalizedCorrectionResponseId) : null),
    [normalizedCorrectionResponseId],
  );
  const correctionContext = canCorrectExcludedWqResponse(correctionResponse)
    ? {
        responseId: correctionResponse.id,
        draftId:
          getWqVisitorCorrectionDraftId(correctionResponse) ||
          buildWqVisitorCorrectionDraftId(correctionResponse.id),
        answers: correctionResponse.answers_json || {},
        submittedAt: correctionResponse.submitted_at,
      }
    : null;
  const taskContext =
    normalizedTaskId && app.currentTaskContext?.id !== normalizedTaskId
      ? routeTaskContext || app.currentTaskContext
      : app.currentTaskContext || routeTaskContext;
  const hasValidTaskContext = Boolean(taskContext?.id);
  const isHhqHouseholdEntry = normalizedFormCode === "HHQ";

  if (normalizedCorrectionResponseId && !correctionContext) {
    return (
      <FieldAppShell route={route} title={title}>
        <BlockedPanel
          title="Correction period ended"
          message="This excluded form is synced or its 10-minute mobile correction period has expired."
        />
      </FieldAppShell>
    );
  }

  if (!form) {
    return (
      <FieldAppShell route={route} title={title}>
        <BlockedPanel title="Form not found" message="This questionnaire is not available on this device." />
      </FieldAppShell>
    );
  }

  if (isEntryRoute && app.clockGuard?.status === "blocked") {
    return (
      <FieldAppShell route={route} title={title}>
        <BlockedPanel title="Correct device date and time" message={app.clockGuard.message} />
      </FieldAppShell>
    );
  }

  if (isEntryRoute && !hasValidTaskContext && !isHhqHouseholdEntry) {
    return (
      <FieldAppShell route={route} title={title}>
        <BlockedPanel
          title="Open from worklist"
          message="This form requires a scheduled task or valid contextual trigger before entry."
        />
      </FieldAppShell>
    );
  }

  if (isEntryRoute && isHhqHouseholdEntry) {
    return (
      <FieldAppShell route={route} title={title} topBarCollapsed>
        <HouseholdModule
          key={normalizeSearchParam(openKey) || `${normalizedTaskId || ""}-${normalizeSearchParam(draftId) || ""}`}
          locale={app.locale}
          mode="new"
          onLocaleChange={app.setLocale}
          user={app.user}
          localities={app.localities}
          selectedLocalityCode={app.selectedLocalityCode}
          taskContext={taskContext}
          draftId={normalizeSearchParam(draftId)}
          onDataSynced={app.refreshLocalities}
          onDraftSaved={app.notifyTaskWorklistChanged}
          onOpenTask={app.openFormFromTask}
        />
      </FieldAppShell>
    );
  }

  return (
    <FieldAppShell route={route} title={title} topBarCollapsed={isEntryRoute}>
      <QuestionnaireDashboard
        formCode={normalizedFormCode}
        locale={app.locale}
        mode={mode}
        onLocaleChange={app.setLocale}
        taskContext={taskContext}
        prefillData={app.prefillData}
        readOnlyFields={app.readOnlyFields}
        user={app.user}
        allowNewResponse={false}
        correctionContext={correctionContext}
        onDraftSaved={app.notifyTaskWorklistChanged}
      />
    </FieldAppShell>
  );
}

function BlockedPanel({ title, message }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.panel}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 22,
  },
  panel: {
    gap: 8,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#17202a",
  },
  message: {
    fontSize: 14,
    color: "#667085",
  },
});
