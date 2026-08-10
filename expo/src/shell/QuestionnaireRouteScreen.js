/**
 * Routes questionnaire launches to either the native HHQ flow or the generic form dashboard.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { getRuntimeFormByCode } from "../data/runtimeFormCatalog.js";
import { QuestionnaireDashboard } from "../modules/questionnaires/QuestionnaireDashboard.js";
import { HouseholdModule } from "../modules/households/HouseholdModule.js";
import { useFieldApp } from "./FieldAppProvider.js";
import { FieldAppShell } from "./FieldAppShell.js";

export function QuestionnaireRouteScreen({ formCode, mode }) {
  const app = useFieldApp();
  const normalizedFormCode = String(formCode || "").toUpperCase();
  const form = getRuntimeFormByCode(normalizedFormCode);
  const route = { view: "questionnaire", formCode: normalizedFormCode, mode };
  const title = normalizedFormCode || "Questionnaire";
  const isEntryRoute = mode === "new";
  const hasValidTaskContext = Boolean(app.currentTaskContext?.id);
  const isHhqHouseholdEntry = normalizedFormCode === "HHQ";

  if (!form) {
    return (
      <FieldAppShell route={route} title={title}>
        <BlockedPanel title="Form not found" message="This questionnaire is not available on this device." />
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
          locale={app.locale}
          mode="new"
          onLocaleChange={app.setLocale}
          user={app.user}
          localities={app.localities}
          selectedLocalityCode={app.selectedLocalityCode}
          taskContext={app.currentTaskContext}
          onDataSynced={app.refreshLocalities}
        />
      </FieldAppShell>
    );
  }

  return (
    <FieldAppShell route={route} title={title}>
      <QuestionnaireDashboard
        formCode={normalizedFormCode}
        locale={app.locale}
        mode={mode}
        onLocaleChange={app.setLocale}
        taskContext={app.currentTaskContext}
        prefillData={app.prefillData}
        readOnlyFields={app.readOnlyFields}
        user={app.user}
        allowNewResponse={false}
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
