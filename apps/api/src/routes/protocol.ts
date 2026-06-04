import { Router, Request, Response } from "express";
import { DEFAULT_PROTOCOL_CONFIG } from "@dynamic/shared-workflow";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";

const router = Router();

const KNOWN_FORM_CODES = [
  "HHQ",
  "WQ",
  "HRF",
  "PEF",
  "UF",
  "PFF",
  "POF",
  "BAF",
  "SBF",
  "NFF",
  "CDF",
];

const FORM_VERSIONS: Record<string, string> = {
  HHQ: "2026.05.09",
  WQ: "2026.05.11",
  HRF: "2026.05.13",
  PEF: "2026.05.14",
  UF: "2026.05.11",
  PFF: "2026.05.13",
  POF: "2026.05.09",
  BAF: "2026.05.11",
  SBF: "2026.05.14",
  NFF: "2026.05.11",
  CDF: "2026.05.09",
};

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
 * GET /api/v1/protocol/forms/:code/latest
 * Returns metadata for a specific form
 */
router.get("/forms/:code/latest", requireAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.params;

    if (!code || !KNOWN_FORM_CODES.includes(code.toUpperCase())) {
      return sendError(res, 404, "FORM_NOT_FOUND", `Form code ${code} not found`);
    }

    const upperCode = code.toUpperCase();
    const version = FORM_VERSIONS[upperCode];

    sendSuccess(res, {
      form_code: upperCode,
      version,
      checksum: null,
      json_url: null,
    });
  } catch (error) {
    console.error("Form metadata error:", error);
    sendError(res, 500, "FORM_METADATA_ERROR", "Error fetching form metadata");
  }
});

export default router;
