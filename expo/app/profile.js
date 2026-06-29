import React from "react";

import { FieldAppShell } from "../src/shell/FieldAppShell.js";
import { useFieldApp } from "../src/shell/FieldAppProvider.js";
import { FieldWorkerProfileScreen } from "../src/modules/profile/FieldWorkerProfileScreen.js";

export default function ProfileRoute() {
  const app = useFieldApp();
  return (
    <FieldAppShell route={{ view: "profile" }} title="Profile">
      <FieldWorkerProfileScreen user={app.user} localities={app.localities} />
    </FieldAppShell>
  );
}
