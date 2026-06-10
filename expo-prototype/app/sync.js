import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { useFieldApp } from "../src/shell/FieldAppProvider.js";
import { SyncScreen } from "../src/modules/sync/SyncScreen.js";

export default function SyncRoute() {
  const app = useFieldApp();
  return (
    <FieldAppShell route={{ view: "sync" }} title="Sync Status">
      <SyncScreen onClockStatusChange={app.setClockStatus} />
    </FieldAppShell>
  );
}
