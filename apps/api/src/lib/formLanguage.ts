import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import {
  FormMetadata,
  FormVersionManifestEntry,
  FormWithJson,
  getAllFormMetadata,
  getFormJson,
  getLatestFormMetadata,
} from "./formCatalog";

export const SUPPORTED_FORM_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "kn", label: "Kannada" },
  { code: "mr", label: "Marathi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
] as const;

type TranslationChoiceMap = Record<string, string>;

export type FormElementTranslation = {
  title?: string;
  description?: string;
  choices?: TranslationChoiceMap;
};

export type FormTranslations = Record<string, FormElementTranslation>;

export type FlattenedFormElement = {
  name: string;
  type?: string;
  title: string;
  description: string;
  choices: Array<{ value: string; text: string }>;
};

function normalizeFormCode(formCode: string): string {
  return String(formCode || "").trim().toUpperCase();
}

function normalizeLanguageCode(languageCode: string): string {
  return String(languageCode || "").trim().toLowerCase();
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function localizedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const text = value as Record<string, unknown>;
    const direct = text.default ?? text.en ?? text.english;
    return typeof direct === "string" ? direct : "";
  }
  return "";
}

function selectedLocalizedText(value: unknown, languageCode?: string): string {
  const normalizedLanguage = normalizeLanguageCode(languageCode || "");
  if (!normalizedLanguage) return "";
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const text = value as Record<string, unknown>;
  const direct = text[normalizedLanguage] ?? text[normalizedLanguage.toLowerCase()];
  if (typeof direct === "string") return direct;

  const languageLabel = SUPPORTED_FORM_LANGUAGES.find((language) => language.code === normalizedLanguage)?.label;
  const labelValue = languageLabel ? text[languageLabel] ?? text[languageLabel.toLowerCase()] : undefined;
  return typeof labelValue === "string" ? labelValue : "";
}

function ensureLocalizedObject(value: unknown): Record<string, string> {
  if (typeof value === "string") return { default: value };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, string>) };
  }
  return { default: "" };
}

function normalizeTranslations(value: unknown): FormTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const result: FormTranslations = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const normalized: FormElementTranslation = {};
    if (typeof item.title === "string" && item.title.trim()) {
      normalized.title = item.title.trim();
    }
    if (typeof item.description === "string" && item.description.trim()) {
      normalized.description = item.description.trim();
    }
    if (item.choices && typeof item.choices === "object" && !Array.isArray(item.choices)) {
      const choices: TranslationChoiceMap = {};
      for (const [choiceValue, choiceText] of Object.entries(item.choices as Record<string, unknown>)) {
        if (typeof choiceText === "string" && choiceText.trim()) {
          choices[String(choiceValue)] = choiceText.trim();
        }
      }
      if (Object.keys(choices).length > 0) normalized.choices = choices;
    }
    if (Object.keys(normalized).length > 0) result[name] = normalized;
  }

  return result;
}

function iterateElements(items: unknown[], visit: (element: Record<string, unknown>) => void): void {
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const element = item as Record<string, unknown>;
    visit(element);

    for (const nestedKey of ["elements", "templateElements", "columns", "rows"]) {
      const nested = element[nestedKey];
      if (Array.isArray(nested)) iterateElements(nested, visit);
    }
  }
}

function applyTranslationToChoice(choice: unknown, languageCode: string, text: string): void {
  if (!choice || typeof choice !== "object") return;
  const choiceObj = choice as Record<string, unknown>;
  choiceObj.text = {
    ...ensureLocalizedObject(choiceObj.text ?? String(choiceObj.value ?? "")),
    [languageCode]: text,
  };
}

export function applyTranslationsToFormJson(
  formJson: Record<string, unknown>,
  languageCode: string,
  translations: FormTranslations,
): Record<string, unknown> {
  if (!languageCode || Object.keys(translations).length === 0) return cloneJson(formJson);

  const nextJson = cloneJson(formJson);
  const pages = Array.isArray(nextJson.pages) ? nextJson.pages : [];

  iterateElements(pages, (element) => {
    const name = typeof element.name === "string" ? element.name : "";
    if (!name) return;
    const translation = translations[name];
    if (!translation) return;

    if (translation.title) {
      element.title = {
        ...ensureLocalizedObject(element.title ?? name),
        [languageCode]: translation.title,
      };
    }

    if (translation.description) {
      element.description = {
        ...ensureLocalizedObject(element.description ?? ""),
        [languageCode]: translation.description,
      };
    }

    if (translation.choices && Array.isArray(element.choices)) {
      for (const choice of element.choices) {
        const value =
          choice && typeof choice === "object"
            ? String((choice as Record<string, unknown>).value ?? "")
            : String(choice ?? "");
        const choiceTranslation = translation.choices[value];
        if (choiceTranslation) applyTranslationToChoice(choice, languageCode, choiceTranslation);
      }
    }
  });

  return nextJson;
}

