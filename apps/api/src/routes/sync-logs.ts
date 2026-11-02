import { Router, Request, Response } from "express";
import { eq, and, desc, gte, lt, inArray, or, sql, SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";

const router = Router();

export function syncLogFilterConditions(query: Record<string, unknown>): SQL[] {
  const text = (key: string) => {
    if (query[key] === undefined) return "";
    if (typeof query[key] !== "string") throw new Error("INVALID_SYNC_FILTER");
    return query[key].trim();
  };
  const conditions: SQL[] = [];
  const contains = (column: any, value: string) =>
    sql`${column} ilike ${`%${value.replace(/[\\%_]/g, "\\$&")}%`} escape ${"\\"}`;
  const device = text("device_id"), userId = text("user_id"), name = text("user_name");
  const direction = text("direction").toLowerCase(), status = text("status").toLowerCase();
  const from = text("from"), to = text("to");
  if (direction && !["push", "pull"].includes(direction)) throw new Error("INVALID_SYNC_FILTER");
  if (status && !["success", "partial_success", "pending", "in_progress", "completed", "failed"].includes(status)) throw new Error("INVALID_SYNC_FILTER");
  const day = (value: string) => {
    if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("INVALID_SYNC_FILTER");
    return new Date(`${value}T00:00:00+05:30`);
  };
  const start = from ? day(from) : null, end = to ? day(to) : null;
  if (start && end && start > end) throw new Error("INVALID_SYNC_FILTER");
  if (device) conditions.push(contains(schema.syncLogs.device_id, device));
  if (userId) conditions.push(eq(schema.syncLogs.user_id, userId));
  if (name) conditions.push(or(contains(schema.users.username, name), contains(schema.users.display_name, name))!);
  if (direction) conditions.push(eq(schema.syncLogs.direction, direction));
  if (status) conditions.push(eq(schema.syncLogs.status, status));
  if (start) conditions.push(gte(schema.syncLogs.started_at, start));
  if (end) conditions.push(lt(schema.syncLogs.started_at, new Date(end.getTime() + 86400000)));
  return conditions;
}

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
      const { page, perPage, offset } = getPagination({
        page: req.query.page,
        per_page: req.query.per_page,
      });

      const conditions = syncLogFilterConditions(req.query);

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
        .orderBy(desc(schema.syncLogs.started_at), desc(schema.syncLogs.sync_log_id))
        .limit(perPage)
        .offset(offset);

      sendSuccess(res, logs, 200, { total, page, per_page: perPage });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_SYNC_FILTER") {
        sendError(res, 400, "INVALID_SYNC_FILTER", "Use valid search text, direction, status and an ordered date range (IST)");
        return;
      }
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
