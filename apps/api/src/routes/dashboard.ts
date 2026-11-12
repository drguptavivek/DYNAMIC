import { Router, Request, Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { appendAreaScopeCondition } from "../lib/areaScope";
import { canAccessPii, requireDataAccess } from "../lib/dataAccess";
import { assembleDashboard, assignedHouseholdsSql, dashboardScope, dashboardSql } from "../lib/operationsDashboard";
import type { DashboardAssignedHouseholds, DashboardStaffRow } from "../../../../shared/operationsDashboard";
import { assembleSiteFormTotals, siteFormTotalsSql } from "../lib/siteFormTotals";
import { siteOperationalProgressSql } from "../lib/siteOperationalProgress";

const router = Router();

router.get("/site-form-totals", requireAuth, requireRole("central_admin", "site_data_manager"), requireDataAccess("can_access_aggregate_dashboards"), async (req: Request, res: Response) => {
  try {
    const siteId = req.user!.role === "central_admin" ? null : req.user!.site_id;
    if (req.user!.role !== "central_admin" && (!Number.isSafeInteger(siteId) || siteId! < 1)) {
      sendError(res, 403, "FORBIDDEN", "A site assignment is required to view site totals");
      return;
    }
    const now = new Date();
    const asOfDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const [result, progress] = await Promise.all([db.execute(siteFormTotalsSql(siteId)), db.execute(siteOperationalProgressSql(siteId, asOfDate))]);
    sendSuccess(res, assembleSiteFormTotals(result.rows as any[], now, progress.rows as any[]));
  } catch (error) {
    console.error("Site form totals error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "Could not load site form totals");
  }
});

router.get("/operations", requireAuth, requireDataAccess("can_access_aggregate_dashboards"), async (req: Request, res: Response) => {
  try {
    const scope = dashboardScope(req.user!, req.query);
    const queries = dashboardSql(scope);
    const [roster, facts, options, quality, cohort, staffOptions] = await Promise.all([
      db.execute(queries.roster), db.execute(queries.facts), db.execute(queries.options), db.execute(queries.quality), db.execute(queries.cohort), db.execute(queries.staff_options),
    ]);
    sendSuccess(res, assembleDashboard(scope, roster.rows as unknown as DashboardStaffRow[], facts.rows as any[], options.rows as any[], quality.rows[0] as any, cohort.rows[0] as any, staffOptions.rows as any[]));
  } catch (error) {
    if (error instanceof Error && error.message === "DASHBOARD_FORBIDDEN") {
      sendError(res, 403, "FORBIDDEN", "This dashboard is available to site and central managers only");
    } else if (error instanceof Error && error.message.startsWith("INVALID_")) {
      sendError(res, 400, error.message, "Invalid dashboard period, date, site, locality, staff or form filter");
    } else {
      console.error("Operations dashboard error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

router.get("/assigned-households", requireAuth, requireDataAccess("can_access_aggregate_dashboards"), async (req: Request, res: Response) => {
  try {
    const scope = dashboardScope(req.user!, req.query);
    const page = req.query.page === undefined ? 1 : typeof req.query.page === "string" && /^[1-9]\d*$/.test(req.query.page) ? Number(req.query.page) : NaN;
    const result = await db.execute(assignedHouseholdsSql(scope, page));
    const data = result.rows[0] as unknown as DashboardAssignedHouseholds;
    if (!await canAccessPii(req)) data.rows = data.rows.map(row => ({ ...row, household_head_name: null }));
    sendSuccess(res, data);
  } catch (error) {
    if (error instanceof Error && error.message === "DASHBOARD_FORBIDDEN") {
      sendError(res, 403, "FORBIDDEN", "This dashboard is available to site and central managers only");
    } else if (error instanceof Error && error.message.startsWith("INVALID_")) {
      sendError(res, 400, error.message, "Select a valid user, site, village and page");
    } else {
      console.error("Dashboard assigned households error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "Could not load assigned households");
    }
  }
});

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
