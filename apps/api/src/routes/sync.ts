import { Router, Request, Response } from "express";
import { eq, and, gt, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { processFormResponse } from "../services/eventProcessor";
import { getFormVersionManifest } from "../lib/formCatalog";

const router = Router();

interface PageToken {
  since: string;
  offset: number;
}

const decodePageToken = (token: string): PageToken => {
  try {
    return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
  } catch {
    throw new Error("Invalid page token");
  }
};

const encodePageToken = (token: PageToken): string => {
  return Buffer.from(JSON.stringify(token)).toString("base64");
};

const parseSyncCursorDate = (cursor: string): Date | null => {
  const parsed = new Date(cursor);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseAnswersJson = (answersJson: unknown): Record<string, unknown> => {
  if (typeof answersJson === "string") {
    return JSON.parse(answersJson);
  }
  if (answersJson && typeof answersJson === "object") {
    return answersJson as Record<string, unknown>;
  }
  return {};
};

const parseHouseholdScope = (
  householdId: unknown,
): { site_id?: number; locality_code?: string } => {
  if (typeof householdId !== "string") return {};
  const [siteId, localityCode] = householdId.split("-");
  const parsedSiteId = Number.parseInt(siteId, 10);
  return {
    site_id: Number.isFinite(parsedSiteId) ? parsedSiteId : undefined,
    locality_code: localityCode || undefined,
  };
};

const resolveRecordScope = (data: any): { site_id: number; locality_code: string } => {
  const answers = parseAnswersJson(data.answers_json);
  const householdScope = parseHouseholdScope(data.household_id ?? answers.household_id);
  const site_id =
    typeof data.site_id === "number"
      ? data.site_id
      : typeof answers.site_id === "number"
        ? answers.site_id
        : householdScope.site_id;
  const locality_code = data.locality_code ?? answers.locality_code ?? householdScope.locality_code;

  if (site_id === undefined || !locality_code) {
    throw new Error("Missing site_id/locality_code for synced record");
  }

  return { site_id, locality_code: String(locality_code) };
};

const buildLocationConditions = (
  table: { site_id: any; locality_code: any },
  siteId: number | undefined,
  localityCodes: string[],
) => {
  if (localityCodes.length > 0) {
    return [inArray(table.locality_code, localityCodes)];
  }
  if (siteId !== undefined) {
    return [eq(table.site_id, siteId)];
  }
  return [];
};

const toExpoTaskStatus = (status: string | null): string => {
  if (!status) return "open";
  if (
    ["completed_on_time", "completed_late", "missed", "cancelled", "superseded"].includes(status)
  ) {
    return "completed";
  }
  if (["closed", "not_reachable_closed"].includes(status)) {
    return "closed";
  }
  return "open";
};

const mapTaskForExpo = (task: typeof schema.followUpTasks.$inferSelect) => ({
  ...task,
  id: task.task_id,
  window_end: task.deadline_date,
  assigned_locality_code: task.locality_code,
  status: toExpoTaskStatus(task.status),
});

/**
 * GET /api/v1/sync/pull
 * Pull data for offline sync
 */
router.get("/pull", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      site_id: siteIdStr,
      locality_codes: localityCodesStr,
      since,
      page_size: pageSizeStr,
      page_token: pageTokenStr,
    } = req.query;

    const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;
    let localityCodes: string[] = [];
    if (localityCodesStr) {
      localityCodes = (localityCodesStr as string).split(",").map((c) => c.trim());
    }

    let pageSize = Math.min(1000, Math.max(1, parseInt(pageSizeStr as string, 10) || 500));
    let offset = 0;
    const initialSyncCursor = new Date().toISOString();
    let sinceCursor = since ? (since as string) : new Date(0).toISOString();

    if (pageTokenStr) {
      try {
        const decoded = decodePageToken(pageTokenStr as string);
        sinceCursor = decoded.since;
        offset = decoded.offset;
      } catch {
        return sendError(res, 400, "INVALID_PAGE_TOKEN", "Invalid page token");
      }
    }

    const sinceDate = parseSyncCursorDate(sinceCursor);
    if (!sinceDate) {
      return sendError(res, 400, "INVALID_SYNC_CURSOR", "Invalid sync cursor");
    }
    const syncCursorSince = since || pageTokenStr ? sinceCursor : initialSyncCursor;
    const scopedHouseholdRows =
      localityCodes.length > 0 || siteId !== undefined
        ? await db
            .select({ household_id: schema.households.household_id })
            .from(schema.households)
            .where(and(...buildLocationConditions(schema.households, siteId, localityCodes)))
        : [];
    const scopedHouseholdIds = scopedHouseholdRows.map((row) => row.household_id);

    // Query each entity
    const householdConditions: any[] = [
      gt(schema.households.updated_at, sinceDate),
      ...buildLocationConditions(schema.households, siteId, localityCodes),
    ];

    const householdsData = await db
      .select()
      .from(schema.households)
      .where(and(...householdConditions))
      .limit(pageSize + 1)
      .offset(offset);

    const householdsResult = householdsData.slice(0, pageSize);
    const hasMoreHouseholds = householdsData.length > pageSize;

    // Query household members
    const membersConditions: any[] = [
      gt(schema.householdMembers.updated_at, sinceDate),
      ...buildLocationConditions(schema.householdMembers, siteId, localityCodes),
    ];

    const householdMembers = await db
      .select()
      .from(schema.householdMembers)
      .where(and(...membersConditions))
      .limit(pageSize)
      .offset(offset);

    // Query eligible women
    const womenConditions: any[] = [
      gt(schema.eligibleWomen.updated_at, sinceDate),
      ...buildLocationConditions(schema.eligibleWomen, siteId, localityCodes),
    ];

    const eligibleWomenData = await db
      .select()
      .from(schema.eligibleWomen)
      .where(and(...womenConditions))
      .limit(pageSize)
      .offset(offset);

    // Query pregnancies
    const pregnanciesConditions: any[] = [
      gt(schema.pregnancies.updated_at, sinceDate),
      ...buildLocationConditions(schema.pregnancies, siteId, localityCodes),
    ];

    const pregnanciesData = await db
      .select()
      .from(schema.pregnancies)
      .where(and(...pregnanciesConditions))
      .limit(pageSize)
      .offset(offset);

    // Query children
    const childrenConditions: any[] = [gt(schema.children.updated_at, sinceDate)];
    if (localityCodes.length > 0) {
      if (scopedHouseholdIds.length > 0) {
        childrenConditions.push(inArray(schema.children.household_id, scopedHouseholdIds));
      } else {
        childrenConditions.push(eq(schema.children.household_id, "__no_matching_household__"));
      }
    } else if (siteId !== undefined) {
      childrenConditions.push(eq(schema.children.site_id, siteId));
    }

    const childrenData = await db
      .select()
      .from(schema.children)
      .where(and(...childrenConditions))
      .limit(pageSize)
      .offset(offset);

    // Query tasks
    const tasksConditions: any[] = [gt(schema.followUpTasks.updated_at, sinceDate)];
    if (localityCodes.length > 0) {
      tasksConditions.push(inArray(schema.followUpTasks.locality_code, localityCodes));
    } else if (siteId !== undefined) {
      tasksConditions.push(eq(schema.followUpTasks.site_id, siteId));
    }

    const tasksData = await db
      .select()
      .from(schema.followUpTasks)
      .where(and(...tasksConditions))
      .limit(pageSize)
      .offset(offset);

    // Query task attempts
    const taskIds = tasksData.map((t) => t.task_id);
    const taskAttempts =
      taskIds.length > 0
        ? await db
            .select()
            .from(schema.taskAttempts)
            .where(inArray(schema.taskAttempts.task_id, taskIds))
            .limit(pageSize)
            .offset(offset)
        : [];

    const formVersions = getFormVersionManifest();

    // Determine if there are more pages
    const hasMore =
      hasMoreHouseholds ||
      householdMembers.length >= pageSize ||
      eligibleWomenData.length >= pageSize ||
      pregnanciesData.length >= pageSize ||
      childrenData.length >= pageSize ||
      tasksData.length >= pageSize ||
      taskAttempts.length >= pageSize;

    const syncCursor = syncCursorSince;

    const nextPageToken = hasMore
      ? encodePageToken({
          since: sinceCursor,
          offset: offset + pageSize,
        })
      : undefined;

    sendSuccess(res, {
      sync_cursor: syncCursor,
      next_page_token: nextPageToken,
      households: householdsResult,
      household_members: householdMembers,
      eligible_women: eligibleWomenData,
      pregnancies: pregnanciesData,
      children: childrenData,
      tasks: tasksData.map(mapTaskForExpo),
      task_attempts: taskAttempts,
      protocol_config_version: "1.0.0",
      form_versions: formVersions,
    });
  } catch (error) {
    console.error("Sync pull error:", error);
    sendError(res, 500, "SYNC_PULL_ERROR", "Error pulling sync data");
  }
});

