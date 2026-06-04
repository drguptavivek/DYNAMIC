import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";

const router = Router();

/**
 * GET /api/v1/data-quality-flags
 * List data quality flags with filtering and pagination
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      flag_type: flagType,
      severity,
      status,
      site_id: siteIdStr,
      page: pageStr,
      per_page: perPageStr,
    } = req.query;

    const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;
    const { page, perPage, offset } = getPagination({
      page: pageStr,
      per_page: perPageStr,
    });

    const conditions: any[] = [];

    if (flagType) {
      conditions.push(eq(schema.dataQualityFlags.flag_type, flagType as string));
    }

    if (severity) {
      conditions.push(eq(schema.dataQualityFlags.severity, severity as string));
    }

    if (status) {
      conditions.push(eq(schema.dataQualityFlags.status, status as string));
    }

    if (siteId !== undefined) {
      conditions.push(eq(schema.dataQualityFlags.site_id, siteId));
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.dataQualityFlags)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    // Get paginated results
    const flags = await db
      .select()
      .from(schema.dataQualityFlags)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.dataQualityFlags.created_at))
      .limit(perPage)
      .offset(offset);

    sendSuccess(res, flags, 200, { total, page, per_page: perPage });
  } catch (error) {
    console.error("List data quality flags error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/data-quality-flags/:id
 * Get data quality flag by ID
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const flagId = req.params.id;

    const [flag] = await db
      .select()
      .from(schema.dataQualityFlags)
      .where(eq(schema.dataQualityFlags.flag_id, flagId));

    if (!flag) {
      sendError(res, 404, "FLAG_NOT_FOUND", "Data quality flag not found");
      return;
    }

    sendSuccess(res, flag);
  } catch (error) {
    console.error("Get data quality flag error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

const patchFlagSchema = z.object({
  status: z.enum(["reviewed", "resolved", "escalated"]),
  review_note: z.string().optional(),
});

/**
 * PATCH /api/v1/data-quality-flags/:id
 * Update data quality flag status and review notes
 */
router.patch(
  "/:id",
  requireAuth,
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const flagId = req.params.id;
      const data = patchFlagSchema.parse(req.body);

      // Get the flag
      const [flag] = await db
        .select()
        .from(schema.dataQualityFlags)
        .where(eq(schema.dataQualityFlags.flag_id, flagId));

      if (!flag) {
        sendError(res, 404, "FLAG_NOT_FOUND", "Data quality flag not found");
        return;
      }

      const now = new Date();

      await db
        .update(schema.dataQualityFlags)
        .set({
          status: data.status,
          review_note: data.review_note,
          reviewed_by_user_id: req.user!.sub,
          reviewed_at: now,
        })
        .where(eq(schema.dataQualityFlags.flag_id, flagId));

      const [updatedFlag] = await db
        .select()
        .from(schema.dataQualityFlags)
        .where(eq(schema.dataQualityFlags.flag_id, flagId));

      sendSuccess(res, updatedFlag);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
          errors: error.errors,
        });
      } else {
        console.error("Patch data quality flag error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      }
    }
  },
);

export default router;
