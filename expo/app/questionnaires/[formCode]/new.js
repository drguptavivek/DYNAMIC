import React from "react";
import { useLocalSearchParams } from "expo-router";

import { QuestionnaireRouteScreen } from "../../../src/shell/QuestionnaireRouteScreen.js";

export default function NewQuestionnaireRoute() {
  const { formCode } = useLocalSearchParams();
  return <QuestionnaireRouteScreen formCode={formCode} mode="new" />;
}
