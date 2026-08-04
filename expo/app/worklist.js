import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { useFieldApp } from "../src/shell/FieldAppProvider.js";
import { WorklistScreen } from "../src/modules/worklist/WorklistScreen.js";

export default function WorklistRoute() {
  const app = useFieldApp();
  return (
    <FieldAppShell route={{ view: "worklist" }} title="Worklist">
      <WorklistScreen
        onOpenTask={app.openTask}
        localities={app.localities}
        selectedLocalityCode={app.selectedLocalityCode}
        worklistRevision={app.taskWorklistRevision}
      />
    </FieldAppShell>
  );
}
