import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { hashPassword } from "../lib/password";

const router = Router();

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}

/**
 * GET /api/v1/users/me
 * Get current user profile
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const [user] = await db
      .select({
        user_id: schema.users.user_id,
        username: schema.users.username,
        display_name: schema.users.display_name,
        email: schema.users.email,
        role: schema.users.role,
        site_id: schema.users.site_id,
        active: schema.users.active,
        created_at: schema.users.created_at,
        updated_at: schema.users.updated_at,
      })
      .from(schema.users)
      .where(eq(schema.users.user_id, req.user!.sub));

    if (!user) {
      sendError(res, 404, "USER_NOT_FOUND", "User not found");
      return;
    }

    const areaAssignments = await db
      .select()
      .from(schema.userAreaAssignments)
      .where(eq(schema.userAreaAssignments.user_id, req.user!.sub));

    sendSuccess(res, {
      ...user,
      area_assignments: areaAssignments,
    });
  } catch (error) {
    console.error("Get me error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

/**
 * GET /api/v1/users
 * List users with filtering
 */
router.get(
  "/",
  requireAuth,
  requireRole("central_admin", "site_research_scientist", "field_supervisor"),
  async (req: Request, res: Response) => {
    try {
      const { site_id: siteIdStr, role, active: activeStr, search } = req.query;
      const siteId = siteIdStr ? parseInt(siteIdStr as string, 10) : undefined;
      const activeFilter = parseBoolean(activeStr as string);

      let conditions: any[] = [];

      // Role-based filtering: non-admins can only see their own site
      if (req.user!.role !== "central_admin") {
        if (req.user!.site_id !== null) {
          conditions.push(eq(schema.users.site_id, req.user!.site_id));
        }
      } else if (siteId !== undefined) {
        conditions.push(eq(schema.users.site_id, siteId));
      }

      // Role filter
      if (role) {
        conditions.push(eq(schema.users.role, role as string));
      }

      // Active filter
      if (activeFilter !== undefined) {
        conditions.push(eq(schema.users.active, activeFilter));
      }

      // Search filter
      if (search) {
        const searchTerm = `%${search}%`;
        conditions.push(
          or(
            ilike(schema.users.username, searchTerm),
            ilike(schema.users.display_name, searchTerm),
          )!,
        );
      }

      const users = await db
        .select({
          user_id: schema.users.user_id,
          username: schema.users.username,
          display_name: schema.users.display_name,
          email: schema.users.email,
          role: schema.users.role,
          site_id: schema.users.site_id,
          active: schema.users.active,
          created_at: schema.users.created_at,
          updated_at: schema.users.updated_at,
        })
        .from(schema.users)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      sendSuccess(res, users, 200, { total: users.length });
    } catch (error) {
      console.error("List users error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  display_name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(["field_worker", "field_supervisor", "site_research_scientist", "central_admin"]),
  site_id: z.number().int().optional(),
  password: z.string().min(8),
});

/**
 * POST /api/v1/users
 * Create new user
 */
router.post(
  "/",
  requireAuth,
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const data = createUserSchema.parse(req.body);

      // Validate role restrictions
      if (req.user!.role === "site_research_scientist") {
        if (data.role === "central_admin") {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            "Site research scientists cannot create central admins",
          );
          return;
        }
        if (data.site_id && data.site_id !== req.user!.site_id) {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            "Site research scientists can only create users for their own site",
          );
          return;
        }
      }

      // Check if username already exists
      const [existing] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, data.username));

      if (existing) {
        sendError(res, 409, "USERNAME_EXISTS", "Username already exists");
        return;
      }

      const user_id = randomUUID();
      const password_hash = await hashPassword(data.password);
      const now = new Date();

      await db.insert(schema.users).values({
        user_id,
        username: data.username,
        display_name: data.display_name,
        email: data.email,
        role: data.role,
        site_id: data.site_id,
        password_hash,
        active: true,
        created_at: now,
        updated_at: now,
      });

      const [createdUser] = await db
        .select({
          user_id: schema.users.user_id,
          username: schema.users.username,
          display_name: schema.users.display_name,
          email: schema.users.email,
          role: schema.users.role,
          site_id: schema.users.site_id,
          active: schema.users.active,
          created_at: schema.users.created_at,
          updated_at: schema.users.updated_at,
        })
        .from(schema.users)
        .where(eq(schema.users.user_id, user_id));

      sendSuccess(res, createdUser, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
          errors: error.errors,
        });
      } else {
        console.error("Create user error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      }
    }
  },
);

