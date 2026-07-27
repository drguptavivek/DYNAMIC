/** Provides a native language selector that updates the active Survey Core locale. */
import React from "react";

import { LanguageToggle } from "../LanguageToggle.js";

export function RendererLanguageSwitcher({ locale, onChange }) {
  return <LanguageToggle locale={locale} onChange={onChange} />;
}
