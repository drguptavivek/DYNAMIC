import { Router, Request, Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, schema } from "../db";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";
import { appendAreaScopeCondition } from "../lib/areaScope";
import { requireDataAccess } from "../lib/dataAccess";
import { getEffectiveFormJson } from "../lib/formLanguage";

const router = Router();

type ExportField = { key: string; choices: Map<string, string> };

function collectExportFields(value: unknown, fields: ExportField[] = []): ExportField[] {
  if (!value || typeof value !== "object") return fields;
  const item = value as Record<string, unknown>;
  if (typeof item.name === "string" && (typeof item.type === "string" || Array.isArray(item.choices))) {
    const choices = new Map<string, string>();
    if (Array.isArray(item.choices)) {
      for (const choice of item.choices) {
        if (choice && typeof choice === "object") {
          const c = choice as Record<string, unknown>;
          if (c.value !== undefined && c.text !== undefined) {
            const text = c.text && typeof c.text === "object"
              ? (c.text as Record<string, unknown>).default ?? Object.values(c.text as Record<string, unknown>)[0]
              : c.text;
            choices.set(String(c.value), String(text ?? ""));
          }
        }
      }
    }
    const key = item.name;
    // `name` is the canonical variable_name used by Form Language Management
    // and by answers_json; sourceCode is metadata, not the answer key.
    fields.push({ key, choices });
  }
  for (const child of Object.values(item)) {
    if (Array.isArray(child)) child.forEach((entry) => collectExportFields(entry, fields));
    else if (child && typeof child === "object") collectExportFields(child, fields);
  }
  return fields;
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  let text = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Some legacy timestamp payloads contain one literal quote pair; remove it
  // before CSV escaping so Excel does not display triple quotes.
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function displayAnswer(value: unknown, key?: string): string {
  // Preserve the exact stored answer: option values remain their numeric/string
  // codes. Only the household roster itself stays structured JSON; derived
  // repeat columns are flattened for clean spreadsheet display.
  if (Array.isArray(value)) {
    if (key === "hhq_household_members") return JSON.stringify(value);
    return value.map((entry) => displayAnswer(entry)).join(", ");
  }
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([name, entry]) => `${name}: ${displayAnswer(entry)}`)
      .join("; ");
  }
  return String(value);
}

function answerForField(answers: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(answers, key)) return answers[key];

  // HHQ's renderer upgrades the legacy single-mobile field to a repeat panel;
  // export it back under the canonical language-management variable name.
  if (key === "hhq_contact_mobile" && Array.isArray(answers.hhq_contact_mobile_numbers)) {
    const numbers = answers.hhq_contact_mobile_numbers
      .map((row) => row && typeof row === "object" ? (row as Record<string, unknown>).mobile_number : undefined)
      .filter((value) => value !== undefined && value !== null && value !== "");
    return numbers.length === 1 ? numbers[0] : numbers;
  }

  // Repeated household/member answers are stored as rows inside a panel. If
  // the language definition exposes a nested variable as a column, collect
  // that variable from every stored row instead of returning a blank cell.
  const nestedValues: unknown[] = [];
  for (const value of Object.values(answers)) {
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (row && typeof row === "object" && Object.prototype.hasOwnProperty.call(row, key)) {
        nestedValues.push((row as Record<string, unknown>)[key]);
      }
    }
  }
  return nestedValues.length > 0 ? nestedValues : undefined;
}

/** Download all submitted answers for one form with raw variable values. */
router.get("/export", requireDataAccess("can_access_raw_crfs"), async (req: Request, res: Response) => {
  try {
    const formCode = typeof req.query.form_code === "string" ? req.query.form_code.trim().toUpperCase() : "";
    if (!formCode) {
      sendError(res, 400, "FORM_CODE_REQUIRED", "form_code is required for a form-wise export");
      return;
    }
    const conditions: any[] = [eq(schema.formResponses.form_code, formCode)];
    await appendAreaScopeCondition(req.user!, schema.formResponses, conditions);
    const [responses, formJson] = await Promise.all([
      db.select().from(schema.formResponses).where(and(...conditions)).orderBy(desc(schema.formResponses.created_at)),
      getEffectiveFormJson(formCode, req.user?.site_id ?? undefined),
    ]);
    if (!formJson) {
      sendError(res, 404, "FORM_NOT_FOUND", `Form code ${formCode} not found`);
      return;
    }
    const fields = collectExportFields(formJson);
    const uniqueFields = [...new Map(fields.map((field) => [field.key, field])).values()];
    const headers = ["form_response_id", "household_id", "subject_type", "subject_id", "form_version", "submitted_at", ...uniqueFields.map((field) => field.key)];
    const rows = responses.map((response) => {
      const answers = (response.answers_json || {}) as Record<string, unknown>;
      return [response.form_response_id, response.household_id, response.subject_type, response.subject_id, response.form_version, response.synced_at || response.created_at, ...uniqueFields.map((field) => displayAnswer(answerForField(answers, field.key), field.key))];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    res.status(200).set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${formCode.toLowerCase()}-form-responses.csv` }).send(`\uFEFF${csv}`);
  } catch (error) {
    console.error("Export form responses error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

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
    await appendAreaScopeCondition(req.user!, schema.formResponses, conditions);

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
router.get("/:id", requireDataAccess("can_access_raw_crfs"), async (req: Request, res: Response) => {
  try {
    const responseId = req.params.id;
    const conditions = [eq(schema.formResponses.form_response_id, responseId)];
    await appendAreaScopeCondition(req.user!, schema.formResponses, conditions);

    // Get form response
    const [response] = await db
      .select()
      .from(schema.formResponses)
      .where(and(...conditions));

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
