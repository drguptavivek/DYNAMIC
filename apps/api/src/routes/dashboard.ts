import { Router, Request, Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { appendAreaScopeCondition } from "../lib/areaScope";

const router = Router();

async function countRows(table: any, user: Request["user"], extra: any[] = []) {
  const conditions = [...extra];
  await appendAreaScopeCondition(user!, table, conditions);
  const [row] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(table)
    .where(conditions.length ? and(...conditions) : undefined);
  return row?.count ?? 0;
}

async function countChildren(user: Request["user"]) {
  const conditions: any[] = [];
  await appendAreaScopeCondition(user!, schema.households, conditions);
  const [row] = await db.select({ count: sql<number>`cast(count(*) as integer)` })
    .from(schema.children)
    .leftJoin(schema.households, eq(schema.children.household_id, schema.households.household_id))
    .where(conditions.length ? and(...conditions) : undefined);
  return row?.count ?? 0;
}

async function countFlags(user: Request["user"]) {
  if (["central_admin", "central_data_manager", "us_collaborator"].includes(user!.role)) {
    const [row] = await db.select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.dataQualityFlags).where(eq(schema.dataQualityFlags.status, "open"));
    return row?.count ?? 0;
  }
  const sites = await db.select({ site_id: schema.userAreaAssignments.site_id })
    .from(schema.userAreaAssignments).where(eq(schema.userAreaAssignments.user_id, user!.sub));
  const siteIds = sites.map((site) => site.site_id);
  if (siteIds.length === 0 && user!.site_id !== null) siteIds.push(user!.site_id);
  if (siteIds.length === 0) return 0;
  const [row] = await db.select({ count: sql<number>`cast(count(*) as integer)` })
    .from(schema.dataQualityFlags)
    .where(and(eq(schema.dataQualityFlags.status, "open"), inArray(schema.dataQualityFlags.site_id, siteIds)));
  return row?.count ?? 0;
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const [households, members, eligibleWomen, trackingEligibleWomen, pregnancies, children, tasks, openFlags] = await Promise.all([
      countRows(schema.households, req.user),
      countRows(schema.householdMembers, req.user),
      countRows(schema.eligibleWomen, req.user),
      countRows(schema.eligibleWomen, req.user, [eq(schema.eligibleWomen.wq_status, "completed"), sql`${schema.eligibleWomen.tracking_status} <> 'not_tracked'`]),
      countRows(schema.pregnancies, req.user, [eq(schema.pregnancies.pregnancy_status, "active")]),
      countChildren(req.user),
      countRows(schema.followUpTasks, req.user),
      countFlags(req.user),
    ]);
    sendSuccess(res, { households, members, eligible_women: eligibleWomen, tracking_eligible_women: trackingEligibleWomen, active_pregnancies: pregnancies, children, tasks, open_data_quality_flags: openFlags });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

export default router;
