import { Router, Request, Response } from "express";
import { eq, and, ilike, or, desc, lte, not, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";
import { appendAreaScopeCondition } from "../lib/areaScope";

const router = Router();

/**
 * GET /api/v1/tasks
 * List follow-up tasks with filtering and pagination
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      site_id: siteIdStr,
      locality_code,
      task_type: taskType,
      status: statusQuery,
      subject_id: subjectId,
      overdue: overdueStr,
      page: pageStr,
      per_page: perPageStr,
    } = req.query;

    const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;
    const { page, perPage, offset } = getPagination({
      page: pageStr,
      per_page: perPageStr,
    });

    const conditions: any[] = [];

    if (siteId !== undefined) {
      conditions.push(eq(schema.followUpTasks.site_id, siteId));
    }

    if (locality_code) {
      conditions.push(eq(schema.followUpTasks.locality_code, locality_code as string));
    }

    if (taskType) {
      conditions.push(eq(schema.followUpTasks.task_type, taskType as string));
    }

    if (subjectId) {
      conditions.push(eq(schema.followUpTasks.subject_id, subjectId as string));
    }

    // Handle multiple status values
    if (statusQuery) {
      const statuses = (Array.isArray(statusQuery) ? statusQuery : [statusQuery])
        .flatMap((value) => String(value).split(",").map((item) => item.trim()))
        .filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(inArray(schema.followUpTasks.status, statuses as string[]));
      }
    }

    // Handle overdue filter
    if (overdueStr === "true") {
      const today = new Date().toISOString().split("T")[0];
      conditions.push(
        and(
          lte(schema.followUpTasks.deadline_date, today),
          not(
            inArray(schema.followUpTasks.status, [
              "completed_on_time",
              "completed_late",
              "missed",
              "cancelled",
              "superseded",
            ]),
          ),
        )!,
      );
    }
    await appendAreaScopeCondition(req.user!, schema.followUpTasks, conditions);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.followUpTasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    // Get paginated results
    const tasks = await db
      .select()
      .from(schema.followUpTasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(schema.followUpTasks.target_date)
      .limit(perPage)
      .offset(offset);

    sendSuccess(res, tasks, 200, { total, page, per_page: perPage });
  } catch (error) {
    console.error("List tasks error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/tasks/:id
 * Get task by ID
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;

    const conditions = [eq(schema.followUpTasks.task_id, taskId)];
    await appendAreaScopeCondition(req.user!, schema.followUpTasks, conditions);

    const [task] = await db
      .select()
      .from(schema.followUpTasks)
      .where(and(...conditions));

    if (!task) {
      sendError(res, 404, "TASK_NOT_FOUND", "Task not found");
      return;
    }

    sendSuccess(res, task);
  } catch (error) {
    console.error("Get task error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/tasks/:id/attempts
 * Get task attempts
 */
router.get("/:id/attempts", requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;

    const conditions = [eq(schema.followUpTasks.task_id, taskId)];
    await appendAreaScopeCondition(req.user!, schema.followUpTasks, conditions);

    const [task] = await db
      .select({ task_id: schema.followUpTasks.task_id })
      .from(schema.followUpTasks)
      .where(and(...conditions));

    if (!task) {
      sendError(res, 404, "TASK_NOT_FOUND", "Task not found");
      return;
    }

    const attempts = await db
      .select()
      .from(schema.taskAttempts)
      .where(eq(schema.taskAttempts.task_id, taskId))
      .orderBy(schema.taskAttempts.attempt_number);

    sendSuccess(res, attempts);
  } catch (error) {
    console.error("Get task attempts error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

export default router;
