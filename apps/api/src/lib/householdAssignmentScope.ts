import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { JwtPayload } from "../middleware/auth";

// Allocation requires explicit active areas; do not use the general site fallback.
export async function getHouseholdAssignmentLocalities(user: JwtPayload): Promise<string[] | undefined> {
  if (user.role !== "site_data_manager") return undefined;
  if (user.site_id == null) return [];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const areas = await db.select().from(schema.userAreaAssignments).where(and(
    eq(schema.userAreaAssignments.user_id, user.sub),
    eq(schema.userAreaAssignments.site_id, user.site_id),
  ));
  return [...new Set(areas.filter((area) =>
    (!area.active_from || String(area.active_from) <= today) &&
    (!area.active_to || String(area.active_to) >= today),
  ).map((area) => area.locality_code))];
}
