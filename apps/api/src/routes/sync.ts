import { Router, Request, Response } from "express";
import { eq, and, gt, inArray, count, lte } from "drizzle-orm";
import { db, schema } from "../db";
import { JwtPayload, optionalAuth, requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { processFormResponse } from "../services/eventProcessor";
import { getEffectiveFormVersionManifest } from "../lib/formLanguage";
import { buildSyncClockMetadata } from "../lib/syncClock";
import { appendAreaScopeCondition, canAccessLocation } from "../lib/areaScope";
import { runWithDb } from "../lib/dbContext";
import { getDataAccessProfile, requireDataAccess } from "../lib/dataAccess";

const router = Router();

interface PageToken {
  since: string;
  sync_cursor?: string;
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
): { site_id?: number; locality_code?: string; household_id?: string } => {
  if (typeof householdId !== "string") return {};
  const [siteId, localityCode] = householdId.split("-");
  const parsedSiteId = Number.parseInt(siteId, 10);
  return {
    site_id: Number.isFinite(parsedSiteId) ? parsedSiteId : undefined,
    locality_code: localityCode || undefined,
    household_id: householdId,
  };
};

const resolveRecordScope = (data: any): { site_id: number; locality_code: string; household_id?: string } => {
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

  const household_id =
    typeof data.household_id === "string"
      ? data.household_id
      : typeof answers.household_id === "string"
        ? answers.household_id
        : householdScope.household_id;

  return { site_id, locality_code: String(locality_code), household_id };
};

const buildDraftContextKey = (userId: string, draft: any): string =>
  [
    userId,
    draft.form_code,
    draft.form_version || "none",
    draft.task_id || "none",
    draft.subject_type || "none",
    draft.subject_id || draft.household_id || "none",
  ].join("|");

const mapDraftForExpo = (draft: typeof schema.questionnaireDrafts.$inferSelect) => ({
  draft_id: draft.draft_id,
  form_code: draft.form_code,
  form_version: draft.form_version,
  task_id: draft.task_id,
  subject_type: draft.subject_type,
  subject_id: draft.subject_id,
  household_id: draft.household_id,
  site_id: draft.site_id,
  locality_code: draft.locality_code,
  user_id: draft.user_id,
  device_id: draft.device_id,
  json_payload: draft.json_payload,
  completion_state: draft.completion_state,
  draft_status: draft.draft_status,
  created_at: draft.client_created_at,
  updated_at: draft.client_updated_at,
});

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
  task_key: task.task_key,
  window_end: task.deadline_date,
  assigned_locality_code: task.locality_code,
  lifecycle_status: task.status,
  status: toExpoTaskStatus(task.status),
});

const toExpoFormResponseSyncStatus = (status: string | null): "synced" | "upload_error" => {
  if (["duplicate", "held_for_review", "invalid_rejected"].includes(status || "")) {
    return "upload_error";
  }
  return "synced";
};

const mapFormResponseForExpo = (response: typeof schema.formResponses.$inferSelect) => {
  const syncStatus = toExpoFormResponseSyncStatus(response.response_status);
  return {
    id: response.form_response_id,
    task_id: response.task_id,
    form_code: response.form_code,
    form_version: response.form_version,
    household_id: response.household_id,
    site_id: response.site_id,
    locality_code: response.locality_code,
    subject_type: response.subject_type,
    subject_id: response.subject_id,
    answers_json: response.answers_json,
    submitted_at: response.created_offline_at ?? response.synced_at ?? response.created_at,
    sync_status: syncStatus,
    sync_error:
      syncStatus === "upload_error"
        ? `Server classified this form as ${response.response_status || "upload_error"}`
        : null,
    sync_error_at: syncStatus === "upload_error" ? response.synced_at ?? response.created_at : null,
    device_id: response.device_id,
    created_at: response.created_at,
    updated_at: response.synced_at ?? response.created_at,
    server_response_status: response.response_status || "primary",
  };
};

