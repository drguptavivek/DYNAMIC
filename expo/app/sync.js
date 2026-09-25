import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { useFieldApp } from "../src/shell/FieldAppProvider.js";
import { SyncScreen } from "../src/modules/sync/SyncScreen.js";

export default function SyncRoute() {
  const app = useFieldApp();
  const { notifyTaskWorklistChanged, refreshLocalities } = app;
  const handleSyncComplete = React.useCallback(async () => {
    // The sync service writes pulled tasks directly into SQLite. Invalidate
    // the in-memory Worklist page immediately so the next/open Worklist view
    // reads those rows without requiring a manual pull-to-refresh.
    notifyTaskWorklistChanged();
    await refreshLocalities();
  }, [notifyTaskWorklistChanged, refreshLocalities]);

  return (
    <FieldAppShell route={{ view: "sync" }} title="Sync Status">
      <SyncScreen
        onClockStatusChange={app.setClockStatus}
        onSyncComplete={handleSyncComplete}
      />
    </FieldAppShell>
  );
}
