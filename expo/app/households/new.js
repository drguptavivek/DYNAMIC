/**
 * Opens the native baseline household questionnaire and collapses app chrome while scrolling.
 */
import React, { useCallback, useState } from "react";

import { FieldAppShell } from "../../src/shell/FieldAppShell.js";
import { useFieldApp } from "../../src/shell/FieldAppProvider.js";
import { HouseholdModule } from "../../src/modules/households/HouseholdModule.js";

export default function NewHouseholdRoute() {
  const app = useFieldApp();
  const [topBarCollapsed, setTopBarCollapsed] = useState(false);
  const handleFormScrollOffsetChange = useCallback((offset) => {
    setTopBarCollapsed((collapsed) => (collapsed ? offset > 8 : offset > 28));
  }, []);

  return (
    <FieldAppShell
      route={{ view: "households", mode: "new" }}
      title="Households"
      topBarCollapsed={topBarCollapsed}
    >
      <HouseholdModule
        locale={app.locale}
        mode="new"
        onLocaleChange={app.setLocale}
        user={app.user}
        localities={app.localities}
        selectedLocalityCode={app.selectedLocalityCode}
        onFormScrollOffsetChange={handleFormScrollOffsetChange}
        onDataSynced={app.refreshLocalities}
      />
    </FieldAppShell>
  );
}
