import React from "react";
import { useLocalSearchParams } from "expo-router";

import { QuestionnaireRouteScreen } from "../../../src/shell/QuestionnaireRouteScreen.js";

export default function NewQuestionnaireRoute() {
  const { formCode, taskId, draftId, openKey, correctionResponseId } = useLocalSearchParams();
  return (
    <QuestionnaireRouteScreen
      correctionResponseId={correctionResponseId}
      draftId={draftId}
      formCode={formCode}
      mode="new"
      openKey={openKey}
      taskId={taskId}
    />
  );
}
