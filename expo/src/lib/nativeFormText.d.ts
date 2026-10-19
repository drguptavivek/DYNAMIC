export const NATIVE_FORM_TEXT: Record<string, Record<string, string>>;
export function getNativeFormText(surveyOrForm: unknown, key: string, fallback?: string, locale?: string): string;
export function formatNativeFormText(surveyOrForm: unknown, key: string, fallback: string, values: Record<string, unknown>, locale?: string): string;
export const NATIVE_QUESTION_TITLE_OVERRIDES: Record<string, string>;
export const NATIVE_QUESTION_TITLE_KEYS: Record<string, string[]>;
