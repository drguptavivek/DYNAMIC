import { Router, Request, Response } from "express";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";
import { appendAreaScopeCondition } from "../lib/areaScope";
import { canAccessPii, redactFields } from "../lib/dataAccess";

const router = Router();

/**
 * GET /api/v1/pregnant-women
 * List pregnant women (with active pregnancies) with filtering and pagination
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      site_id: siteIdStr,
      locality_code,
      search,
      page: pageStr,
      per_page: perPageStr,
    } = req.query;

    const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;
    const { page, perPage, offset } = getPagination({
      page: pageStr,
      per_page: perPageStr,
    });

    const conditions: any[] = [eq(schema.pregnancies.pregnancy_status, "active")];

    if (siteId !== undefined) {
      conditions.push(eq(schema.pregnancies.site_id, siteId));
    }

    if (locality_code) {
      conditions.push(eq(schema.pregnancies.locality_code, locality_code as string));
    }
    await appendAreaScopeCondition(req.user!, schema.pregnancies, conditions);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.pregnancies)
      .where(and(...conditions));

    const total = countResult[0]?.count || 0;

    // Get paginated results with join to eligible_women and household_members
    let query = db
      .select({
        woman_id: schema.pregnancies.woman_id,
        household_id: schema.pregnancies.household_id,
        site_id: schema.pregnancies.site_id,
        locality_code: schema.pregnancies.locality_code,
        member_name: schema.householdMembers.name,
        member_sex: schema.householdMembers.sex,
        date_of_birth: schema.householdMembers.date_of_birth,
        pregnancy_id: schema.pregnancies.pregnancy_id,
        pregnancy_sequence: schema.pregnancies.pregnancy_sequence,
        detected_date: schema.pregnancies.detected_date,
        enrollment_date: schema.pregnancies.enrollment_date,
        lmp_date: schema.pregnancies.lmp_date,
        edd_date: schema.pregnancies.edd_date,
        pregnancy_status: schema.pregnancies.pregnancy_status,
        gestational_age_at_enrollment: schema.pregnancies.gestational_age_at_enrollment,
      })
      .from(schema.pregnancies)
      .leftJoin(
        schema.householdMembers,
        eq(schema.pregnancies.household_member_id, schema.householdMembers.household_member_id),
      )
      .where(and(...conditions));

    if (search) {
      const searchTerm = `%${search}%`;
      const searchConditions = [
        ...conditions,
        or(
          ilike(schema.pregnancies.woman_id, searchTerm),
          ilike(schema.householdMembers.name, searchTerm),
        )!,
      ];

      const searchCountResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(schema.pregnancies)
        .leftJoin(
          schema.householdMembers,
          eq(schema.pregnancies.household_member_id, schema.householdMembers.household_member_id),
        )
        .where(and(...searchConditions));

      const searchTotal = searchCountResult[0]?.count || 0;

      const rows = await db
        .select({
          woman_id: schema.pregnancies.woman_id,
          household_id: schema.pregnancies.household_id,
          site_id: schema.pregnancies.site_id,
          locality_code: schema.pregnancies.locality_code,
          member_name: schema.householdMembers.name,
          member_sex: schema.householdMembers.sex,
          date_of_birth: schema.householdMembers.date_of_birth,
          pregnancy_id: schema.pregnancies.pregnancy_id,
          pregnancy_sequence: schema.pregnancies.pregnancy_sequence,
          detected_date: schema.pregnancies.detected_date,
          enrollment_date: schema.pregnancies.enrollment_date,
          lmp_date: schema.pregnancies.lmp_date,
          edd_date: schema.pregnancies.edd_date,
          pregnancy_status: schema.pregnancies.pregnancy_status,
          gestational_age_at_enrollment: schema.pregnancies.gestational_age_at_enrollment,
        })
        .from(schema.pregnancies)
        .leftJoin(
          schema.householdMembers,
          eq(schema.pregnancies.household_member_id, schema.householdMembers.household_member_id),
        )
        .where(and(...searchConditions))
        .orderBy(desc(schema.pregnancies.enrollment_date))
        .limit(perPage)
        .offset(offset);

      const includePii = await canAccessPii(req);
      sendSuccess(
        res,
        includePii
          ? rows
          : rows.map((row) => redactFields(row, ["member_name", "date_of_birth"])),
        200,
        { total: searchTotal, page, per_page: perPage },
      );
      return;
    }

    const rows = await query
      .orderBy(desc(schema.pregnancies.enrollment_date))
      .limit(perPage)
      .offset(offset);

    const includePii = await canAccessPii(req);
    sendSuccess(
      res,
      includePii
        ? rows
        : rows.map((row) => redactFields(row, ["member_name", "date_of_birth"])),
      200,
      { total, page, per_page: perPage },
    );
  } catch (error) {
    console.error("List pregnant women error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/pregnant-women/:pregnancy_id
 * Get full pregnancy detail with woman and member information
 */
router.get("/:pregnancy_id", requireAuth, async (req: Request, res: Response) => {
  try {
    const pregnancyId = req.params.pregnancy_id;
    const pregnancyConditions = [eq(schema.pregnancies.pregnancy_id, pregnancyId)];
    await appendAreaScopeCondition(req.user!, schema.pregnancies, pregnancyConditions);

    // Get pregnancy with related data
    const [pregnancy] = await db
      .select()
      .from(schema.pregnancies)
      .where(and(...pregnancyConditions));

    if (!pregnancy) {
      sendError(res, 404, "PREGNANCY_NOT_FOUND", "Pregnancy not found");
      return;
    }

    // Get eligible woman info
    const [woman] = await db
      .select({
        woman_id: schema.eligibleWomen.woman_id,
        wq_status: schema.eligibleWomen.wq_status,
        tracking_status: schema.eligibleWomen.tracking_status,
        current_eligibility_status: schema.eligibleWomen.current_eligibility_status,
      })
      .from(schema.eligibleWomen)
      .where(eq(schema.eligibleWomen.woman_id, pregnancy.woman_id));

    // Get household member info
    const [member] = await db
      .select({
        name: schema.householdMembers.name,
        sex: schema.householdMembers.sex,
        date_of_birth: schema.householdMembers.date_of_birth,
        date_of_birth_precision: schema.householdMembers.date_of_birth_precision,
      })
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.household_member_id, pregnancy.household_member_id));

    // Get ultrasound records
    const ultrasoundRecords = await db
      .select()
      .from(schema.ultrasoundRecords)
      .where(eq(schema.ultrasoundRecords.pregnancy_id, pregnancyId))
      .orderBy(schema.ultrasoundRecords.report_sequence);

    // Get active tasks for this pregnancy
    const activeTasks = await db
      .select()
      .from(schema.followUpTasks)
      .where(
        and(
          eq(schema.followUpTasks.pregnancy_id, pregnancyId),
          sql`status NOT IN ('completed', 'closed', 'cancelled')`,
        ),
      )
      .orderBy(schema.followUpTasks.target_date);

    const includePii = await canAccessPii(req);
    const response = {
      ...pregnancy,
      woman: woman || null,
      member: includePii || !member ? member || null : redactFields(member, ["name", "date_of_birth"]),
      ultrasound_records: ultrasoundRecords,
      active_tasks: activeTasks,
    };

    sendSuccess(res, response);
  } catch (error) {
    console.error("Get pregnancy detail error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

export default router;
