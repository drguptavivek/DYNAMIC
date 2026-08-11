const DRAFT_SAVED_MESSAGES = {
  default: "Form saved as draft.",
  en: "Form saved as draft.",
  hi: "फॉर्म ड्राफ्ट के रूप में सेव हो गया है।",
  kn: "ಫಾರ್ಮ್ ಡ್ರಾಫ್ಟ್ ಆಗಿ ಉಳಿಸಲಾಗಿದೆ.",
  mr: "फॉर्म मसुदा म्हणून सेव झाला आहे.",
  ta: "படிவம் வரைவு வடிவில் சேமிக்கப்பட்டது.",
  te: "ఫారం డ్రాఫ్ట్‌గా సేవ్ చేయబడింది.",
};

export function getDraftSavedMessage(locale) {
  const key = String(locale || "default").toLowerCase();
  return DRAFT_SAVED_MESSAGES[key] || DRAFT_SAVED_MESSAGES.default;
}