const rejectUnauthorizedDevice = (res: Response, device: typeof schema.devices.$inferSelect | undefined) => {
  if (!device) {
    sendError(res, 403, "UNREGISTERED_DEVICE", "Device must be registered before sync");
    return true;
  }
  if (!device.authorized) {
    sendError(res, 403, "DEVICE_DEAUTHORIZED", "This device has been deauthorized by an administrator");
    return true;
  }
  return false;
};

async function resolveSyncPushUser(
  req: Request,
  submittedUserId: unknown,
): Promise<JwtPayload | null> {
  if (req.user) {
    if (submittedUserId !== undefined && submittedUserId !== req.user.sub) {
      return null;
    }
    return req.user;
  }
  if (typeof submittedUserId !== "string" || !submittedUserId.trim()) {
    return null;
  }

  const [user] = await db
    .select({
      user_id: schema.users.user_id,
      username: schema.users.username,
      role: schema.users.role,
      site_id: schema.users.site_id,
      active: schema.users.active,
    })
    .from(schema.users)
    .where(eq(schema.users.user_id, submittedUserId))
    .limit(1);

  if (!user || !user.active) {
    return null;
  }

  return {
    sub: user.user_id,
    username: user.username,
    role: user.role as JwtPayload["role"],
    site_id: user.site_id,
    type: "access",
  };
}

/**
 * GET /api/v1/sync/time
 * Return backend time and measured device/server delta for sync drift checks.
 */
router.get("/time", async (req: Request, res: Response) => {
  const deviceTimeUtc = req.query.device_time_utc;
  sendSuccess(res, {
    clock: buildSyncClockMetadata(typeof deviceTimeUtc === "string" ? deviceTimeUtc : undefined),
  });
});

/**
 * GET /api/v1/sync/drafts
 * Restore active mutable drafts for the authenticated user. Drafts are not evidence.
 */
router.get(
  "/drafts",
  requireAuth,
  requireDataAccess("can_access_raw_crfs"),
  async (req: Request, res: Response) => {
    try {
      const deviceId = String(req.query.device_id || "");
      if (!deviceId) {
        sendError(res, 400, "MISSING_DEVICE_ID", "Device ID is required for sync");
        return;
      }
      const [device] = deviceId
        ? await db.select().from(schema.devices).where(eq(schema.devices.device_id, deviceId)).limit(1)
        : [];
      if (rejectUnauthorizedDevice(res, device)) return;
      if (device.user_id !== req.user!.sub) {
        sendError(res, 403, "DEVICE_USER_MISMATCH", "Device is not registered to this user");
        return;
      }
      const rows = await db
        .select()
        .from(schema.questionnaireDrafts)
        .where(
          and(
            eq(schema.questionnaireDrafts.user_id, req.user!.sub),
            eq(schema.questionnaireDrafts.draft_status, "active"),
          ),
        );
      const scopedDrafts = [];
      for (const draft of rows) {
        if (await canAccessLocation(req.user!, draft.site_id, draft.locality_code, draft.household_id)) {
          scopedDrafts.push(mapDraftForExpo(draft));
        }
      }
      sendSuccess(res, { drafts: scopedDrafts });
    } catch (error) {
      console.error("Draft pull error:", error);
      sendError(res, 500, "DRAFT_PULL_ERROR", "Error pulling questionnaire drafts");
    }
  },
);

/**
 * POST /api/v1/sync/drafts
 * Back up mutable drafts without processing them as submitted form responses.
 */
