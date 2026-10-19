export type FormElementTranslation = { title?: string; description?: string; choices?: Record<string, string> };
export type FormTranslations = Record<string, FormElementTranslation>;
export type FormTextElement = {
  name: string; type?: string; title: string; description: string;
  page_name?: string; page_title?: string; source_code?: string; order?: number; section_order?: number;
  kind?: string; choices: Array<{ value: string; text: string }>;
};
export function flattenFormText(form: Record<string, unknown>): FormTextElement[];
export function extractFormTextTranslations(form: Record<string, unknown>, locale: string): FormTranslations;
export function applyFormTextTranslations(form: Record<string, unknown>, locale: string, translations: FormTranslations, sourceForm?: Record<string, unknown>): Record<string, unknown>;
