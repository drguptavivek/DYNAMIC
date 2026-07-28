import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eq, and, ilike, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { markAccessSessionRevoked } from "../lib/tokenSessionCache";

const router = Router();
const userRoleValues = [
  "field_worker",
  "field_supervisor",
  "site_research_scientist",
  "central_admin",
  "site_data_manager",
  "central_data_manager",
  "us_collaborator",
] as const;

type UserRole = (typeof userRoleValues)[number];

const siteScopedRoles = new Set<UserRole>([
  "field_worker",
  "field_supervisor",
  "site_research_scientist",
  "site_data_manager",
]);

const roleRank: Record<UserRole, number> = {
  field_worker: 10,
  field_supervisor: 20,
  site_data_manager: 30,
  site_research_scientist: 40,
  central_data_manager: 50,
  us_collaborator: 50,
  central_admin: 60,
};

function uniqueLocalityCodes(codes: string[]): string[] {
  return [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
}

async function validateSiteAndLocalities(
  role: UserRole,
  siteId: number | null | undefined,
  localityCodes: string[],
): Promise<string | null> {
  if (siteScopedRoles.has(role) && siteId == null) {
    return "A site is required for this role";
  }
  if (localityCodes.length > 0 && siteId == null) {
    return "Select a site before assigning localities";
  }
  if (siteId == null) return null;

  const [site] = await db
    .select({ site_id: schema.studySites.site_id })
    .from(schema.studySites)
    .where(eq(schema.studySites.site_id, siteId));
  if (!site) return "Selected site does not exist";

  if (localityCodes.length > 0) {
    const localities = await db
      .select({ locality_code: schema.studyLocalities.locality_code })
      .from(schema.studyLocalities)
      .where(
        and(
          eq(schema.studyLocalities.site_id, siteId),
          inArray(schema.studyLocalities.locality_code, localityCodes),
        ),
      );
    const found = new Set(localities.map((locality) => locality.locality_code));
    const missing = localityCodes.filter((code) => !found.has(code));
    if (missing.length > 0) return `Unknown localities for selected site: ${missing.join(", ")}`;
  }

  return null;
}

function statusChangeError(
  actor: { sub: string; role: string },
  target: { user_id: string; role: string },
): { status: number; code: string; message: string } | null {
  if (actor.sub === target.user_id) {
    return {
      status: 400,
      code: "CANNOT_CHANGE_OWN_STATUS",
      message: "Cannot change your own account status",
    };
  }
  const actorRank = roleRank[actor.role as UserRole] ?? 0;
  const targetRank = roleRank[target.role as UserRole] ?? Number.MAX_SAFE_INTEGER;
  if (targetRank > actorRank) {
    return {
      status: 403,
      code: "CANNOT_CHANGE_HIGHER_ROLE_STATUS",
      message: "Cannot change the status of a higher-level role",
    };
  }
  return null;
}

async function revokeUserSessions(userId: string): Promise<void> {
  const sessions = await db
    .select({
      session_id: schema.refreshTokenSessions.session_id,
      expires_at: schema.refreshTokenSessions.expires_at,
    })
    .from(schema.refreshTokenSessions)
    .where(
      and(
        eq(schema.refreshTokenSessions.user_id, userId),
        isNull(schema.refreshTokenSessions.revoked_at),
      ),
    );

  if (sessions.length === 0) return;

  await db
    .update(schema.refreshTokenSessions)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(schema.refreshTokenSessions.user_id, userId),
        isNull(schema.refreshTokenSessions.revoked_at),
      ),
    );
  await Promise.all(
    sessions.map((session) => markAccessSessionRevoked(session.session_id, session.expires_at)),
  );
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}