router.post(
  "/drafts",
  requireAuth,
  requireDataAccess("can_access_raw_crfs"),
  async (req: Request, res: Response) => {
    try {
      const deviceId = String(req.body?.device_id || "");
      const drafts = Array.isArray(req.body?.drafts) ? req.body.drafts : null;
      if (!deviceId || !drafts) {
        return sendError(res, 400, "INVALID_DRAFT_SYNC", "Missing device_id or drafts");
      }

      const [device] = await db
        .select()
        .from(schema.devices)
        .where(eq(schema.devices.device_id, deviceId))
        .limit(1);
      if (rejectUnauthorizedDevice(res, device)) {
        return;
      }
      if (device.user_id !== req.user!.sub) {
        return sendError(res, 403, "DEVICE_USER_MISMATCH", "Device is not registered to this user");
      }

      let synced = 0;
      const errors: { id: string; error: string }[] = [];
      for (const draft of drafts) {
        const draftId = String(draft?.draft_id || "");
        try {
          if (!draftId || !draft?.form_code || draft?.user_id !== req.user!.sub) {
            throw new Error("Invalid draft identity");
          }
          const scope = resolveRecordScope({
            ...draft,
            answers_json: draft.json_payload,
          });
          if (!(await canAccessLocation(req.user!, scope.site_id, scope.locality_code, scope.household_id))) {
            throw new Error("Draft is outside the user's assigned area scope");
          }

          const clientCreatedAt = new Date(draft.created_at);
          const clientUpdatedAt = new Date(draft.updated_at);
          if (Number.isNaN(clientCreatedAt.getTime()) || Number.isNaN(clientUpdatedAt.getTime())) {
            throw new Error("Invalid draft timestamp");
          }
          const contextKey = buildDraftContextKey(req.user!.sub, draft);
          const [existing] = await db
            .select()
            .from(schema.questionnaireDrafts)
            .where(eq(schema.questionnaireDrafts.context_key, contextKey))
            .limit(1);
          if (existing && existing.client_updated_at >= clientUpdatedAt) {
            continue;
          }

          const values = {
            draft_id: existing?.draft_id || draftId,
            context_key: contextKey,
            form_code: String(draft.form_code),
            form_version: draft.form_version ? String(draft.form_version) : null,
            task_id: draft.task_id ? String(draft.task_id) : null,
            subject_type: draft.subject_type ? String(draft.subject_type) : null,
            subject_id: draft.subject_id ? String(draft.subject_id) : null,
            household_id: scope.household_id || null,
            site_id: scope.site_id,
            locality_code: scope.locality_code,
            user_id: req.user!.sub,
            device_id: deviceId,
            json_payload: draft.json_payload || {},
            completion_state: draft.completion_state || {},
            draft_status: draft.draft_status === "active" ? "active" : String(draft.draft_status || "active"),
            submitted_form_response_id: draft.submitted_form_response_id || null,
            client_created_at: existing?.client_created_at || clientCreatedAt,
            client_updated_at: clientUpdatedAt,
            server_updated_at: new Date(),
          };
          if (existing) {
            await db
              .update(schema.questionnaireDrafts)
              .set(values)
              .where(eq(schema.questionnaireDrafts.context_key, contextKey));
          } else {
            await db.insert(schema.questionnaireDrafts).values(values);
          }
          synced += 1;
        } catch (error) {
          errors.push({ id: draftId || "unknown", error: error instanceof Error ? error.message : "Invalid draft" });
        }
      }
      sendSuccess(res, { synced, errors });
    } catch (error) {
      console.error("Draft push error:", error);
      sendError(res, 500, "DRAFT_PUSH_ERROR", "Error syncing questionnaire drafts");
    }
  },
);

/**
 * GET /api/v1/sync/pull
 * Pull data for offline sync
 */
