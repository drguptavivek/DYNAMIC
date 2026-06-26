import { Router, Request, Response } from "express";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getPagination } from "../lib/pagination";
import { appendAreaScopeCondition } from "../lib/areaScope";

const router = Router();

async function listHouseholdMembers(req: Request, res: Response, householdIdParam?: string) {
  try {
    const {
      household_id: householdIdQuery,
      site_id: siteIdStr,
      locality_code: localityCode,
      sex,
      search,
      page: pageStr,
      per_page: perPageStr,
    } = req.query;
    const householdId = householdIdParam || householdIdQuery;

    const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;
    const { page, perPage, offset } = getPagination({
      page: pageStr,
      per_page: perPageStr,
    });

    const conditions: any[] = [];
    if (householdId) conditions.push(eq(schema.householdMembers.household_id, householdId as string));
    if (siteId !== undefined) conditions.push(eq(schema.householdMembers.site_id, siteId));
    if (localityCode) conditions.push(eq(schema.householdMembers.locality_code, localityCode as string));
    if (sex) conditions.push(eq(schema.householdMembers.sex, Number(sex)));
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(schema.householdMembers.name, searchTerm),
          ilike(schema.householdMembers.household_member_id, searchTerm),
          ilike(schema.householdMembers.household_id, searchTerm),
        )!,
      );
    }
    await appendAreaScopeCondition(req.user!, schema.householdMembers, conditions);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const countResult = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.householdMembers)
      .where(where);
    const total = countResult[0]?.count || 0;

    const rows = await db
      .select({
        household_member_id: schema.householdMembers.household_member_id,
        household_id: schema.householdMembers.household_id,
        member_number: schema.householdMembers.member_number,
        name: schema.householdMembers.name,
        sex: schema.householdMembers.sex,
        reported_age_years: schema.householdMembers.reported_age_years,
        marital_status: schema.householdMembers.marital_status,
        relationship_to_head: schema.householdMembers.relationship_to_head,
        woman_questionnaire_eligible: schema.householdMembers.woman_questionnaire_eligible,
        member_status: schema.householdMembers.member_status,
        site_id: schema.householdMembers.site_id,
        locality_code: schema.householdMembers.locality_code,
      })
      .from(schema.householdMembers)
      .where(where)
      .orderBy(schema.householdMembers.household_id, schema.householdMembers.member_number)
      .limit(perPage)
      .offset(offset);

    const householdIds = [...new Set(rows.map((row) => row.household_id))];
    const households =
      householdIds.length > 0
        ? await db
            .select({
              household_id: schema.households.household_id,
              structure_map_id: schema.households.structure_map_id,
              household_number: schema.households.household_number,
              address: schema.households.address,
              household_head_name: schema.households.household_head_name,
            })
            .from(schema.households)
            .where(inArray(schema.households.household_id, householdIds))
        : [];
    const householdById = new Map(households.map((household) => [household.household_id, household]));

    sendSuccess(
      res,
      rows.map((row) => ({
        ...row,
        household: householdById.get(row.household_id) || null,
      })),
      200,
      { total, page, per_page: perPage },
    );
  } catch (error) {
    console.error("List household members error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
}

router.get("/", requireAuth, async (req: Request, res: Response) => listHouseholdMembers(req, res));

router.get("/:household_id", requireAuth, async (req: Request, res: Response) =>
  listHouseholdMembers(req, res, req.params.household_id),
);

export default router;
