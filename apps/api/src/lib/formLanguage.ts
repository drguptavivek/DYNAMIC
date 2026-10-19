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

export const GLOBAL_FORM_LANGUAGE_SITE_ID = 0;

export const SUPPORTED_FORM_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "kn", label: "Kannada" },
  { code: "mr", label: "Marathi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
] as const;

import {
  applyFormTextTranslations, extractFormTextTranslations, flattenFormText,
} from "../../../../shared/formTranslation.cjs";
import type {
  FormElementTranslation, FormTranslations, FormTextElement,
} from "../../../../shared/formTranslation.cjs";
export type { FormElementTranslation, FormTranslations };
export type FlattenedFormElement = FormTextElement;
type TranslationChoiceMap = Record<string, string>;

function normalizeFormCode(formCode: string): string {
  return String(formCode || "").trim().toUpperCase();
}

function normalizeLanguageCode(languageCode: string): string {
  return String(languageCode || "").trim().toLowerCase();
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

export const applyTranslationsToFormJson = applyFormTextTranslations;
export const flattenFormElements = flattenFormText;
export const extractTranslationsFromFormJson = extractFormTextTranslations;

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

export function reconcileFormTranslations(
  current: FormTranslations,
  bundled: FormTranslations,
  elements: FlattenedFormElement[],
): { translations: FormTranslations; changed: boolean } {
  const activeNames = new Set(elements.map((element) => element.name));
  const activeBundled = Object.fromEntries(Object.entries(bundled).filter(([name]) => activeNames.has(name)));
  return mergeMissingFormTranslations(normalizeTranslations(current), activeBundled);
}

// Accept edits only for the current inventory, retaining inactive stored evidence.
export function mergeFormTranslationEdits(
  stored: FormTranslations, incoming: FormTranslations, elements: FlattenedFormElement[],
): FormTranslations {
  const result = cloneJson(normalizeTranslations(stored));
  for (const element of elements) {
    const edit = incoming[element.name] || {};
    const next: FormElementTranslation = {};
    if (edit.title?.trim()) next.title = edit.title.trim();
    if (edit.description?.trim()) next.description = edit.description.trim();
    const activeChoices = new Set(element.choices.map((choice) => choice.value));
    const choices = Object.fromEntries(Object.entries(result[element.name]?.choices || {}).filter(([value]) => !activeChoices.has(value)));
    for (const choice of element.choices) {
      const text = edit.choices?.[choice.value]?.trim();
      if (text) choices[choice.value] = text;
    }
    if (Object.keys(choices).length) next.choices = choices;
    if (Object.keys(next).length) result[element.name] = next;
    else delete result[element.name];
  }
  return result;
}

export async function getStoredTranslations(
  _siteId: number | undefined,
  formCode: string,
  languageCode: string,
): Promise<FormTranslations> {
  const normalizedFormCode = normalizeFormCode(formCode);
  const normalizedLanguageCode = normalizeLanguageCode(languageCode);

  const rows = await db
    .select({
      site_id: schema.formLanguageTranslations.site_id,
      translations_json: schema.formLanguageTranslations.translations_json,
    })
    .from(schema.formLanguageTranslations)
    .where(
      and(
        eq(schema.formLanguageTranslations.form_code, normalizedFormCode),
        eq(schema.formLanguageTranslations.language_code, normalizedLanguageCode),
      ),
    );

  const merged: FormTranslations = {};
  for (const row of rows.sort((a, b) => {
    if (a.site_id === GLOBAL_FORM_LANGUAGE_SITE_ID) return 1;
    if (b.site_id === GLOBAL_FORM_LANGUAGE_SITE_ID) return -1;
    return a.site_id - b.site_id;
  })) {
    const rowTranslations = normalizeTranslations(row.translations_json);
    for (const [name, translation] of Object.entries(rowTranslations)) {
      merged[name] = {
        ...merged[name],
        ...translation,
        choices: {
          ...(merged[name]?.choices || {}),
          ...(translation.choices || {}),
        },
      };
      if (Object.keys(merged[name].choices || {}).length === 0) {
        delete merged[name].choices;
      }
    }
  }

  return merged;
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
      site_id: GLOBAL_FORM_LANGUAGE_SITE_ID,
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

  let effectiveJson = cloneJson(formJson);
  const nativeFormTranslations: Record<string, FormTranslations> = {};
  for (const language of SUPPORTED_FORM_LANGUAGES) {
    if (language.code === "en") continue;
    const translations = await getStoredTranslations(siteId, code, language.code);
    effectiveJson = applyTranslationsToFormJson(effectiveJson, language.code, translations);
    if (Object.keys(translations).length) nativeFormTranslations[language.code] = translations;
  }

  if (Object.keys(nativeFormTranslations).length) effectiveJson.native_form_translations = nativeFormTranslations;
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