export function flattenFormElements(
  formJson: Record<string, unknown>,
): FlattenedFormElement[] {
  const elements: FlattenedFormElement[] = [];
  const pages = Array.isArray(formJson.pages) ? formJson.pages : [];

  iterateElements(pages, (element) => {
    const name = typeof element.name === "string" ? element.name : "";
    if (!name) return;
    const choices = Array.isArray(element.choices)
      ? element.choices.map((choice) => {
          if (choice && typeof choice === "object") {
            const choiceObj = choice as Record<string, unknown>;
            return {
              value: String(choiceObj.value ?? ""),
              text: localizedText(choiceObj.text ?? choiceObj.value),
            };
          }
          return { value: String(choice ?? ""), text: String(choice ?? "") };
        })
      : [];

    elements.push({
      name,
      type: typeof element.type === "string" ? element.type : undefined,
      title: localizedText(element.title ?? name),
      description: localizedText(element.description),
      choices,
    });
  });

  return elements;
}

export function extractTranslationsFromFormJson(
  formJson: Record<string, unknown>,
  languageCode: string,
): FormTranslations {
  const translations: FormTranslations = {};
  const pages = Array.isArray(formJson.pages) ? formJson.pages : [];

  iterateElements(pages, (element) => {
    const name = typeof element.name === "string" ? element.name : "";
    if (!name) return;

    const translation: FormElementTranslation = {};
    const title = selectedLocalizedText(element.title, languageCode).trim();
    const description = selectedLocalizedText(element.description, languageCode).trim();
    if (title) translation.title = title;
    if (description) translation.description = description;

    if (Array.isArray(element.choices)) {
      const choices: TranslationChoiceMap = {};
      for (const choice of element.choices) {
        if (!choice || typeof choice !== "object") continue;
        const choiceObj = choice as Record<string, unknown>;
        const value = String(choiceObj.value ?? "");
        const text = selectedLocalizedText(choiceObj.text, languageCode).trim();
        if (value && text) choices[value] = text;
      }
      if (Object.keys(choices).length > 0) translation.choices = choices;
    }

    if (Object.keys(translation).length > 0) {
      translations[name] = translation;
    }
  });

  return translations;
}

export function mergeMissingFormTranslations(
  current: FormTranslations,
  bundled: FormTranslations,
): { translations: FormTranslations; changed: boolean } {
  let changed = false;
  const merged: FormTranslations = cloneJson(current);

  for (const [name, bundledTranslation] of Object.entries(bundled)) {
    const currentTranslation = merged[name] || {};
    const nextTranslation: FormElementTranslation = { ...currentTranslation };

    if (!nextTranslation.title?.trim() && bundledTranslation.title?.trim()) {
      nextTranslation.title = bundledTranslation.title.trim();
      changed = true;
    }

    if (!nextTranslation.description?.trim() && bundledTranslation.description?.trim()) {
      nextTranslation.description = bundledTranslation.description.trim();
      changed = true;
    }

    for (const [choiceValue, choiceText] of Object.entries(bundledTranslation.choices || {})) {
      if (!choiceText.trim()) continue;
      const nextChoices = nextTranslation.choices || {};
      if (!nextChoices[choiceValue]?.trim()) {
        nextTranslation.choices = {
          ...nextChoices,
          [choiceValue]: choiceText.trim(),
        };
        changed = true;
      }
    }

    if (Object.keys(nextTranslation).length > 0) {
      merged[name] = nextTranslation;
    }
  }

  return { translations: merged, changed };
}

export async function getStoredTranslations(
  siteId: number | undefined,
  formCode: string,
  languageCode: string,
): Promise<FormTranslations> {
  if (!siteId) return {};

  const [row] = await db
    .select({ translations_json: schema.formLanguageTranslations.translations_json })
    .from(schema.formLanguageTranslations)
    .where(
      and(
        eq(schema.formLanguageTranslations.site_id, siteId),
        eq(schema.formLanguageTranslations.form_code, normalizeFormCode(formCode)),
        eq(schema.formLanguageTranslations.language_code, normalizeLanguageCode(languageCode)),
      ),
    );

  return normalizeTranslations(row?.translations_json);
}

export async function canEditFormLanguage(
  user: { sub: string; role: string; site_id?: number | null },
  siteId: number,
  formCode: string,
  languageCode: string,
): Promise<boolean> {
  if (user.role === "central_admin") return true;
  if (!user.site_id || user.site_id !== siteId) return false;
  if (user.role === "field_worker") return false;

  const [permission] = await db
    .select({ can_edit: schema.formLanguagePermissions.can_edit })
    .from(schema.formLanguagePermissions)
    .where(
      and(
        eq(schema.formLanguagePermissions.site_id, siteId),
        eq(schema.formLanguagePermissions.user_id, user.sub),
        eq(schema.formLanguagePermissions.form_code, normalizeFormCode(formCode)),
        eq(schema.formLanguagePermissions.language_code, normalizeLanguageCode(languageCode)),
      ),
    );

  return permission?.can_edit === true;
}

