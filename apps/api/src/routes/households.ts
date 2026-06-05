import { Router, Request, Response } from "express";
import { eq, and, ilike, or, desc, sql, inArray, ne } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";

const router = Router();

/**
 * GET /api/v1/households
 * List households with filtering and pagination
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      site_id: siteIdStr,
      locality_code,
      cohort_status,
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
      conditions.push(eq(schema.households.site_id, siteId));
    }

    if (locality_code) {
      conditions.push(eq(schema.households.locality_code, locality_code as string));
    }

    if (cohort_status) {
      conditions.push(eq(schema.households.cohort_status, cohort_status as string));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(schema.households.household_id, searchTerm),
          ilike(schema.households.household_head_name, searchTerm),
        )!,
      );
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.households)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    // Get paginated results
    const households = await db
      .select()
      .from(schema.households)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(schema.households.household_id)
      .limit(perPage)
      .offset(offset);

    const householdIds = households.map((household) => household.household_id);
    const eligibleWomen =
      householdIds.length > 0
        ? await db
            .select({
              household_id: schema.householdMembers.household_id,
              name: schema.householdMembers.name,
            })
            .from(schema.householdMembers)
            .where(
              and(
                inArray(schema.householdMembers.household_id, householdIds),
                eq(schema.householdMembers.woman_questionnaire_eligible, true),
              ),
            )
        : [];
    const pregnancyTrackingEligibleWomen =
      householdIds.length > 0
        ? await db
            .select({
              household_id: schema.eligibleWomen.household_id,
              name: schema.householdMembers.name,
            })
            .from(schema.eligibleWomen)
            .innerJoin(
              schema.householdMembers,
              eq(schema.eligibleWomen.household_member_id, schema.householdMembers.household_member_id),
            )
            .where(
              and(
                inArray(schema.eligibleWomen.household_id, householdIds),
                eq(schema.eligibleWomen.wq_status, "completed"),
                ne(schema.eligibleWomen.tracking_status, "not_tracked"),
              ),
            )
        : [];
    const eligibleWomenByHousehold = new Map<string, string[]>();
    for (const woman of eligibleWomen) {
      const names = eligibleWomenByHousehold.get(woman.household_id) || [];
      if (woman.name) names.push(woman.name);
      eligibleWomenByHousehold.set(woman.household_id, names);
    }
    const pregnancyTrackingEligibleByHousehold = new Map<string, string[]>();
    for (const woman of pregnancyTrackingEligibleWomen) {
      const names = pregnancyTrackingEligibleByHousehold.get(woman.household_id) || [];
      if (woman.name) names.push(woman.name);
      pregnancyTrackingEligibleByHousehold.set(woman.household_id, names);
    }

    sendSuccess(
      res,
      households.map((household) => ({
        ...household,
        eligible_women_names: eligibleWomenByHousehold.get(household.household_id) || [],
        pregnancy_tracking_eligible_names:
          pregnancyTrackingEligibleByHousehold.get(household.household_id) || [],
      })),
      200,
      { total, page, per_page: perPage },
    );
  } catch (error) {
    console.error("List households error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/households/:id
 * Get household by ID
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const householdId = req.params.id;

    const [household] = await db
      .select()
      .from(schema.households)
      .where(eq(schema.households.household_id, householdId));

    if (!household) {
      sendError(res, 404, "HOUSEHOLD_NOT_FOUND", "Household not found");
      return;
    }

    sendSuccess(res, household);
  } catch (error) {
    console.error("Get household error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/households/:id/members
 * Get household members
 */
router.get("/:id/members", requireAuth, async (req: Request, res: Response) => {
  try {
    const householdId = req.params.id;

    const members = await db
      .select()
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.household_id, householdId))
      .orderBy(schema.householdMembers.member_number);

    sendSuccess(res, members);
  } catch (error) {
    console.error("Get household members error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/households/:id/tasks
 * Get follow-up tasks for household
 */
router.get("/:id/tasks", requireAuth, async (req: Request, res: Response) => {
  try {
    const householdId = req.params.id;
    const { status, task_type: taskType } = req.query;

    const conditions: any[] = [eq(schema.followUpTasks.household_id, householdId)];

    if (status) {
      conditions.push(eq(schema.followUpTasks.status, status as string));
    }

    if (taskType) {
      conditions.push(eq(schema.followUpTasks.task_type, taskType as string));
    }

    const tasks = await db
      .select()
      .from(schema.followUpTasks)
      .where(and(...conditions))
      .orderBy(schema.followUpTasks.target_date);

    sendSuccess(res, tasks);
  } catch (error) {
    console.error("Get household tasks error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/households/:id/events
 * Get domain events for household
 */
router.get("/:id/events", requireAuth, async (req: Request, res: Response) => {
  try {
    const householdId = req.params.id;

    const events = await db
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.household_id, householdId))
      .orderBy(desc(schema.domainEvents.event_datetime));

    sendSuccess(res, events);
  } catch (error) {
    console.error("Get household events error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

export default router;
