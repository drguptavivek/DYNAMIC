import { getNativeFormText } from "./nativeFormText.js";
import { FINAL_SUBMISSION_POPUP_TRANSLATIONS, NATIVE_FORM_POPUP_TEXT } from "./nativeFormPopupText.js";

// Only trusted, authored templates are matched; unknown/server messages stay unchanged.
const popupTemplates = [...new Map(Object.values(NATIVE_FORM_POPUP_TEXT)
  .flatMap((texts) => Object.entries(texts)).map(([key, text]) => [key, { key, text }])).values()]
  .map(({ key, text }) => {
    const names = [];
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = escaped.replace(/\\\{([A-Za-z][A-Za-z0-9_]*)\\\}/g, (_, name) => {
      names.push(name);
      return "([\\s\\S]*?)";
    });
    return { key, text, names, regex: new RegExp(`^${pattern}$`) };
  });

export function translateFormPopupText(survey, text) {
  if (typeof text !== "string" || !text) return text;
  for (const template of popupTemplates) {
    const match = template.regex.exec(text);
    if (!match) continue;
    const fallback = FINAL_SUBMISSION_POPUP_TRANSLATIONS[survey?.locale]?.[template.key] || template.text;
    const translated = getNativeFormText(survey, template.key, fallback);
    return translated.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (token, name) => {
      const index = template.names.indexOf(name);
      return index >= 0 ? match[index + 1] : token;
    });
  }
  return text;
}

export function showFormAlert(survey, showAlert, title, message, buttons, options) {
  const translatedButtons = (buttons === undefined ? [{ text: "OK" }] : buttons)?.map((button) => ({
    ...button,
    text: translateFormPopupText(survey, button.text),
  }));
  return showAlert(
    translateFormPopupText(survey, title),
    translateFormPopupText(survey, message),
    translatedButtons,
    options,
  );
}