async function selectUserWithStaff(userId: string) {
  const [row] = await db
    .select({
      user_id: schema.users.user_id,
      staff_id: schema.users.staff_id,
      username: schema.users.username,
      display_name: schema.users.display_name,
      email: schema.users.email,
      role: schema.users.role,
      site_id: schema.users.site_id,
      active: schema.users.active,
      created_at: schema.users.created_at,
      updated_at: schema.users.updated_at,
      staff_full_name: schema.studyStaffMembers.full_name,
      staff_email: schema.studyStaffMembers.email,
      staff_designation: schema.studyStaffMembers.designation,
      staff_country: schema.studyStaffMembers.country,
      staff_active: schema.studyStaffMembers.active,
      institution_id: schema.institutions.institution_id,
      institution_name: schema.institutions.institution_name,
      institution_country: schema.institutions.country,
      institution_type: schema.institutions.institution_type,
      institution_active: schema.institutions.active,
      data_access_profile_id: schema.dataAccessProfiles.profile_id,
      can_access_pii: schema.dataAccessProfiles.can_access_pii,
      can_access_raw_crfs: schema.dataAccessProfiles.can_access_raw_crfs,
      can_access_deidentified_exports: schema.dataAccessProfiles.can_access_deidentified_exports,
      can_access_aggregate_dashboards: schema.dataAccessProfiles.can_access_aggregate_dashboards,
      can_access_admin_audit: schema.dataAccessProfiles.can_access_admin_audit,
    })
    .from(schema.users)
    .leftJoin(schema.studyStaffMembers, eq(schema.users.staff_id, schema.studyStaffMembers.staff_id))
    .leftJoin(schema.institutions, eq(schema.studyStaffMembers.institution_id, schema.institutions.institution_id))
    .leftJoin(schema.dataAccessProfiles, eq(schema.studyStaffMembers.staff_id, schema.dataAccessProfiles.staff_id))
    .where(eq(schema.users.user_id, userId));

  if (!row) return undefined;

  return {
    user_id: row.user_id,
    staff_id: row.staff_id,
    username: row.username,
    display_name: row.display_name,
    email: row.email,
    role: row.role,
    site_id: row.site_id,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    staff: row.staff_id
      ? {
          staff_id: row.staff_id,
          full_name: row.staff_full_name,
          email: row.staff_email,
          designation: row.staff_designation,
          country: row.staff_country,
          active: row.staff_active,
          institution: row.institution_id
            ? {
                institution_id: row.institution_id,
                institution_name: row.institution_name,
                country: row.institution_country,
                institution_type: row.institution_type,
                active: row.institution_active,
              }
            : null,
          data_access_profile: row.data_access_profile_id
            ? {
                profile_id: row.data_access_profile_id,
                can_access_pii: row.can_access_pii,
                can_access_raw_crfs: row.can_access_raw_crfs,
                can_access_deidentified_exports: row.can_access_deidentified_exports,
                can_access_aggregate_dashboards: row.can_access_aggregate_dashboards,
                can_access_admin_audit: row.can_access_admin_audit,
              }
            : null,
        }
      : null,
  };
}

function buildDefaultDataAccessProfile(role: (typeof userRoleValues)[number]) {
  if (role === "us_collaborator") {
    return {
      can_access_pii: false,
      can_access_raw_crfs: false,
      can_access_deidentified_exports: true,
      can_access_aggregate_dashboards: true,
      can_access_admin_audit: false,
    };
  }

  return {
    can_access_pii: true,
    can_access_raw_crfs: true,
    can_access_deidentified_exports: true,
    can_access_aggregate_dashboards: true,
    can_access_admin_audit: role === "central_admin" || role === "site_research_scientist",
  };
}

