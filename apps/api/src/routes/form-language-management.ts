import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getAllFormMetadata, getFormJson, getLatestFormMetadata } from "../lib/formCatalog";
import {
  SUPPORTED_FORM_LANGUAGES,
  canEditFormLanguage,
  extractTranslationsFromFormJson,
  flattenFormElements,
  getStoredTranslations,
  listFormLanguagePermissions,
  reconcileFormTranslations,
  saveFormLanguagePermission,
  saveFormTranslations,
} from "../lib/formLanguage";

const router = Router();

const saveTranslationsSchema = z.object({
  site_id: z.number().int().positive(),
  language_code: z.string().min(2),
  translations: z.record(
    z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      choices: z.record(z.string()).optional(),
    }),
  ),
});

const permissionSchema = z.object({
  site_id: z.number().int().positive(),
  user_id: z.string().min(1),
  form_code: z.string().min(1),
  language_code: z.string().min(2),
  can_edit: z.boolean(),
});

const savePermissionsSchema = z.object({
  permissions: z.array(permissionSchema),
});

function parseSiteId(value: unknown): number | undefined {
  const siteId = Number(value);
  return Number.isInteger(siteId) && siteId > 0 ? siteId : undefined;
}

function normalizeCode(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeLanguage(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isLanguageSupported(languageCode: string): boolean {
  return SUPPORTED_FORM_LANGUAGES.some((language) => language.code === normalizeLanguage(languageCode));
}

function canViewFormLanguagePage(role: string): boolean {
  return role !== "field_worker";
}

async function getSitesForUser(user: NonNullable<Request["user"]>) {
  if (user.role === "central_admin") {
    return db
      .select({
        site_id: schema.studySites.site_id,
        site_code: schema.studySites.site_code,
        site_name: schema.studySites.site_name,
      })
      .from(schema.studySites)
      .orderBy(schema.studySites.site_id);
  }

  if (!user.site_id) return [];

  return db
    .select({
      site_id: schema.studySites.site_id,
      site_code: schema.studySites.site_code,
      site_name: schema.studySites.site_name,
    })
    .from(schema.studySites)
    .where(eq(schema.studySites.site_id, user.site_id));
}

async function getLanguagePermissionUsersForSites(siteIds: number[]) {
  if (siteIds.length === 0) return [];

  const users = await db
    .select({
      user_id: schema.users.user_id,
      username: schema.users.username,
      display_name: schema.users.display_name,
      role: schema.users.role,
      site_id: schema.users.site_id,
      active: schema.users.active,
    })
    .from(schema.users);

  return users
    .filter(
      (user) =>
        user.active !== false &&
        user.site_id != null &&
        siteIds.includes(user.site_id) &&
        user.role !== "field_worker",
    )
    .sort((a, b) => {
      const bySite = (a.site_id || 0) - (b.site_id || 0);
      if (bySite !== 0) return bySite;
      return String(a.display_name || a.username).localeCompare(String(b.display_name || b.username));
    });
}

async function assertCanAccessSite(req: Request, res: Response, siteId: number): Promise<boolean> {
  if (!req.user) {
    sendError(res, 401, "MISSING_AUTH", "Authentication required");
    return false;
  }
  if (req.user.role === "central_admin") return true;
  if (req.user.site_id === siteId) return true;
  sendError(res, 403, "SITE_SCOPE_DENIED", "You cannot manage language for this site");
  return false;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.user || !canViewFormLanguagePage(req.user.role)) {
      sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "Language management is not available for this role");
      return;
    }

    const sites = await getSitesForUser(req.user);
    const permissions = req.user.role === "central_admin" ? await listFormLanguagePermissions() : [];
    const users = await getLanguagePermissionUsersForSites(sites.map((site) => site.site_id));

    sendSuccess(res, {
      forms: getAllFormMetadata(),
      sites,
      users,
      languages: SUPPORTED_FORM_LANGUAGES,
      permissions,
      can_manage_permissions: req.user.role === "central_admin",
    });
  } catch (error) {
    console.error("Form language dashboard error:", error);
    sendError(res, 500, "FORM_LANGUAGE_ERROR", "Error loading form language management");
  }
});

