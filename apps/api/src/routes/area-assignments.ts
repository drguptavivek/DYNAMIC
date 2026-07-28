import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";

const router = Router();

/**
 * GET /api/v1/users/:userId/area-assignments
 * Get all area assignments for a user
 */
router.get("/users/:userId/area-assignments", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;

    const [user] = await db.select().from(schema.users).where(eq(schema.users.user_id, userId));
    if (!user) {
      sendError(res, 404, "USER_NOT_FOUND", "User not found");
      return;
    }
    const canView =
      req.user!.role === "central_admin" ||
      req.user!.sub === userId ||
      ((req.user!.role === "site_research_scientist" || req.user!.role === "field_supervisor") &&
        req.user!.site_id != null &&
        user.site_id === req.user!.site_id);
    if (!canView) {
      sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "You cannot view this user's assignments");
      return;
    }

    const assignments = await db
      .select()
      .from(schema.userAreaAssignments)
      .where(eq(schema.userAreaAssignments.user_id, userId));

    sendSuccess(res, assignments, 200, { total: assignments.length });
  } catch (error) {
    console.error("Get area assignments error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

const createAssignmentSchema = z.object({
  site_id: z.number().int(),
  locality_code: z.string().min(1),
  role: z.string().optional(),
  active_from: z.string().datetime().optional(),
  active_to: z.string().datetime().optional(),
});

/**
 * POST /api/v1/users/:userId/area-assignments
 * Create area assignment for user
 */
router.post(
  "/users/:userId/area-assignments",
  requireAuth,
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const data = createAssignmentSchema.parse(req.body);

      // Verify user exists
      const [user] = await db.select().from(schema.users).where(eq(schema.users.user_id, userId));

      if (!user) {
        sendError(res, 404, "USER_NOT_FOUND", "User not found");
        return;
      }

      // Permission checks
      if (req.user!.role === "site_research_scientist" && user.site_id !== req.user!.site_id) {
        sendError(
          res,
          403,
          "INSUFFICIENT_PERMISSIONS",
          "Site research scientists can only create assignments for users from their own site",
        );
        return;
      }

      if (user.site_id !== data.site_id) {
        sendError(res, 400, "INVALID_AREA_SCOPE", "Assignment site must match the user's site");
        return;
      }
      if (req.user!.role === "site_research_scientist" && data.site_id !== req.user!.site_id) {
        sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "You can only assign your own site");
        return;
      }

      const [locality] = await db
        .select({ locality_code: schema.studyLocalities.locality_code })
        .from(schema.studyLocalities)
        .where(
          and(
            eq(schema.studyLocalities.site_id, data.site_id),
            eq(schema.studyLocalities.locality_code, data.locality_code),
          ),
        );
      if (!locality) {
        sendError(res, 400, "INVALID_AREA_SCOPE", "Locality does not belong to the selected site");
        return;
      }

      const [existing] = await db
        .select()
        .from(schema.userAreaAssignments)
        .where(
          and(
            eq(schema.userAreaAssignments.user_id, userId),
            eq(schema.userAreaAssignments.site_id, data.site_id),
            eq(schema.userAreaAssignments.locality_code, data.locality_code),
          ),
        );
      if (existing) {
        sendError(res, 409, "ASSIGNMENT_EXISTS", "User is already assigned to this locality");
        return;
      }

      const assignment_id = randomUUID();

      const parseDate = (dateStr: string | undefined) => {
        if (!dateStr) return undefined;
        return new Date(dateStr).toISOString().split("T")[0];
      };

      await db.insert(schema.userAreaAssignments).values({
        assignment_id,
        user_id: userId,
        site_id: data.site_id,
        locality_code: data.locality_code,
        role: user.role,
        active_from: parseDate(data.active_from) as any,
        active_to: parseDate(data.active_to) as any,
        created_at: new Date(),
      });

      const [createdAssignment] = await db
        .select()
        .from(schema.userAreaAssignments)
        .where(eq(schema.userAreaAssignments.assignment_id, assignment_id));

      sendSuccess(res, createdAssignment, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
          errors: error.errors,
        });
      } else {
        console.error("Create area assignment error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      }
    }
  },
);

/**
 * DELETE /api/v1/users/:userId/area-assignments/:assignmentId
 * Delete area assignment
 */
router.delete(
  "/users/:userId/area-assignments/:assignmentId",
  requireAuth,
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const { userId, assignmentId } = req.params;

      // Get the assignment
      const [assignment] = await db
        .select()
        .from(schema.userAreaAssignments)
        .where(eq(schema.userAreaAssignments.assignment_id, assignmentId));

      if (!assignment) {
        sendError(res, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found");
        return;
      }

      if (assignment.user_id !== userId) {
        sendError(res, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found for this user");
        return;
      }

      // Verify user exists
      const [user] = await db.select().from(schema.users).where(eq(schema.users.user_id, userId));

      if (!user) {
        sendError(res, 404, "USER_NOT_FOUND", "User not found");
        return;
      }

      // Permission check
      if (req.user!.role === "site_research_scientist" && user.site_id !== req.user!.site_id) {
        sendError(
          res,
          403,
          "INSUFFICIENT_PERMISSIONS",
          "Site research scientists can only delete assignments for users from their own site",
        );
        return;
      }

      await db
        .delete(schema.userAreaAssignments)
        .where(eq(schema.userAreaAssignments.assignment_id, assignmentId));

      sendSuccess(res, { message: "Assignment removed" });
    } catch (error) {
      console.error("Delete area assignment error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

export default router;