router.get(
  "/pull",
  requireAuth,
  requireDataAccess("can_access_raw_crfs"),
  async (req: Request, res: Response) => {
  try {
    const {
      site_id: siteIdStr,
      locality_codes: localityCodesStr,
      since,
      form_response_since: formResponseSince,
      page_size: pageSizeStr,
      page_token: pageTokenStr,
      include_members: includeMembersStr,
      client_time_utc: clientTimeUtc,
      device_id: deviceId,
    } = req.query;

    if (!deviceId) {
      sendError(res, 400, "MISSING_DEVICE_ID", "Device ID is required for sync");
      return;
    }

    const [pullDevice] = deviceId
      ? await db.select().from(schema.devices).where(eq(schema.devices.device_id, String(deviceId))).limit(1)
      : [];
    if (rejectUnauthorizedDevice(res, pullDevice)) return;
    if (pullDevice.user_id !== req.user!.sub) {
      sendError(res, 403, "DEVICE_USER_MISMATCH", "Device is not registered to this user");
      return;
    }

    const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;
    let localityCodes: string[] = [];
    if (localityCodesStr) {
      localityCodes = (localityCodesStr as string).split(",").map((c) => c.trim());
    }

    let pageSize = Math.min(1000, Math.max(1, parseInt(pageSizeStr as string, 10) || 500));
    const includeMembers = includeMembersStr !== "false";
    let offset = 0;
    const initialSyncCursor = new Date().toISOString();
    let syncCursor = initialSyncCursor;
    let sinceCursor = since ? (since as string) : new Date(0).toISOString();

    if (pageTokenStr) {
      try {
        const decoded = decodePageToken(pageTokenStr as string);
        sinceCursor = decoded.since;
        syncCursor = decoded.sync_cursor || initialSyncCursor;
        offset = decoded.offset;
      } catch {
        return sendError(res, 400, "INVALID_PAGE_TOKEN", "Invalid page token");
      }
    }

    const sinceDate = parseSyncCursorDate(sinceCursor);
    if (!sinceDate) {
      return sendError(res, 400, "INVALID_SYNC_CURSOR", "Invalid sync cursor");
    }
    const formResponseSinceDate = parseSyncCursorDate(
      typeof formResponseSince === "string" ? formResponseSince : sinceCursor,
    );
    if (!formResponseSinceDate) {
      return sendError(res, 400, "INVALID_FORM_RESPONSE_SYNC_CURSOR", "Invalid form response sync cursor");
    }
    const syncCursorDate = parseSyncCursorDate(syncCursor);
    if (!syncCursorDate) {
      return sendError(res, 400, "INVALID_SYNC_CURSOR", "Invalid sync cursor");
    }

    // Query each entity
    const householdConditions: any[] = [
      gt(schema.households.updated_at, sinceDate),
      lte(schema.households.updated_at, syncCursorDate),
      ...buildLocationConditions(schema.households, siteId, localityCodes),
    ];
    await appendAreaScopeCondition(req.user!, schema.households, householdConditions);

    const householdCountRows = await db
      .select({ count: count() })
      .from(schema.households)
      .where(and(...householdConditions));
    const totalHouseholds = householdCountRows[0]?.count || 0;
    const totalHouseholdBatches = Math.ceil(totalHouseholds / pageSize);

    const householdsData = await db
      .select()
      .from(schema.households)
      .where(and(...householdConditions))
      .orderBy(schema.households.household_id)
      .limit(pageSize + 1)
      .offset(offset);

    const householdsResult = householdsData.slice(0, pageSize);
    const hasMoreHouseholds = householdsData.length > pageSize;

    // Query household members only when requested. Large offline sync pulls
    // households first, then pulls members for each household page.
    const memberConditions: any[] = [
      gt(schema.householdMembers.updated_at, sinceDate),
      lte(schema.householdMembers.updated_at, syncCursorDate),
      ...buildLocationConditions(schema.householdMembers, siteId, localityCodes),
    ];
    await appendAreaScopeCondition(req.user!, schema.householdMembers, memberConditions);

    const householdMembers = includeMembers
      ? await db
          .select()
          .from(schema.householdMembers)
          .where(and(...memberConditions))
          .orderBy(schema.householdMembers.household_id, schema.householdMembers.member_number)
          .limit(pageSize)
          .offset(offset)
      : [];

    // Query eligible women
    const womenConditions: any[] = [
      gt(schema.eligibleWomen.updated_at, sinceDate),
      lte(schema.eligibleWomen.updated_at, syncCursorDate),
      ...buildLocationConditions(schema.eligibleWomen, siteId, localityCodes),
    ];
    await appendAreaScopeCondition(req.user!, schema.eligibleWomen, womenConditions);

    const eligibleWomenData = await db
      .select()
      .from(schema.eligibleWomen)
      .where(and(...womenConditions))
      .orderBy(schema.eligibleWomen.woman_id)
      .limit(pageSize)
      .offset(offset);

    // Query pregnancies
    const pregnanciesConditions: any[] = [
      gt(schema.pregnancies.updated_at, sinceDate),
      lte(schema.pregnancies.updated_at, syncCursorDate),
      ...buildLocationConditions(schema.pregnancies, siteId, localityCodes),
    ];
    await appendAreaScopeCondition(req.user!, schema.pregnancies, pregnanciesConditions);

    const pregnanciesData = await db
      .select()
      .from(schema.pregnancies)
      .where(and(...pregnanciesConditions))
      .orderBy(schema.pregnancies.pregnancy_id)
      .limit(pageSize)
      .offset(offset);

    // Query children. Children do not carry locality_code, so locality scope is
    // applied through households instead of materializing a large household_id IN list.
    const childrenBaseConditions: any[] = [
      gt(schema.children.updated_at, sinceDate),
      lte(schema.children.updated_at, syncCursorDate),
    ];
    if (localityCodes.length > 0) {
      childrenBaseConditions.push(inArray(schema.households.locality_code, localityCodes));
    } else if (siteId !== undefined) {
      childrenBaseConditions.push(eq(schema.children.site_id, siteId));
    }
    await appendAreaScopeCondition(req.user!, schema.households, childrenBaseConditions);

    const childrenData = await db
      .select({
        child_id: schema.children.child_id,
        birth_id: schema.children.birth_id,
        pregnancy_id: schema.children.pregnancy_id,
        woman_id: schema.children.woman_id,
        household_id: schema.children.household_id,
        site_id: schema.children.site_id,
        birth_rank: schema.children.birth_rank,
        birth_date: schema.children.birth_date,
        birth_status: schema.children.birth_status,
        live_birth_status: schema.children.live_birth_status,
        current_vital_status: schema.children.current_vital_status,
        death_date: schema.children.death_date,
        gestational_age_at_birth: schema.children.gestational_age_at_birth,
        sex: schema.children.sex,
        birth_weight_grams: schema.children.birth_weight_grams,
        source_event_id: schema.children.source_event_id,
        sync_status: schema.children.sync_status,
        created_at: schema.children.created_at,
        updated_at: schema.children.updated_at,
      })
      .from(schema.children)
      .innerJoin(schema.households, eq(schema.children.household_id, schema.households.household_id))
      .where(and(...childrenBaseConditions))
      .orderBy(schema.children.child_id)
      .limit(pageSize)
      .offset(offset);

    // Query tasks
    const tasksConditions: any[] = [
      gt(schema.followUpTasks.updated_at, sinceDate),
      lte(schema.followUpTasks.updated_at, syncCursorDate),
    ];
    if (localityCodes.length > 0) {
      tasksConditions.push(inArray(schema.followUpTasks.locality_code, localityCodes));
    } else if (siteId !== undefined) {
      tasksConditions.push(eq(schema.followUpTasks.site_id, siteId));
    }
    await appendAreaScopeCondition(req.user!, schema.followUpTasks, tasksConditions);

    const tasksData = await db
      .select()
      .from(schema.followUpTasks)
      .where(and(...tasksConditions))
      .orderBy(schema.followUpTasks.task_id)
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
            .orderBy(schema.taskAttempts.task_id, schema.taskAttempts.attempt_number)
            .limit(pageSize)
            .offset(offset)
        : [];

    // Query finalized form response summaries so a freshly logged-in device can
    // show Uploaded Forms and Upload Errors after Sync Now.
    const formResponseConditions: any[] = [
      gt(schema.formResponses.created_at, formResponseSinceDate),
      lte(schema.formResponses.created_at, syncCursorDate),
      ...buildLocationConditions(schema.formResponses, siteId, localityCodes),
    ];
    await appendAreaScopeCondition(req.user!, schema.formResponses, formResponseConditions);

    const formResponsesData = await db
      .select()
      .from(schema.formResponses)
      .where(and(...formResponseConditions))
      .orderBy(schema.formResponses.created_at)
      .limit(pageSize)
      .offset(offset);

    const formVersions = await getEffectiveFormVersionManifest(req.user?.site_id ?? undefined);

    // Determine if there are more pages
    const hasMore =
      hasMoreHouseholds ||
      (includeMembers && householdMembers.length >= pageSize) ||
      eligibleWomenData.length >= pageSize ||
      pregnanciesData.length >= pageSize ||
      childrenData.length >= pageSize ||
      tasksData.length >= pageSize ||
      taskAttempts.length >= pageSize ||
      formResponsesData.length >= pageSize;

    const nextPageToken = hasMore
      ? encodePageToken({
          since: sinceCursor,
          sync_cursor: syncCursor,
          offset: offset + pageSize,
        })
      : undefined;

    sendSuccess(res, {
      clock: buildSyncClockMetadata(typeof clientTimeUtc === "string" ? clientTimeUtc : undefined),
      sync_cursor: syncCursor,
      next_page_token: nextPageToken,
      total_households: totalHouseholds,
      total_household_batches: totalHouseholdBatches,
      household_batch_number: Math.floor(offset / pageSize) + 1,
      households: householdsResult,
      household_members: householdMembers,
      eligible_women: eligibleWomenData,
      pregnancies: pregnanciesData,
      children: childrenData,
      tasks: tasksData.map(mapTaskForExpo),
      task_attempts: taskAttempts,
      form_responses: formResponsesData.map(mapFormResponseForExpo),
      protocol_config_version: "1.0.0",
      form_versions: formVersions,
    });
  } catch (error) {
    console.error("Sync pull error:", error);
    sendError(res, 500, "SYNC_PULL_ERROR", "Error pulling sync data");
  }
  },
);

