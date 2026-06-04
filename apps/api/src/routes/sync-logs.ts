import { Router, Request, Response } from "express";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";

const router = Router();

/**
 * GET /api/v1/sync-logs
 * List sync logs with filtering and pagination
 */
router.get(
  "/",
  requireAuth,
  requireRole("central_admin", "site_research_scientist", "field_supervisor"),
  async (req: Request, res: Response) => {
    try {
      const {
        device_id: deviceId,
        user_id: userId,
        status,
        from: fromStr,
        to: toStr,
        page: pageStr,
        per_page: perPageStr,
      } = req.query;

      const { page, perPage, offset } = getPagination({
        page: pageStr,
        per_page: perPageStr,
      });

      const conditions: any[] = [];

      if (deviceId) {
        conditions.push(eq(schema.syncLogs.device_id, deviceId as string));
      }

      if (userId) {
        conditions.push(eq(schema.syncLogs.user_id, userId as string));
      }

      if (status) {
        conditions.push(eq(schema.syncLogs.status, status as string));
      }

      // Handle date range filtering
      if (fromStr) {
        const fromDate = new Date(fromStr as string);
        conditions.push(gte(schema.syncLogs.started_at, fromDate));
      }

      if (toStr) {
        const toDate = new Date(toStr as string);
        // Set to end of day
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.syncLogs.started_at, toDate));
      }

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(schema.syncLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count || 0;

      // Get paginated results
      const logs = await db
        .select()
        .from(schema.syncLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.syncLogs.started_at))
        .limit(perPage)
        .offset(offset);

      sendSuccess(res, logs, 200, { total, page, per_page: perPage });
    } catch (error) {
      console.error("List sync logs error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

/**
 * GET /api/v1/sync-logs/:id
 * Get sync log by ID
 */
router.get(
  "/:id",
  requireAuth,
  requireRole("central_admin", "site_research_scientist", "field_supervisor"),
  async (req: Request, res: Response) => {
    try {
      const syncLogId = req.params.id;

      const [log] = await db
        .select()
        .from(schema.syncLogs)
        .where(eq(schema.syncLogs.sync_log_id, syncLogId));

      if (!log) {
        sendError(res, 404, "SYNC_LOG_NOT_FOUND", "Sync log not found");
        return;
      }

      sendSuccess(res, log);
    } catch (error) {
      console.error("Get sync log error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

export default router;
