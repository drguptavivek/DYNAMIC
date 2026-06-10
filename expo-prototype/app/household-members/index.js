import React from "react";

import { FieldAppShell } from "../../src/shell/FieldAppShell.js";
import { useFieldApp } from "../../src/shell/FieldAppProvider.js";
import { HouseholdMembersModule } from "../../src/modules/households/HouseholdMembersModule.js";

export default function HouseholdMembersRoute() {
  const app = useFieldApp();
  return (
    <FieldAppShell route={{ view: "householdMembers" }} title="Household Members">
      <HouseholdMembersModule selectedLocalityCode={app.selectedLocalityCode} />
    </FieldAppShell>
  );
}