/**
 * POST /api/v1/sync/push
 * Push data from device to backend
 */
router.post("/push", requireAuth, async (req: Request, res: Response) => {
  try {
    const { device_id: deviceId, records } = req.body;

    if (!deviceId || !Array.isArray(records)) {
      return sendError(res, 400, "INVALID_REQUEST", "Missing device_id or records");
    }

    let accepted = 0;
    const acceptedRecords: string[] = [];
    const duplicates: string[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const record of records) {
      try {
        const { type, data } = record;

        if (type === "form_response") {
          const {
            id,
            task_id,
            form_code,
            form_version,
            answers_json,
            prefill_snapshot_json,
            submitted_at,
          } = data;

          if (!id) {
            errors.push({ id: "unknown", error: "Missing form_response id" });
            continue;
          }

          // Check if already exists
          const existing = await db
            .select()
            .from(schema.formResponses)
            .where(eq(schema.formResponses.response_id, id))
            .limit(1);

          if (existing.length > 0) {
            duplicates.push(id);
            continue;
          }

          const scope = resolveRecordScope(data);

          // Insert form response
          await db.insert(schema.formResponses).values({
            form_response_id: id,
            response_id: id,
            site_id: scope.site_id,
            locality_code: scope.locality_code,
            household_id: data.household_id,
            visit_id: data.visit_id,
            task_id,
            form_code,
            form_version,
            subject_type: data.subject_type,
            subject_id: data.subject_id,
            prefill_snapshot_json,
            answers_json,
            created_offline_at: submitted_at ? new Date(submitted_at) : new Date(),
            device_id: deviceId,
            synced_at: new Date(),
            created_at: new Date(),
          });

          try {
            await processFormResponse(id);
          } catch (promotionError) {
            await db
              .delete(schema.formResponses)
              .where(eq(schema.formResponses.response_id, id));
            throw promotionError;
          }

          // Update task status to completed if provided
          if (task_id) {
            await db
              .update(schema.followUpTasks)
              .set({ status: "completed" })
              .where(eq(schema.followUpTasks.task_id, task_id));
          }

          accepted++;
          acceptedRecords.push(id);
        } else if (type === "task_attempt") {
          const { id, task_id, attempt_number, outcome, notes, attempted_at } = data;

          if (!id) {
            errors.push({ id: "unknown", error: "Missing task_attempt id" });
            continue;
          }

          // Check if already exists
          const existing = await db
            .select()
            .from(schema.taskAttempts)
            .where(eq(schema.taskAttempts.attempt_id, id))
            .limit(1);

          if (existing.length > 0) {
            duplicates.push(id);
            continue;
          }

          await db.insert(schema.taskAttempts).values({
            attempt_id: id,
            task_id,
            attempt_number,
            attempted_at: attempted_at ? new Date(attempted_at) : new Date(),
            device_id: deviceId,
            outcome,
            notes,
            created_at: new Date(),
          });

          accepted++;
          acceptedRecords.push(id);
        } else if (type === "domain_event") {
          const { id, event_type, site_id, locality_code, event_datetime } = data;

          if (!id) {
            errors.push({ id: "unknown", error: "Missing domain_event id" });
            continue;
          }

          // Check if already exists
          const existing = await db
            .select()
            .from(schema.domainEvents)
            .where(eq(schema.domainEvents.event_id, id))
            .limit(1);

          if (existing.length > 0) {
            duplicates.push(id);
            continue;
          }

          const scope = resolveRecordScope(data);

          await db.insert(schema.domainEvents).values({
            event_id: id,
            event_type,
            site_id: site_id ?? scope.site_id,
            locality_code: locality_code ?? scope.locality_code,
            household_id: data.household_id,
            subject_type: data.subject_type,
            subject_id: data.subject_id,
            visit_id: data.visit_id,
            task_id: data.task_id,
            form_response_id: data.form_response_id,
            event_datetime: event_datetime ? new Date(event_datetime) : new Date(),
            created_offline_at: data.created_offline_at
              ? new Date(data.created_offline_at)
              : undefined,
            device_id: deviceId,
            created_at: new Date(),
          });

          accepted++;
          acceptedRecords.push(id);
        } else if (type === "task") {
          const { task_key, status, updated_at } = data;

          if (!task_key) {
            errors.push({ id: data.id || "unknown", error: "Missing task_key" });
            continue;
          }

          await db
            .update(schema.followUpTasks)
            .set({
              status,
              updated_at: updated_at ? new Date(updated_at) : new Date(),
            })
            .where(eq(schema.followUpTasks.task_key, task_key));

          accepted++;
          acceptedRecords.push(task_key);
        } else {
          errors.push({
            id: data?.id || "unknown",
            error: `Unsupported sync record type: ${type}`,
          });
        }
      } catch (recordError) {
        errors.push({
          id: record.data?.id || "unknown",
          error: recordError instanceof Error ? recordError.message : "Unknown error",
        });
      }
    }

    // Log sync event
    try {
      await db.insert(schema.syncLogs).values({
        sync_log_id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        device_id: deviceId,
        user_id: req.user!.sub,
        direction: "push",
        records_sent: accepted + errors.length,
        records_received: accepted,
        conflicts_detected: duplicates.length,
        started_at: new Date(),
        completed_at: new Date(),
        status: errors.length > 0 ? "partial_success" : "success",
      });
    } catch (logError) {
      errors.push({
        id: "sync_log",
        error: logError instanceof Error ? logError.message : "Failed to write sync log",
      });
    }

    sendSuccess(res, {
      accepted,
      accepted_records: acceptedRecords,
      duplicates,
      errors,
    });
  } catch (error) {
    console.error("Sync push error:", error);
    sendError(res, 500, "SYNC_PUSH_ERROR", "Error processing sync data");
  }
});

export default router;
