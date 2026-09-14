import React from "react";
import { useLocalSearchParams } from "expo-router";

import { QuestionnaireRouteScreen } from "../../../src/shell/QuestionnaireRouteScreen.js";

export default function NewQuestionnaireRoute() {
  const { formCode, taskId, draftId, openKey } = useLocalSearchParams();
  return (
    <QuestionnaireRouteScreen
      draftId={draftId}
      formCode={formCode}
      mode="new"
      openKey={openKey}
      taskId={taskId}
    />
  );
}
