import { Router, Request, Response } from "express";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";
import { appendAreaScopeCondition } from "../lib/areaScope";

const router = Router();

/**
 * GET /api/v1/children
 * List children with filtering and pagination
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      site_id: siteIdStr,
      locality_code,
      current_vital_status,
      birth_status,
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
      conditions.push(eq(schema.children.site_id, siteId));
    }

    if (locality_code) {
      conditions.push(eq(schema.households.locality_code, locality_code as string));
    }

    if (current_vital_status) {
      conditions.push(eq(schema.children.current_vital_status, current_vital_status as string));
    }

    if (birth_status) {
      conditions.push(eq(schema.children.birth_status, birth_status as string));
    }
    await appendAreaScopeCondition(req.user!, schema.households, conditions);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.children)
      .leftJoin(schema.households, eq(schema.children.household_id, schema.households.household_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    // Get paginated results with join to pregnancies and household_members
    let baseQuery = db
      .select({
        child_id: schema.children.child_id,
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
        mother_name: schema.householdMembers.name,
        created_at: schema.children.created_at,
      })
      .from(schema.children)
      .leftJoin(schema.households, eq(schema.children.household_id, schema.households.household_id))
      .leftJoin(
        schema.pregnancies,
        eq(schema.children.pregnancy_id, schema.pregnancies.pregnancy_id),
      )
      .leftJoin(
        schema.householdMembers,
        eq(schema.pregnancies.household_member_id, schema.householdMembers.household_member_id),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    if (search) {
      const searchTerm = `%${search}%`;
      const searchConditions = [
        conditions.length > 0 ? and(...conditions) : undefined,
        or(
          ilike(schema.children.child_id, searchTerm),
          ilike(schema.children.woman_id, searchTerm),
        )!,
      ].filter(Boolean);

      const searchCountResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(schema.children)
        .leftJoin(schema.households, eq(schema.children.household_id, schema.households.household_id))
        .leftJoin(
          schema.pregnancies,
          eq(schema.children.pregnancy_id, schema.pregnancies.pregnancy_id),
        )
        .where(
          searchConditions.length === 1 ? searchConditions[0] : and(...(searchConditions as any[])),
        );

      const searchTotal = searchCountResult[0]?.count || 0;

      const rows = await db
        .select({
          child_id: schema.children.child_id,
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
          mother_name: schema.householdMembers.name,
          created_at: schema.children.created_at,
        })
        .from(schema.children)
        .leftJoin(schema.households, eq(schema.children.household_id, schema.households.household_id))
        .leftJoin(
          schema.pregnancies,
          eq(schema.children.pregnancy_id, schema.pregnancies.pregnancy_id),
        )
        .leftJoin(
          schema.householdMembers,
          eq(schema.pregnancies.household_member_id, schema.householdMembers.household_member_id),
        )
        .where(
          searchConditions.length === 1 ? searchConditions[0] : and(...(searchConditions as any[])),
        )
        .orderBy(desc(schema.children.birth_date))
        .limit(perPage)
        .offset(offset);

      sendSuccess(res, rows, 200, { total: searchTotal, page, per_page: perPage });
      return;
    }

    const rows = await baseQuery
      .orderBy(desc(schema.children.birth_date))
      .limit(perPage)
      .offset(offset);

    sendSuccess(res, rows, 200, { total, page, per_page: perPage });
  } catch (error) {
    console.error("List children error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/children/:id
 * Get child by ID with full details
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const childId = req.params.id;

    // Get child record
    const conditions = [eq(schema.children.child_id, childId)];
    await appendAreaScopeCondition(req.user!, schema.households, conditions);

    const [child] = await db
      .select()
      .from(schema.children)
      .leftJoin(schema.households, eq(schema.children.household_id, schema.households.household_id))
      .where(and(...conditions));

    if (!child) {
      sendError(res, 404, "CHILD_NOT_FOUND", "Child not found");
      return;
    }

    // Get pregnancy summary
    const [pregnancy] = await db
      .select({
        pregnancy_id: schema.pregnancies.pregnancy_id,
        enrollment_date: schema.pregnancies.enrollment_date,
        lmp_date: schema.pregnancies.lmp_date,
        edd_date: schema.pregnancies.edd_date,
      })
      .from(schema.pregnancies)
      .where(eq(schema.pregnancies.pregnancy_id, child.children.pregnancy_id));

    // Get mother info
    const [mother] = await db
      .select({
        woman_id: schema.eligibleWomen.woman_id,
        member_name: schema.householdMembers.name,
        household_id: schema.eligibleWomen.household_id,
      })
      .from(schema.eligibleWomen)
      .leftJoin(
        schema.householdMembers,
        eq(schema.eligibleWomen.household_member_id, schema.householdMembers.household_member_id),
      )
      .where(eq(schema.eligibleWomen.woman_id, child.children.woman_id));

    // Get tasks for this child
    const tasks = await db
      .select()
      .from(schema.followUpTasks)
      .where(eq(schema.followUpTasks.child_id, childId))
      .orderBy(schema.followUpTasks.target_date);

    const response = {
      ...child.children,
      pregnancy: pregnancy || null,
      mother: mother || null,
      tasks,
    };

    sendSuccess(res, response);
  } catch (error) {
    console.error("Get child detail error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

export default router;