/**
 * GET /api/v1/users/me
 * Get current user profile
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await selectUserWithStaff(req.user!.sub);

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
  role: z.enum(userRoleValues),
  site_id: z.number().int().nullable().optional(),
  locality_codes: z.array(z.string().min(1)).default([]),
  staff: z.object({
    full_name: z.string().min(1),
    email: z.string().email().optional(),
    designation: z.string().min(1),
    country: z.string().min(1).default("India"),
    institution_id: z.string().optional(),
    institution: z.object({
      institution_name: z.string().min(1),
      country: z.string().min(1),
      institution_type: z.string().min(1),
    }).optional(),
  }),
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
      const targetSiteId =
        req.user!.role === "site_research_scientist" ? req.user!.site_id : data.site_id;
      const localityCodes = uniqueLocalityCodes(data.locality_codes);
      if (req.user!.role === "site_research_scientist") {
        if (
          data.role === "central_admin" ||
          data.role === "central_data_manager" ||
          data.role === "us_collaborator"
        ) {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            "Site research scientists cannot create central or collaborator users",
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
        if (targetSiteId === null || targetSiteId === undefined) {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            "Site research scientists can only create site-scoped users",
          );
          return;
        }
      }

      const scopeValidationError = await validateSiteAndLocalities(
        data.role,
        targetSiteId,
        localityCodes,
      );
      if (scopeValidationError) {
        sendError(res, 400, "INVALID_AREA_SCOPE", scopeValidationError);
        return;
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
      const institution_id = data.staff.institution_id ?? randomUUID();
      const staff_id = randomUUID();
      const password_hash = await hashPassword(data.password);
      const now = new Date();

      if (!data.staff.institution_id && !data.staff.institution) {
        sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "Either staff.institution_id or staff.institution is required",
        );
        return;
      }

      if (data.staff.institution_id) {
        const [institution] = await db
          .select()
          .from(schema.institutions)
          .where(eq(schema.institutions.institution_id, data.staff.institution_id));

        if (!institution) {
          sendError(res, 404, "INSTITUTION_NOT_FOUND", "Institution not found");
          return;
        }
      }

      await db.transaction(async (tx) => {
        if (!data.staff.institution_id && data.staff.institution) {
          await tx.insert(schema.institutions).values({
            institution_id,
            institution_name: data.staff.institution.institution_name,
            country: data.staff.institution.country,
            institution_type: data.staff.institution.institution_type,
            active: true,
            created_at: now,
            updated_at: now,
          });
        }

        await tx.insert(schema.studyStaffMembers).values({
          staff_id,
          institution_id,
          full_name: data.staff.full_name,
          email: data.staff.email ?? data.email,
          designation: data.staff.designation,
          country: data.staff.country,
          active: true,
          created_at: now,
          updated_at: now,
        });

        await tx.insert(schema.dataAccessProfiles).values({
          profile_id: randomUUID(),
          staff_id,
          ...buildDefaultDataAccessProfile(data.role),
          created_at: now,
          updated_at: now,
        });

        await tx.insert(schema.users).values({
          user_id,
          staff_id,
          username: data.username,
          display_name: data.display_name,
          email: data.email,
          role: data.role,
          site_id: targetSiteId,
          password_hash,
          active: true,
          created_at: now,
          updated_at: now,
        });

        if (targetSiteId != null && localityCodes.length > 0) {
          await tx.insert(schema.userAreaAssignments).values(
            localityCodes.map((localityCode) => ({
              assignment_id: randomUUID(),
              user_id,
              site_id: targetSiteId,
              locality_code: localityCode,
              role: data.role,
              active_from: now.toISOString().slice(0, 10),
              created_at: now,
            })),
          );
        }
      });

      const createdUser = await selectUserWithStaff(user_id);

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

    const user = await selectUserWithStaff(userId);

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
  role: z.enum(userRoleValues).optional(),
  site_id: z.number().int().nullable().optional(),
  locality_codes: z.array(z.string().min(1)).optional(),
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
        if (data.site_id !== undefined && data.site_id !== req.user!.site_id) {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            "Site research scientists can only keep users in their own site",
          );
          return;
        }
        if (
          data.role === "central_admin" ||
          data.role === "central_data_manager" ||
          data.role === "us_collaborator"
        ) {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            "Site research scientists cannot elevate users to central or collaborator roles",
          );
          return;
        }
      }

      if (data.active !== undefined && data.active !== user.active) {
        const statusError = statusChangeError(req.user!, user);
        if (statusError) {
          sendError(res, statusError.status, statusError.code, statusError.message);
          return;
        }
      }

      const nextRole = (data.role ?? user.role) as UserRole;
      const nextSiteId = data.site_id !== undefined ? data.site_id : user.site_id;
      const localityCodes = data.locality_codes
        ? uniqueLocalityCodes(data.locality_codes)
        : undefined;
      const scopeValidationError = await validateSiteAndLocalities(
        nextRole,
        nextSiteId,
        localityCodes ?? [],
      );
      if (scopeValidationError) {
        sendError(res, 400, "INVALID_AREA_SCOPE", scopeValidationError);
        return;
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

      await db.transaction(async (tx) => {
        await tx.update(schema.users).set(updateData).where(eq(schema.users.user_id, userId));

        if (localityCodes !== undefined || data.site_id !== undefined) {
          await tx
            .delete(schema.userAreaAssignments)
            .where(eq(schema.userAreaAssignments.user_id, userId));
          if (nextSiteId != null && localityCodes && localityCodes.length > 0) {
            await tx.insert(schema.userAreaAssignments).values(
              localityCodes.map((localityCode) => ({
                assignment_id: randomUUID(),
                user_id: userId,
                site_id: nextSiteId,
                locality_code: localityCode,
                role: nextRole,
                active_from: new Date().toISOString().slice(0, 10),
                created_at: new Date(),
              })),
            );
          }
        } else if (data.role !== undefined) {
          await tx
            .update(schema.userAreaAssignments)
            .set({ role: nextRole })
            .where(eq(schema.userAreaAssignments.user_id, userId));
        }
      });

      if (data.active === false && user.active !== false) {
        await revokeUserSessions(userId);
      }

      const updatedUser = await selectUserWithStaff(userId);

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

      const statusError = statusChangeError(req.user!, user);
      if (statusError) {
        sendError(res, statusError.status, statusError.code, statusError.message);
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

      await revokeUserSessions(userId);

      sendSuccess(res, { message: "User deactivated" });
    } catch (error) {
      console.error("Delete user error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

export default router;
