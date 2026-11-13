import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { JwtPayload } from "./jwt";

export function assignmentDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function areaActive(area: { active_from: string | null; active_to: string | null }, today: string): boolean {
  return (!area.active_from || area.active_from <= today) && (!area.active_to || area.active_to >= today);
}

// Resolve current account and areas on every request: stale JWT areas/site never expand access.
export async function getSupervisorLocalities(user: JwtPayload, now = new Date()): Promise<string[]> {
  if (user.role !== "field_supervisor" || user.site_id == null) return [];
  const [account] = await db.select().from(schema.users).where(eq(schema.users.user_id, user.sub)).limit(1);
  if (!account || !account.active || account.role !== "field_supervisor" || account.site_id !== user.site_id) return [];
  const areas = await db.select({ locality_code: schema.userAreaAssignments.locality_code,
    active_from: schema.userAreaAssignments.active_from, active_to: schema.userAreaAssignments.active_to })
    .from(schema.userAreaAssignments).innerJoin(schema.studyLocalities, and(
      eq(schema.studyLocalities.site_id, schema.userAreaAssignments.site_id),
      eq(schema.studyLocalities.locality_code, schema.userAreaAssignments.locality_code)))
    .where(and(eq(schema.userAreaAssignments.user_id, user.sub),
      eq(schema.userAreaAssignments.site_id, user.site_id), eq(schema.userAreaAssignments.role, "field_supervisor")));
  return [...new Set(areas.filter(area => areaActive(area, assignmentDate(now))).map(area => area.locality_code))];
}
