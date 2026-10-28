import { and, eq, inArray, or, sql, SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { JwtPayload } from "../middleware/auth";

interface ScopedTable {
  site_id: any;
  locality_code: any;
  household_id?: any;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isActiveAssignment(assignment: Pick<typeof schema.userAreaAssignments.$inferSelect, "active_from" | "active_to">): boolean {
  const today = todayIsoDate();
  const activeFrom = assignment.active_from ? String(assignment.active_from) : null;
  const activeTo = assignment.active_to ? String(assignment.active_to) : null;
  return (!activeFrom || activeFrom <= today) && (!activeTo || activeTo >= today);
}

export async function getCurrentFieldWorkerHouseholdAssignments(userId: string) {
  // Site changes must stop old allocation links granting access, even with an older JWT.
  return db.select({ household_id: schema.households.household_id,
    site_id: schema.households.site_id, locality_code: schema.households.locality_code })
    .from(schema.fieldWorkerHouseholdAssignments)
    .innerJoin(schema.households, eq(schema.households.household_id, schema.fieldWorkerHouseholdAssignments.household_id))
    .innerJoin(schema.users, and(eq(schema.users.user_id, schema.fieldWorkerHouseholdAssignments.user_id),
      eq(schema.users.site_id, schema.households.site_id), eq(schema.users.role, "field_worker"), eq(schema.users.active, true)))
    .where(eq(schema.fieldWorkerHouseholdAssignments.user_id, userId));
}

async function getCurrentFieldWorkerLocalityAssignments(userId: string) {
  return (await db.select({ site_id: schema.userAreaAssignments.site_id,
    locality_code: schema.userAreaAssignments.locality_code, active_from: schema.userAreaAssignments.active_from,
    active_to: schema.userAreaAssignments.active_to })
    .from(schema.userAreaAssignments)
    .innerJoin(schema.users, and(eq(schema.users.user_id, schema.userAreaAssignments.user_id),
      eq(schema.users.site_id, schema.userAreaAssignments.site_id), eq(schema.users.role, "field_worker"), eq(schema.users.active, true)))
    .where(eq(schema.userAreaAssignments.user_id, userId))).filter(isActiveAssignment);
}

export async function buildAreaScopeCondition(
  user: JwtPayload,
  table: ScopedTable,
): Promise<SQL | undefined> {
  if (
    user.role === "central_admin" ||
    user.role === "central_data_manager" ||
    user.role === "us_collaborator"
  ) {
    return undefined;
  }

  if (user.role === "field_worker") {
    const householdAssignments = await getCurrentFieldWorkerHouseholdAssignments(user.sub);
    // Explicit household assignments are narrower than a locality assignment
    // and must be authoritative for every household-scoped resource.
    if (table.household_id) {
      return householdAssignments.length > 0 ? inArray(
        table.household_id,
        householdAssignments.map((assignment) => assignment.household_id),
      ) : sql`false`;
    }
    const localityAssignments = await getCurrentFieldWorkerLocalityAssignments(user.sub);
    if (localityAssignments.length > 0) {
      return or(
        ...localityAssignments.map((assignment) =>
          and(
            eq(table.site_id, assignment.site_id),
            eq(table.locality_code, assignment.locality_code),
          )!,
        ),
      );
    }
    return sql`false`;
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

  if (user.site_id !== null) {
    return eq(table.site_id, user.site_id);
  }

  return sql`false`;
}

export async function canAccessLocation(
  user: JwtPayload,
  siteId: number,
  localityCode: string,
  householdId?: string | null,
): Promise<boolean> {
  if (
    user.role === "central_admin" ||
    user.role === "central_data_manager" ||
    user.role === "us_collaborator"
  ) {
    return true;
  }

  if (user.role === "field_worker") {
    const householdAssignments = await getCurrentFieldWorkerHouseholdAssignments(user.sub);
    if (householdId && householdAssignments.length > 0) {
      return householdAssignments.some((assignment) => assignment.household_id === householdId &&
        assignment.site_id === siteId && assignment.locality_code === localityCode);
    }
    if (householdId) {
      const [household] = await db.select({ site_id: schema.households.site_id, locality_code: schema.households.locality_code })
        .from(schema.households).where(eq(schema.households.household_id, householdId));
      if (household && (household.site_id !== siteId || household.locality_code !== localityCode)) return false;
    }
    const localityAssignments = await getCurrentFieldWorkerLocalityAssignments(user.sub);
    if (localityAssignments.length > 0) {
      return localityAssignments.some(
        (assignment) => assignment.site_id === siteId && assignment.locality_code === localityCode,
      );
    }
    return false;
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

  return user.site_id === siteId;
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
