import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { requireRole, type JwtPayload } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { getHouseholdAssignmentLocalities } from "../lib/householdAssignmentScope";
import { areaActive, assignmentDate } from "../lib/supervisorVillageAssignments";

const router = Router();
router.use(requireRole("central_admin", "site_data_manager"));
const siteSchema = z.coerce.number().int().positive();
const saveSchema = z.object({ supervisor_user_id: z.string().min(1), site_id: siteSchema,
  locality_codes: z.array(z.string().trim().min(1)).max(10000) });

async function manageableLocalities(user: JwtPayload, siteId: number) {
  if (user.role === "site_data_manager" && user.site_id !== siteId) return null;
  const allowed = await getHouseholdAssignmentLocalities(user);
  const localities = await db.select({ locality_code: schema.studyLocalities.locality_code,
    locality_name: schema.studyLocalities.locality_name }).from(schema.studyLocalities)
    .where(eq(schema.studyLocalities.site_id, siteId));
  return localities.filter(locality => allowed === undefined || allowed.includes(locality.locality_code));
}
router.get("/", async (req, res) => {
  try {
    const parsed = siteSchema.safeParse(req.query.site_id ?? req.user!.site_id);
    if (!parsed.success) { sendError(res, 400, "INVALID_SITE", "Select a valid site"); return; }
    const siteId = parsed.data;
    const localities = await manageableLocalities(req.user!, siteId);
    if (localities === null) { sendError(res, 403, "SITE_SCOPE", "You can only manage your own site"); return; }
    const supervisors = await db.select({ user_id: schema.users.user_id, username: schema.users.username,
      display_name: schema.users.display_name }).from(schema.users).where(and(
      eq(schema.users.site_id, siteId), eq(schema.users.role, "field_supervisor"), eq(schema.users.active, true)));
    const areas = await db.select().from(schema.userAreaAssignments).where(and(
      eq(schema.userAreaAssignments.site_id, siteId), eq(schema.userAreaAssignments.role, "field_supervisor")));
    const allowed = new Set(localities.map(locality => locality.locality_code));
    const today = assignmentDate();
    sendSuccess(res, { site_id: siteId, localities, supervisors: supervisors.map(supervisor => ({ ...supervisor,
      assigned_locality_codes: [...new Set(areas.filter(area => area.user_id === supervisor.user_id &&
        allowed.has(area.locality_code) && areaActive(area, today)).map(area => area.locality_code))] })) });
  } catch (error) { console.error("Supervisor village options error:", error); sendError(res, 500, "INTERNAL_ERROR", "Unable to load supervisor villages"); }
});
router.put("/", async (req, res) => {
  try {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, 400, "VALIDATION_ERROR", "Invalid supervisor village assignment"); return; }
    const { site_id: siteId, supervisor_user_id: userId } = parsed.data;
    const selected = [...new Set(parsed.data.locality_codes)];
    const localities = await manageableLocalities(req.user!, siteId);
    if (localities === null || selected.some(code => !localities.some(locality => locality.locality_code === code))) {
      sendError(res, 403, "LOCALITY_SCOPE", "Select villages within your allocated site and localities"); return;
    }
    const result = await db.transaction(async tx => {
      const [target] = await tx.select().from(schema.users).where(eq(schema.users.user_id, userId)).for("update");
      if (!target || !target.active || target.role !== "field_supervisor" || target.site_id !== siteId) return false;
      const manageable = localities.map(locality => locality.locality_code);
      // Replace only areas this actor can manage; preserve other managers' assignments.
      if (manageable.length) await tx.delete(schema.userAreaAssignments).where(and(
        eq(schema.userAreaAssignments.user_id, userId), eq(schema.userAreaAssignments.site_id, siteId),
        eq(schema.userAreaAssignments.role, "field_supervisor"), inArray(schema.userAreaAssignments.locality_code, manageable)));
      if (selected.length) await tx.insert(schema.userAreaAssignments).values(selected.map(code => ({
        assignment_id: randomUUID(), user_id: userId, site_id: siteId, locality_code: code,
        role: "field_supervisor", active_from: assignmentDate(), created_at: new Date() })));
      return true;
    });
    if (!result) { sendError(res, 400, "INVALID_SUPERVISOR", "Select an active Supervisor from this site"); return; }
    sendSuccess(res, { supervisor_user_id: userId, site_id: siteId, locality_codes: selected });
  } catch (error) { console.error("Supervisor village save error:", error); sendError(res, 500, "INTERNAL_ERROR", "Unable to save supervisor villages"); }
});
export default router;
