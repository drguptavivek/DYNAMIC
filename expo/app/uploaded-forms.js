import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { FormSubmissionListScreen } from "../src/modules/questionnaires/FormSubmissionListScreen.js";

export default function UploadedFormsRoute() {
  return (
    <FieldAppShell route={{ view: "uploadedForms" }} title="Uploaded Forms">
      <FormSubmissionListScreen mode="uploaded" />
    </FieldAppShell>
  );
}