router.get("/forms/:form_code", async (req: Request, res: Response) => {
  try {
    if (!req.user || !canViewFormLanguagePage(req.user.role)) {
      sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "Language management is not available for this role");
      return;
    }

    const formCode = normalizeCode(req.params.form_code);
    const siteId = parseSiteId(req.query.site_id) ?? req.user.site_id ?? undefined;
    const languageCode = normalizeLanguage(String(req.query.language_code || "hi"));

    if (!siteId) {
      sendError(res, 400, "SITE_REQUIRED", "Select a site before editing language");
      return;
    }
    if (!isLanguageSupported(languageCode)) {
      sendError(res, 400, "UNSUPPORTED_LANGUAGE", "Selected language is not supported");
      return;
    }
    if (!(await assertCanAccessSite(req, res, siteId))) return;

    const formJson = getFormJson(formCode);
    if (!formJson) {
      sendError(res, 404, "FORM_NOT_FOUND", `Form code ${formCode} not found`);
      return;
    }

    let translations = await getStoredTranslations(siteId, formCode, languageCode);
    const elements = flattenFormElements(formJson);
    const bundledTranslations = extractTranslationsFromFormJson(formJson, languageCode);
    const reconciled = reconcileFormTranslations(translations, bundledTranslations, elements);
    if (reconciled.changed) {
      translations = await saveFormTranslations({
        siteId,
        formCode,
        languageCode,
        translations: reconciled.translations,
        updatedByUserId: req.user.sub,
      });
    }
    const canEdit = await canEditFormLanguage(req.user, siteId, formCode, languageCode);
    const metadata = getLatestFormMetadata(formCode);

    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, {
      form_code: formCode,
      form_version: metadata?.version || String(formJson.version || ""),
      form_checksum: metadata?.checksum || "",
      site_id: siteId,
      language_code: languageCode,
      elements,
      translations,
      can_edit: canEdit,
    });
  } catch (error) {
    console.error("Form language detail error:", error);
    sendError(res, 500, "FORM_LANGUAGE_ERROR", "Error loading form language details");
  }
});

router.put("/forms/:form_code", async (req: Request, res: Response) => {
  try {
    if (!req.user || !canViewFormLanguagePage(req.user.role)) {
      sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "Language management is not available for this role");
      return;
    }

    const formCode = normalizeCode(req.params.form_code);
    const body = saveTranslationsSchema.parse(req.body);
    const languageCode = normalizeLanguage(body.language_code);

    if (!isLanguageSupported(languageCode)) {
      sendError(res, 400, "UNSUPPORTED_LANGUAGE", "Selected language is not supported");
      return;
    }
    if (!getFormJson(formCode)) {
      sendError(res, 404, "FORM_NOT_FOUND", `Form code ${formCode} not found`);
      return;
    }
    if (!(await assertCanAccessSite(req, res, body.site_id))) return;
    if (!(await canEditFormLanguage(req.user, body.site_id, formCode, languageCode))) {
      sendError(res, 403, "LANGUAGE_EDIT_NOT_ALLOWED", "This site does not have edit permission for this form language");
      return;
    }

    const formJson = getFormJson(formCode)!;
    const reconciled = reconcileFormTranslations(
      body.translations,
      extractTranslationsFromFormJson(formJson, languageCode),
      flattenFormElements(formJson),
    );
    const translations = await saveFormTranslations({
      siteId: body.site_id,
      formCode,
      languageCode,
      translations: reconciled.translations,
      updatedByUserId: req.user.sub,
    });

    sendSuccess(res, { form_code: formCode, site_id: body.site_id, language_code: languageCode, translations });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", { errors: error.errors });
      return;
    }
    console.error("Save form language error:", error);
    sendError(res, 500, "FORM_LANGUAGE_ERROR", "Error saving form language");
  }
});

router.put(
  "/permissions",
  requireRole("central_admin"),
  async (req: Request, res: Response) => {
    try {
      const body = savePermissionsSchema.parse(req.body);
      for (const permission of body.permissions) {
        const formCode = normalizeCode(permission.form_code);
        const languageCode = normalizeLanguage(permission.language_code);
        if (!getFormJson(formCode) || !isLanguageSupported(languageCode)) continue;
        const [targetUser] = await db
          .select({
            user_id: schema.users.user_id,
            site_id: schema.users.site_id,
            role: schema.users.role,
            active: schema.users.active,
          })
          .from(schema.users)
          .where(eq(schema.users.user_id, permission.user_id));
        if (
          !targetUser ||
          targetUser.active === false ||
          targetUser.site_id !== permission.site_id ||
          targetUser.role === "field_worker"
        ) {
          continue;
        }
        await saveFormLanguagePermission({
          siteId: permission.site_id,
          userId: permission.user_id,
          formCode,
          languageCode,
          canEdit: permission.can_edit,
          updatedByUserId: req.user?.sub,
        });
      }

      sendSuccess(res, { permissions: await listFormLanguagePermissions() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", { errors: error.errors });
        return;
      }
      console.error("Save language permissions error:", error);
      sendError(res, 500, "FORM_LANGUAGE_ERROR", "Error saving language permissions");
    }
  },
);

router.get("/permissions", requireRole("central_admin"), async (_req: Request, res: Response) => {
  try {
    sendSuccess(res, { permissions: await listFormLanguagePermissions() });
  } catch (error) {
    console.error("List language permissions error:", error);
    sendError(res, 500, "FORM_LANGUAGE_ERROR", "Error loading language permissions");
  }
});

export default router;
