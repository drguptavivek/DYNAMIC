import { Router, Request, Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, schema } from "../db";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";

const router = Router();

/**
 * GET /api/v1/form-responses
 * List form responses with filtering and pagination
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      task_id: taskId,
      form_code: formCode,
      household_id: householdId,
      sync_status: syncStatus,
      page: pageStr,
      per_page: perPageStr,
    } = req.query;

    const { page, perPage, offset } = getPagination({
      page: pageStr,
      per_page: perPageStr,
    });

    const conditions: any[] = [];

    if (taskId) {
      conditions.push(eq(schema.formResponses.task_id, taskId as string));
    }

    if (formCode) {
      conditions.push(eq(schema.formResponses.form_code, formCode as string));
    }

    if (householdId) {
      conditions.push(eq(schema.formResponses.household_id, householdId as string));
    }

    if (syncStatus) {
      // Map sync_status to response_status if needed
      conditions.push(eq(schema.formResponses.response_status, syncStatus as string));
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.formResponses)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    // Get paginated results
    const responses = await db
      .select({
        id: schema.formResponses.form_response_id,
        task_id: schema.formResponses.task_id,
        form_code: schema.formResponses.form_code,
        form_version: schema.formResponses.form_version,
        submitted_at: schema.formResponses.synced_at,
        sync_status: schema.formResponses.response_status,
        device_id: schema.formResponses.device_id,
      })
      .from(schema.formResponses)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.formResponses.created_at))
      .limit(perPage)
      .offset(offset);

    sendSuccess(res, responses, 200, { total, page, per_page: perPage });
  } catch (error) {
    console.error("List form responses error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/form-responses/:id
 * Get full form response with task summary
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const responseId = req.params.id;

    // Get form response
    const [response] = await db
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.form_response_id, responseId));

    if (!response) {
      sendError(res, 404, "FORM_RESPONSE_NOT_FOUND", "Form response not found");
      return;
    }

    // Get task summary if task_id exists
    let taskSummary = null;
    if (response.task_id) {
      const [task] = await db
        .select({
          id: schema.followUpTasks.task_id,
          task_type: schema.followUpTasks.task_type,
          target_date: schema.followUpTasks.target_date,
          household_id: schema.followUpTasks.household_id,
          subject_id: schema.followUpTasks.subject_id,
        })
        .from(schema.followUpTasks)
        .where(eq(schema.followUpTasks.task_id, response.task_id));

      taskSummary = task || null;
    }

    // Parse answers_json if stored as string
    const answers =
      typeof response.answers_json === "string"
        ? JSON.parse(response.answers_json)
        : response.answers_json;

    // Parse prefill_snapshot_json if stored as string
    const prefillSnapshot =
      typeof response.prefill_snapshot_json === "string"
        ? JSON.parse(response.prefill_snapshot_json)
        : response.prefill_snapshot_json;

    const result = {
      ...response,
      answers_json: answers,
      prefill_snapshot_json: prefillSnapshot,
      task: taskSummary,
    };

    sendSuccess(res, result);
  } catch (error) {
    console.error("Get form response error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

export default router;
