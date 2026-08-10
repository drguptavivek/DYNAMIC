import { Router, Request, Response } from "express";
import { DEFAULT_PROTOCOL_CONFIG } from "@dynamic/shared-workflow";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import {
  getAllEffectiveFormMetadata,
  getEffectiveFormMetadata,
  getEffectiveFormJson,
  getRequestedEffectiveFormsWithJson,
} from "../lib/formLanguage";

const router = Router();

/**
 * GET /api/v1/protocol/config
 * Returns the default protocol configuration
 */
router.get("/config", requireAuth, async (_req: Request, res: Response) => {
  try {
    sendSuccess(res, DEFAULT_PROTOCOL_CONFIG);
  } catch (error) {
    console.error("Protocol config error:", error);
    sendError(res, 500, "PROTOCOL_CONFIG_ERROR", "Error fetching protocol configuration");
  }
});

/**
 * GET /api/v1/protocol/forms
 * Returns bundled form versions and checksums for device cache comparison
 */
router.get("/forms", requireAuth, async (_req: Request, res: Response) => {
  try {
    sendSuccess(res, { forms: await getAllEffectiveFormMetadata(_req.user?.site_id ?? undefined) });
  } catch (error) {
    console.error("Forms metadata error:", error);
    sendError(res, 500, "FORMS_METADATA_ERROR", "Error fetching forms metadata");
  }
});

/**
 * GET /api/v1/protocol/forms/batch?codes=HHQ,WQ
 * Returns bundled SurveyJS JSON for requested forms
 */
router.get("/forms/batch", requireAuth, async (req: Request, res: Response) => {
  try {
    const codesParam = typeof req.query.codes === "string" ? req.query.codes : "";
    const codes = codesParam
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);

    sendSuccess(res, {
      forms: await getRequestedEffectiveFormsWithJson(codes, req.user?.site_id ?? undefined),
    });
  } catch (error) {
    console.error("Forms batch error:", error);
    sendError(res, 500, "FORMS_BATCH_ERROR", "Error fetching form batch");
  }
});

/**
 * GET /api/v1/protocol/forms/:code/latest
 * Returns metadata for a specific form; kept as an explicit latest alias
 */
router.get("/forms/:code/latest", requireAuth, async (req: Request, res: Response) => {
  try {
    const metadata = await getEffectiveFormMetadata(req.params.code, req.user?.site_id ?? undefined);

    if (!metadata) {
      return sendError(res, 404, "FORM_NOT_FOUND", `Form code ${req.params.code} not found`);
    }

    sendSuccess(res, metadata);
  } catch (error) {
    console.error("Form metadata error:", error);
    sendError(res, 500, "FORM_METADATA_ERROR", "Error fetching form metadata");
  }
});

/**
 * GET /api/v1/protocol/forms/:code/latest/json
 * Returns the latest bundled SurveyJS JSON for a specific form; legacy latest alias
 */
router.get("/forms/:code/latest/json", requireAuth, async (req: Request, res: Response) => {
  try {
    const formJson = await getEffectiveFormJson(req.params.code, req.user?.site_id ?? undefined);

    if (!formJson) {
      return sendError(res, 404, "FORM_NOT_FOUND", `Form code ${req.params.code} not found`);
    }

    sendSuccess(res, formJson);
  } catch (error) {
    console.error("Form JSON error:", error);
    sendError(res, 500, "FORM_JSON_ERROR", "Error fetching form JSON");
  }
});

/**
 * GET /api/v1/protocol/forms/:code
 * Returns the latest bundled SurveyJS JSON for a specific form
 */
router.get("/forms/:code", requireAuth, async (req: Request, res: Response) => {
  try {
    const formJson = await getEffectiveFormJson(req.params.code, req.user?.site_id ?? undefined);

    if (!formJson) {
      return sendError(res, 404, "FORM_NOT_FOUND", `Form code ${req.params.code} not found`);
    }

    sendSuccess(res, formJson);
  } catch (error) {
    console.error("Form JSON error:", error);
    sendError(res, 500, "FORM_JSON_ERROR", "Error fetching form JSON");
  }
});

export default router;
