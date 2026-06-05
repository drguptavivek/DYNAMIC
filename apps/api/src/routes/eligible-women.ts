import { Router, Request, Response } from "express";
import { eq, and, ilike, or, desc, sql, ne } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";

const router = Router();

/**
 * GET /api/v1/eligible-women
 * List eligible women with filtering and pagination
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      site_id: siteIdStr,
      locality_code,
      wq_status,
      tracking_status,
      tracking_eligible,
      current_eligibility_status,
      search,
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
      conditions.push(eq(schema.eligibleWomen.site_id, siteId));
    }

    if (locality_code) {
      conditions.push(eq(schema.eligibleWomen.locality_code, locality_code as string));
    }

    if (wq_status) {
      conditions.push(eq(schema.eligibleWomen.wq_status, wq_status as string));
    }

    if (tracking_status) {
      conditions.push(eq(schema.eligibleWomen.tracking_status, tracking_status as string));
    }

    if (tracking_eligible === "true") {
      conditions.push(eq(schema.eligibleWomen.wq_status, "completed"));
      conditions.push(ne(schema.eligibleWomen.tracking_status, "not_tracked"));
    }

    if (current_eligibility_status) {
      conditions.push(
        eq(schema.eligibleWomen.current_eligibility_status, current_eligibility_status as string),
      );
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.eligibleWomen)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    // Get paginated results with join to household_members
    const rows = await db
      .select({
        woman_id: schema.eligibleWomen.woman_id,
        household_id: schema.eligibleWomen.household_id,
        site_id: schema.eligibleWomen.site_id,
        locality_code: schema.eligibleWomen.locality_code,
        eligibility_start_date: schema.eligibleWomen.eligibility_start_date,
        wq_status: schema.eligibleWomen.wq_status,
        tracking_status: schema.eligibleWomen.tracking_status,
        current_eligibility_status: schema.eligibleWomen.current_eligibility_status,
        eligibility_basis: schema.eligibleWomen.eligibility_basis,
        member_name: schema.householdMembers.name,
        member_sex: schema.householdMembers.sex,
        date_of_birth: schema.householdMembers.date_of_birth,
        created_at: schema.eligibleWomen.created_at,
      })
      .from(schema.eligibleWomen)
      .leftJoin(
        schema.householdMembers,
        eq(schema.eligibleWomen.household_member_id, schema.householdMembers.household_member_id),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.eligibleWomen.eligibility_start_date))
      .limit(perPage)
      .offset(offset);

    if (search) {
      const searchTerm = `%${search}%`;
      const searchConditions = [
        ...conditions,
        or(
          ilike(schema.eligibleWomen.woman_id, searchTerm),
          ilike(schema.householdMembers.name, searchTerm),
        )!,
      ];

      const searchCountResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(schema.eligibleWomen)
        .leftJoin(
          schema.householdMembers,
          eq(schema.eligibleWomen.household_member_id, schema.householdMembers.household_member_id),
        )
        .where(and(...searchConditions));

      const searchTotal = searchCountResult[0]?.count || 0;

      const searchRows = await db
        .select({
          woman_id: schema.eligibleWomen.woman_id,
          household_id: schema.eligibleWomen.household_id,
          site_id: schema.eligibleWomen.site_id,
          locality_code: schema.eligibleWomen.locality_code,
          eligibility_start_date: schema.eligibleWomen.eligibility_start_date,
          wq_status: schema.eligibleWomen.wq_status,
          tracking_status: schema.eligibleWomen.tracking_status,
          current_eligibility_status: schema.eligibleWomen.current_eligibility_status,
          eligibility_basis: schema.eligibleWomen.eligibility_basis,
          member_name: schema.householdMembers.name,
          member_sex: schema.householdMembers.sex,
          date_of_birth: schema.householdMembers.date_of_birth,
          created_at: schema.eligibleWomen.created_at,
        })
        .from(schema.eligibleWomen)
        .leftJoin(
          schema.householdMembers,
          eq(schema.eligibleWomen.household_member_id, schema.householdMembers.household_member_id),
        )
        .where(and(...searchConditions))
        .orderBy(desc(schema.eligibleWomen.eligibility_start_date))
        .limit(perPage)
        .offset(offset);

      sendSuccess(res, searchRows, 200, { total: searchTotal, page, per_page: perPage });
      return;
    }

    sendSuccess(res, rows, 200, { total, page, per_page: perPage });
  } catch (error) {
    console.error("List eligible women error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/eligible-women/:id
 * Get eligible woman by ID with full details
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const womanId = req.params.id;

    const [result] = await db
      .select({
        woman_id: schema.eligibleWomen.woman_id,
        household_member_id: schema.eligibleWomen.household_member_id,
        household_id: schema.eligibleWomen.household_id,
        site_id: schema.eligibleWomen.site_id,
        locality_code: schema.eligibleWomen.locality_code,
        eligibility_start_date: schema.eligibleWomen.eligibility_start_date,
        eligibility_source_event_id: schema.eligibleWomen.eligibility_source_event_id,
        wq_status: schema.eligibleWomen.wq_status,
        tracking_status: schema.eligibleWomen.tracking_status,
        current_eligibility_status: schema.eligibleWomen.current_eligibility_status,
        eligibility_basis: schema.eligibleWomen.eligibility_basis,
        woman_permanent_id: schema.eligibleWomen.woman_permanent_id,
        analysis_eligibility_flag: schema.eligibleWomen.analysis_eligibility_flag,
        sync_status: schema.eligibleWomen.sync_status,
        created_at: schema.eligibleWomen.created_at,
        updated_at: schema.eligibleWomen.updated_at,
        member_household_member_id: schema.householdMembers.household_member_id,
        member_name: schema.householdMembers.name,
        member_sex: schema.householdMembers.sex,
        member_date_of_birth: schema.householdMembers.date_of_birth,
        member_date_of_birth_precision: schema.householdMembers.date_of_birth_precision,
        member_marital_status: schema.householdMembers.marital_status,
        member_status: schema.householdMembers.member_status,
      })
      .from(schema.eligibleWomen)
      .leftJoin(
        schema.householdMembers,
        eq(schema.eligibleWomen.household_member_id, schema.householdMembers.household_member_id),
      )
      .where(eq(schema.eligibleWomen.woman_id, womanId));

    if (!result) {
      sendError(res, 404, "ELIGIBLE_WOMAN_NOT_FOUND", "Eligible woman not found");
      return;
    }

    const response = {
      woman_id: result.woman_id,
      household_member_id: result.household_member_id,
      household_id: result.household_id,
      site_id: result.site_id,
      locality_code: result.locality_code,
      eligibility_start_date: result.eligibility_start_date,
      eligibility_source_event_id: result.eligibility_source_event_id,
      wq_status: result.wq_status,
      tracking_status: result.tracking_status,
      current_eligibility_status: result.current_eligibility_status,
      eligibility_basis: result.eligibility_basis,
      woman_permanent_id: result.woman_permanent_id,
      analysis_eligibility_flag: result.analysis_eligibility_flag,
      sync_status: result.sync_status,
      created_at: result.created_at,
      updated_at: result.updated_at,
      member: {
        household_member_id: result.member_household_member_id,
        name: result.member_name,
        sex: result.member_sex,
        date_of_birth: result.member_date_of_birth,
        date_of_birth_precision: result.member_date_of_birth_precision,
        marital_status: result.member_marital_status,
        member_status: result.member_status,
      },
    };

    sendSuccess(res, response);
  } catch (error) {
    console.error("Get eligible woman error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/eligible-women/:id/pregnancies
 * Get all pregnancies for an eligible woman
 */
router.get("/:id/pregnancies", requireAuth, async (req: Request, res: Response) => {
  try {
    const womanId = req.params.id;

    const pregnancies = await db
      .select()
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.woman_id, womanId))
      .orderBy(schema.pregnancies.pregnancy_sequence);

    sendSuccess(res, pregnancies);
  } catch (error) {
    console.error("Get eligible woman pregnancies error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/eligible-women/:id/tasks
 * Get follow-up tasks for an eligible woman
 */
router.get("/:id/tasks", requireAuth, async (req: Request, res: Response) => {
  try {
    const womanId = req.params.id;
    const { status } = req.query;

    const conditions: any[] = [
      or(eq(schema.followUpTasks.subject_id, womanId), eq(schema.followUpTasks.woman_id, womanId))!,
    ];

    if (status) {
      conditions.push(eq(schema.followUpTasks.status, status as string));
    }

    const tasks = await db
      .select()
      .from(schema.followUpTasks)
      .where(and(...conditions))
      .orderBy(schema.followUpTasks.target_date);

    sendSuccess(res, tasks);
  } catch (error) {
    console.error("Get eligible woman tasks error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

export default router;
