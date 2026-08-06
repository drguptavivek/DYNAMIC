import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { FormSubmissionListScreen } from "../src/modules/questionnaires/FormSubmissionListScreen.js";

export default function CompletedFormsRoute() {
  return (
    <FieldAppShell route={{ view: "completedForms" }} title="Completed Forms">
      <FormSubmissionListScreen mode="completed" />
    </FieldAppShell>
  );
}