export async function saveFormTranslations(params: {
  siteId: number;
  formCode: string;
  languageCode: string;
  translations: unknown;
  updatedByUserId?: string;
}): Promise<FormTranslations> {
  const now = new Date();
  const formCode = normalizeFormCode(params.formCode);
  const languageCode = normalizeLanguageCode(params.languageCode);
  const translations = normalizeTranslations(params.translations);

  await db
    .insert(schema.formLanguageTranslations)
    .values({
      site_id: params.siteId,
      form_code: formCode,
      language_code: languageCode,
      translations_json: translations,
      updated_by_user_id: params.updatedByUserId,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.formLanguageTranslations.site_id,
        schema.formLanguageTranslations.form_code,
        schema.formLanguageTranslations.language_code,
      ],
      set: {
        translations_json: translations,
        updated_by_user_id: params.updatedByUserId,
        updated_at: now,
      },
    });

  return translations;
}

export async function saveFormLanguagePermission(params: {
  siteId: number;
  userId: string;
  formCode: string;
  languageCode: string;
  canEdit: boolean;
  updatedByUserId?: string;
}) {
  const now = new Date();
  const formCode = normalizeFormCode(params.formCode);
  const languageCode = normalizeLanguageCode(params.languageCode);

  await db
    .insert(schema.formLanguagePermissions)
    .values({
      site_id: params.siteId,
      user_id: params.userId,
      form_code: formCode,
      language_code: languageCode,
      can_edit: params.canEdit,
      updated_by_user_id: params.updatedByUserId,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.formLanguagePermissions.site_id,
        schema.formLanguagePermissions.user_id,
        schema.formLanguagePermissions.form_code,
        schema.formLanguagePermissions.language_code,
      ],
      set: {
        can_edit: params.canEdit,
        updated_by_user_id: params.updatedByUserId,
        updated_at: now,
      },
    });
}

export async function getEffectiveFormJson(
  code: string,
  siteId?: number,
): Promise<Record<string, unknown> | null> {
  const formJson = getFormJson(code);
  if (!formJson) return null;

  if (!siteId) return formJson;

  let effectiveJson = cloneJson(formJson);
  for (const language of SUPPORTED_FORM_LANGUAGES) {
    if (language.code === "en") continue;
    const translations = await getStoredTranslations(siteId, code, language.code);
    effectiveJson = applyTranslationsToFormJson(effectiveJson, language.code, translations);
  }

  return effectiveJson;
}

function checksumJson(json: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(json)).digest("hex");
}

export async function getEffectiveFormMetadata(
  code: string,
  siteId?: number,
): Promise<FormMetadata | null> {
  const metadata = getLatestFormMetadata(code);
  const effectiveJson = await getEffectiveFormJson(code, siteId);
  if (!metadata || !effectiveJson) return null;

  return {
    ...metadata,
    checksum: checksumJson(effectiveJson),
  };
}

export async function getAllEffectiveFormMetadata(siteId?: number): Promise<FormMetadata[]> {
  const bundledForms = getAllFormMetadata();
  const forms = await Promise.all(
    bundledForms.map((form) => getEffectiveFormMetadata(form.form_code, siteId)),
  );
  return forms.filter((form): form is FormMetadata => form !== null);
}

export async function getEffectiveFormVersionManifest(
  siteId?: number,
): Promise<FormVersionManifestEntry[]> {
  return (await getAllEffectiveFormMetadata(siteId)).map(({ form_code, version, checksum }) => ({
    form_code,
    version,
    checksum,
  }));
}

export async function getRequestedEffectiveFormsWithJson(
  codes: string[],
  siteId?: number,
): Promise<FormWithJson[]> {
  const forms = await Promise.all(
    codes.map(async (code) => {
      const metadata = await getEffectiveFormMetadata(code, siteId);
      const json = await getEffectiveFormJson(code, siteId);

      if (!metadata || !json) return null;

      return {
        ...metadata,
        json,
      };
    }),
  );
  return forms.filter((form): form is FormWithJson => form !== null);
}

export async function listFormLanguagePermissions() {
  return db
    .select()
    .from(schema.formLanguagePermissions)
    .orderBy(
      schema.formLanguagePermissions.site_id,
      schema.formLanguagePermissions.user_id,
      schema.formLanguagePermissions.form_code,
      schema.formLanguagePermissions.language_code,
    );
}
