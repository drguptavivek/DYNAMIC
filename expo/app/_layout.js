import "survey-core/survey-core.min.css";
import React from "react";
import { Stack } from "expo-router";

import { FieldAppProvider } from "../src/shell/FieldAppProvider.js";

export default function RootLayout() {
  return (
    <FieldAppProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </FieldAppProvider>
  );
}