/**
 * GET /api/v1/users/:id
 * Get user by ID
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    const [user] = await db
      .select({
        user_id: schema.users.user_id,
        username: schema.users.username,
        display_name: schema.users.display_name,
        email: schema.users.email,
        role: schema.users.role,
        site_id: schema.users.site_id,
        active: schema.users.active,
        created_at: schema.users.created_at,
        updated_at: schema.users.updated_at,
      })
      .from(schema.users)
      .where(eq(schema.users.user_id, userId));

    if (!user) {
      sendError(res, 404, "USER_NOT_FOUND", "User not found");
      return;
    }

    // Permission check
    if (req.user!.role === "field_worker" && req.user!.sub !== userId) {
      sendError(
        res,
        403,
        "INSUFFICIENT_PERMISSIONS",
        "Field workers can only view their own profile",
      );
      return;
    }

    if (req.user!.role !== "central_admin" && user.site_id !== req.user!.site_id) {
      sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "You can only view users from your own site");
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    console.error("Get user error:", error);
    sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
  }
});

const patchUserSchema = z.object({
  display_name: z.string().optional(),
  email: z.string().email().optional(),
  role: z
    .enum(["field_worker", "field_supervisor", "site_research_scientist", "central_admin"])
    .optional(),
  site_id: z.number().int().optional(),
  password: z.string().min(8).optional(),
  active: z.boolean().optional(),
});

/**
 * PATCH /api/v1/users/:id
 * Update user
 */
router.patch(
  "/:id",
  requireAuth,
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const data = patchUserSchema.parse(req.body);

      // Get the user
      const [user] = await db.select().from(schema.users).where(eq(schema.users.user_id, userId));

      if (!user) {
        sendError(res, 404, "USER_NOT_FOUND", "User not found");
        return;
      }

      // Permission checks
      if (req.user!.role === "site_research_scientist") {
        if (user.site_id !== req.user!.site_id) {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            "Site research scientists can only modify users from their own site",
          );
          return;
        }
        if (data.role === "central_admin") {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            "Site research scientists cannot elevate users to central admin",
          );
          return;
        }
      }

      // Build update object
      const updateData: any = {
        updated_at: new Date(),
      };

      if (data.display_name !== undefined) updateData.display_name = data.display_name;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.site_id !== undefined) updateData.site_id = data.site_id;
      if (data.active !== undefined) updateData.active = data.active;
      if (data.password) {
        updateData.password_hash = await hashPassword(data.password);
      }

      await db.update(schema.users).set(updateData).where(eq(schema.users.user_id, userId));

      const [updatedUser] = await db
        .select({
          user_id: schema.users.user_id,
          username: schema.users.username,
          display_name: schema.users.display_name,
          email: schema.users.email,
          role: schema.users.role,
          site_id: schema.users.site_id,
          active: schema.users.active,
          created_at: schema.users.created_at,
          updated_at: schema.users.updated_at,
        })
        .from(schema.users)
        .where(eq(schema.users.user_id, userId));

      sendSuccess(res, updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
          errors: error.errors,
        });
      } else {
        console.error("Patch user error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      }
    }
  },
);

/**
 * DELETE /api/v1/users/:id
 * Deactivate user (soft delete)
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;

      // Cannot deactivate own account
      if (userId === req.user!.sub) {
        sendError(res, 400, "CANNOT_DEACTIVATE_SELF", "Cannot deactivate your own account");
        return;
      }

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
          "Site research scientists can only modify users from their own site",
        );
        return;
      }

      await db
        .update(schema.users)
        .set({ active: false, updated_at: new Date() })
        .where(eq(schema.users.user_id, userId));

      sendSuccess(res, { message: "User deactivated" });
    } catch (error) {
      console.error("Delete user error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

export default router;
