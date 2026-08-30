import { Router, Request, Response } from "express";
import { eq, and, desc, gte, lte, ilike, inArray, or, sql } from "drizzle-orm";
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
  requireRole("central_admin", "central_data_manager", "site_data_manager", "site_research_scientist", "field_supervisor"),
  async (req: Request, res: Response) => {
    try {
      const {
        device_id: deviceId,
        user_id: userId,
        user_name: userName,
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

      if (req.user!.role !== "central_admin" && req.user!.role !== "central_data_manager") {
        const siteIds = new Set<number>();
        if (req.user!.site_id !== null) siteIds.add(req.user!.site_id);
        const assignments = await db
          .select({ site_id: schema.userAreaAssignments.site_id })
          .from(schema.userAreaAssignments)
          .where(eq(schema.userAreaAssignments.user_id, req.user!.sub));
        assignments.forEach((assignment) => siteIds.add(assignment.site_id));
        if (siteIds.size === 0) {
          conditions.push(sql`false`);
        } else {
          const scopedUsers = await db
            .select({ user_id: schema.users.user_id })
            .from(schema.users)
            .where(inArray(schema.users.site_id, [...siteIds]));
          const userIds = scopedUsers.map((user) => user.user_id);
          conditions.push(userIds.length ? inArray(schema.syncLogs.user_id, userIds) : sql`false`);
        }
      }

      if (deviceId) {
        conditions.push(eq(schema.syncLogs.device_id, deviceId as string));
      }

      if (userId) {
        conditions.push(eq(schema.syncLogs.user_id, userId as string));
      }

      if (userName) {
        conditions.push(or(
          ilike(schema.users.username, `%${userName}%`),
          ilike(schema.users.display_name, `%${userName}%`),
        )!);
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
        .leftJoin(schema.users, eq(schema.syncLogs.user_id, schema.users.user_id))
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count || 0;

      // Get paginated results
      const logs = await db
        .select({
          sync_log_id: schema.syncLogs.sync_log_id,
          device_id: schema.syncLogs.device_id,
          user_id: schema.syncLogs.user_id,
          user_name: schema.users.display_name,
          username: schema.users.username,
          direction: schema.syncLogs.direction,
          records_sent: schema.syncLogs.records_sent,
          records_received: schema.syncLogs.records_received,
          conflicts_detected: schema.syncLogs.conflicts_detected,
          started_at: schema.syncLogs.started_at,
          completed_at: schema.syncLogs.completed_at,
          status: schema.syncLogs.status,
          error_detail: schema.syncLogs.error_detail,
        })
        .from(schema.syncLogs)
        .leftJoin(schema.users, eq(schema.syncLogs.user_id, schema.users.user_id))
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
