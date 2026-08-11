import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { useFieldApp } from "../src/shell/FieldAppProvider.js";
import { DraftPendingFormsScreen } from "../src/modules/questionnaires/DraftPendingFormsScreen.js";

export default function DraftPendingFormsRoute() {
  const app = useFieldApp();

  return (
    <FieldAppShell route={{ view: "draftPendingForms" }} title="Draft/Pending Forms">
      <DraftPendingFormsScreen user={app.user} />
    </FieldAppShell>
  );
}
