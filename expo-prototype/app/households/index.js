import React from "react";

import { FieldAppShell } from "../../src/shell/FieldAppShell.js";
import { useFieldApp } from "../../src/shell/FieldAppProvider.js";
import { HouseholdModule } from "../../src/modules/households/HouseholdModule.js";

export default function HouseholdsRoute() {
  const app = useFieldApp();
  return (
    <FieldAppShell route={{ view: "households", mode: "dashboard" }} title="Households">
      <HouseholdModule
        locale={app.locale}
        mode="dashboard"
        onLocaleChange={app.setLocale}
        user={app.user}
        localities={app.localities}
        selectedLocalityCode={app.selectedLocalityCode}
        onDataSynced={app.refreshLocalities}
      />
    </FieldAppShell>
  );
}
