import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { FormSubmissionListScreen } from "../src/modules/questionnaires/FormSubmissionListScreen.js";

export default function UploadErrorsRoute() {
  return (
    <FieldAppShell route={{ view: "uploadErrors" }} title="Upload Errors">
      <FormSubmissionListScreen mode="uploadErrors" />
    </FieldAppShell>
  );
}
