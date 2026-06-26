import { and, eq, or, sql, SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { JwtPayload } from "../middleware/auth";

interface ScopedTable {
  site_id: any;
  locality_code: any;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isActiveAssignment(assignment: typeof schema.userAreaAssignments.$inferSelect): boolean {
  const today = todayIsoDate();
  const activeFrom = assignment.active_from ? String(assignment.active_from) : null;
  const activeTo = assignment.active_to ? String(assignment.active_to) : null;
  return (!activeFrom || activeFrom <= today) && (!activeTo || activeTo >= today);
}

export async function buildAreaScopeCondition(
  user: JwtPayload,
  table: ScopedTable,
): Promise<SQL | undefined> {
  if (user.role === "central_admin") {
    return undefined;
  }

  const assignments = (
    await db
      .select()
      .from(schema.userAreaAssignments)
      .where(eq(schema.userAreaAssignments.user_id, user.sub))
  ).filter(isActiveAssignment);

  if (assignments.length > 0) {
    return or(
      ...assignments.map((assignment) =>
        and(
          eq(table.site_id, assignment.site_id),
          eq(table.locality_code, assignment.locality_code),
        )!,
      ),
    );
  }

  if (user.site_id !== null && user.role !== "field_worker") {
    return eq(table.site_id, user.site_id);
  }

  return sql`false`;
}

export async function canAccessLocation(
  user: JwtPayload,
  siteId: number,
  localityCode: string,
): Promise<boolean> {
  if (user.role === "central_admin") {
    return true;
  }

  const assignments = (
    await db
      .select()
      .from(schema.userAreaAssignments)
      .where(eq(schema.userAreaAssignments.user_id, user.sub))
  ).filter(isActiveAssignment);

  if (assignments.length > 0) {
    return assignments.some(
      (assignment) =>
        assignment.site_id === siteId && assignment.locality_code === localityCode,
    );
  }

  return user.site_id === siteId && user.role !== "field_worker";
}

export async function appendAreaScopeCondition(
  user: JwtPayload,
  table: ScopedTable,
  conditions: any[],
): Promise<void> {
  const scopeCondition = await buildAreaScopeCondition(user, table);
  if (scopeCondition) {
    conditions.push(scopeCondition);
  }
}
