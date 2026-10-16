import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { useFieldApp } from "../src/shell/FieldAppProvider.js";
import { HdssListModule } from "../src/modules/households/HdssListModule.js";

export default function HdssListRoute() {
  const app = useFieldApp();
  return (
    <FieldAppShell route={{ view: "hdssList" }} title="HDSS list">
      <HdssListModule user={app.user} selectedLocalityCode={app.selectedLocalityCode} />
    </FieldAppShell>
  );
}