/**
 * POST /api/v1/sync/pull/members
 * Pull household members for a bounded household page.
 */
router.post(
  "/pull/members",
  requireAuth,
  requireDataAccess("can_access_raw_crfs"),
  async (req: Request, res: Response) => {
  try {
    const householdIds = Array.isArray(req.body?.household_ids)
      ? req.body.household_ids.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (householdIds.length === 0) {
      return sendSuccess(res, { household_members: [] });
    }
    if (householdIds.length > 500) {
      return sendError(
        res,
        400,
        "HOUSEHOLD_BATCH_TOO_LARGE",
        "At most 500 household_ids can be requested at once",
      );
    }

    const householdMembers = await db
      .select()
      .from(schema.householdMembers)
      .where(inArray(schema.householdMembers.household_id, householdIds));

    sendSuccess(res, { household_members: householdMembers });
  } catch (error) {
    console.error("Sync pull members error:", error);
    sendError(res, 500, "SYNC_PULL_MEMBERS_ERROR", "Error pulling household members");
  }
  },
);

/**
 * POST /api/v1/sync/push
 * Push data from device to backend
 */
router.post(
  "/push",
  optionalAuth,
  async (req: Request, res: Response) => {
  try {
    const { device_id: deviceId, records, client_time_utc: clientTimeUtc } = req.body;

    if (!deviceId || !Array.isArray(records)) {
      return sendError(res, 400, "INVALID_REQUEST", "Missing device_id or records");
    }

    const [device] = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.device_id, deviceId))
      .limit(1);

    if (rejectUnauthorizedDevice(res, device)) return;

    if (req.user && device.user_id !== req.user.sub) {
      return sendError(res, 403, "DEVICE_USER_MISMATCH", "Device is not registered to this user");
    }

    let accepted = 0;
    const acceptedRecords: string[] = [];
    const classifiedRecords: { id: string; status: string; error?: string }[] = [];
    const duplicates: string[] = [];
    const errors: { id: string; error: string }[] = [];
    let syncLogUserId = req.user?.sub ?? null;

    for (const record of records) {
      try {
        const { type, data } = record;
        const recordId = data?.id ?? data?.task_key ?? "unknown";
        const recordUser = await resolveSyncPushUser(req, data?.user_id);
        if (!recordUser) {
          errors.push({
            id: recordId,
            error: req.user
              ? "Submitted user_id does not match authenticated user"
              : "Missing or invalid submitted user_id",
          });
          continue;
        }

        const dataAccessProfile = await getDataAccessProfile(recordUser);
        if (!dataAccessProfile.can_access_raw_crfs) {
          errors.push({ id: recordId, error: "Submitted user does not have raw CRF access" });
          continue;
        }
        syncLogUserId ??= recordUser.sub;

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
          if (!(await canAccessLocation(recordUser, scope.site_id, scope.locality_code, scope.household_id))) {
            errors.push({ id, error: "Record is outside the user's assigned area scope" });
            continue;
          }

          await db.transaction(async (tx) =>
            runWithDb(tx as unknown as typeof db, async () => {
              await tx.insert(schema.formResponses).values({
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

              await processFormResponse(id);
              const [processedResponse] = await tx
                .select({
                  response_status: schema.formResponses.response_status,
                })
                .from(schema.formResponses)
                .where(eq(schema.formResponses.form_response_id, id))
                .limit(1);
              const responseStatus = processedResponse?.response_status || "primary";
              if (responseStatus && responseStatus !== "primary") {
                classifiedRecords.push({
                  id,
                  status: responseStatus,
                  error:
                    responseStatus === "duplicate"
                      ? "Duplicate form response held for admin review"
                      : `Form response classified as ${responseStatus}`,
                });
              }

              if (task_id) {
                await tx
                  .update(schema.followUpTasks)
                  .set({ status: "completed" })
                  .where(eq(schema.followUpTasks.task_id, task_id));
              }
            }),
          );

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

          const [task] = await db
            .select()
            .from(schema.followUpTasks)
            .where(eq(schema.followUpTasks.task_id, task_id))
            .limit(1);

          if (!task) {
            errors.push({ id, error: "Task not found for attempt" });
            continue;
          }

          if (!(await canAccessLocation(recordUser, task.site_id, task.locality_code, task.household_id))) {
            errors.push({ id, error: "Task attempt is outside the user's assigned area scope" });
            continue;
          }

          await db.transaction(async (tx) =>
            runWithDb(tx as unknown as typeof db, async () => {
              await tx.insert(schema.taskAttempts).values({
                attempt_id: id,
                task_id,
                attempt_number,
                attempted_at: attempted_at ? new Date(attempted_at) : new Date(),
                device_id: deviceId,
                attempted_by_user_id: recordUser.sub,
                outcome,
                notes,
                created_at: new Date(),
              });
            }),
          );

          accepted++;
          acceptedRecords.push(id);
        } else if (type === "domain_event") {
          const { id, event_type } = data;

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

          if (!data.form_response_id || !event_type) {
            errors.push({
              id,
              error: "Domain events must reference finalized evidence and canonical event type",
            });
            continue;
          }

          const alreadyPromoted = await db
            .select()
            .from(schema.domainEvents)
            .where(
              and(
                eq(schema.domainEvents.form_response_id, data.form_response_id),
                eq(schema.domainEvents.event_type, event_type),
              ),
            )
            .limit(1);

          if (alreadyPromoted.length > 0) {
            duplicates.push(id);
            continue;
          }

          errors.push({
            id,
            error: "Domain event does not match a server-promoted canonical event",
          });
        } else if (type === "task") {
          const { task_key, status, updated_at } = data;

          if (!task_key) {
            errors.push({ id: data.id || "unknown", error: "Missing task_key" });
            continue;
          }

          const [task] = await db
            .select()
            .from(schema.followUpTasks)
            .where(eq(schema.followUpTasks.task_key, task_key))
            .limit(1);

          if (!task) {
            errors.push({ id: task_key, error: "Task not found" });
            continue;
          }

          if (!(await canAccessLocation(recordUser, task.site_id, task.locality_code, task.household_id))) {
            errors.push({ id: task_key, error: "Task is outside the user's assigned area scope" });
            continue;
          }

          await db.transaction(async (tx) =>
            runWithDb(tx as unknown as typeof db, async () => {
              await tx
                .update(schema.followUpTasks)
                .set({
                  status,
                  updated_at: updated_at ? new Date(updated_at) : new Date(),
                })
                .where(eq(schema.followUpTasks.task_key, task_key));
            }),
          );

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
        user_id: syncLogUserId ?? device.user_id ?? "unknown",
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
      clock: buildSyncClockMetadata(clientTimeUtc),
      accepted,
      accepted_records: acceptedRecords,
      classified_records: classifiedRecords,
      duplicates,
      errors,
    });
  } catch (error) {
    console.error("Sync push error:", error);
    sendError(res, 500, "SYNC_PUSH_ERROR", "Error processing sync data");
  }
  },
);

export default router;
