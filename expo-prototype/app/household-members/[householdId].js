import React from "react";
import { useLocalSearchParams } from "expo-router";

import { FieldAppShell } from "../../src/shell/FieldAppShell.js";
import { useFieldApp } from "../../src/shell/FieldAppProvider.js";
import { HouseholdMembersModule } from "../../src/modules/households/HouseholdMembersModule.js";

export default function HouseholdMembersForHouseholdRoute() {
  const app = useFieldApp();
  const { householdId } = useLocalSearchParams();
  return (
    <FieldAppShell route={{ view: "householdMembers" }} title="Household Members">
      <HouseholdMembersModule
        householdId={String(householdId || "")}
        selectedLocalityCode={app.selectedLocalityCode}
      />
    </FieldAppShell>
  );
}
