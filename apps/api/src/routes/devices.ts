import { Router, Request, Response } from "express";
import { z } from "zod";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";

const router = Router();

const registerDeviceSchema = z.object({
  device_id: z.string().min(1, "device_id required"),
  device_name: z.string().optional(),
});

const bulkRegisterSchema = z.object({
  devices: z.array(
    z.object({
      device_id: z.string().min(1),
      device_name: z.string().optional(),
      user_id: z.string().min(1),
    }),
  ),
});

const deviceAuthorizationSchema = z.object({
  authorized: z.boolean(),
});

const MAX_AUTHORIZED_DEVICES_PER_USER = 2;
const DEVICE_LIMIT_MESSAGE = "Already registered on two devices. Contact administrator.";

/**
 * POST /api/v1/devices/register
 * Authenticated user associates the current device with their active session.
 */
router.post("/register", requireAuth, async (req: Request, res: Response) => {
  try {
    const { device_id, device_name } = registerDeviceSchema.parse(req.body);

    if (!req.user) {
      sendError(res, 401, "MISSING_AUTH", "Authentication required");
      return;
    }

    const now = new Date();
    const registrationResult = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${req.user!.sub}))`);

      const [existingDevice] = await tx
        .select()
        .from(schema.devices)
        .where(eq(schema.devices.device_id, device_id))
        .limit(1);

      if (existingDevice && !existingDevice.authorized) {
        return { error: "DEVICE_DEAUTHORIZED" as const };
      }

      const isExistingDeviceForUser = existingDevice?.user_id === req.user!.sub;
      if (!isExistingDeviceForUser) {
        const activeDevices = await tx
          .select({ device_id: schema.devices.device_id })
          .from(schema.devices)
          .where(
            and(
              eq(schema.devices.user_id, req.user!.sub),
              eq(schema.devices.authorized, true),
            ),
          );
        if (activeDevices.length >= MAX_AUTHORIZED_DEVICES_PER_USER) {
          return { error: "DEVICE_LIMIT_REACHED" as const };
        }
      }

      if (existingDevice) {
        await tx
          .update(schema.devices)
          .set({
            device_name: device_name || null,
            user_id: req.user!.sub,
            registered_at: now,
          })
          .where(eq(schema.devices.device_id, device_id));
      } else {
        await tx.insert(schema.devices).values({
          device_id,
          device_name: device_name || null,
          user_id: req.user!.sub,
          authorized: true,
          registered_at: now,
        });
      }

      return { error: null };
    });

    if (registrationResult.error === "DEVICE_DEAUTHORIZED") {
      sendError(res, 403, "DEVICE_DEAUTHORIZED", "This device has been deauthorized by an administrator");
      return;
    }
    if (registrationResult.error === "DEVICE_LIMIT_REACHED") {
      sendError(res, 403, "DEVICE_LIMIT_REACHED", DEVICE_LIMIT_MESSAGE);
      return;
    }

    sendSuccess(res, {
      device_id,
      device_name: device_name || null,
      registered_at: now,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("Device register error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

/**
 * POST /api/v1/devices
 * Bulk register devices for central admins or site admins within their site.
 */
router.post(
  "/",
  requireAuth,
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const { devices } = bulkRegisterSchema.parse(req.body);

      if (req.user!.role === "site_research_scientist") {
        const targetUserIds = [...new Set(devices.map((device) => device.user_id))];
        const targetUsers =
          targetUserIds.length > 0
            ? await db
                .select({
                  user_id: schema.users.user_id,
                  site_id: schema.users.site_id,
                })
                .from(schema.users)
                .where(inArray(schema.users.user_id, targetUserIds))
            : [];
        const targetUsersById = new Map(targetUsers.map((user) => [user.user_id, user]));
        const invalidUserId = targetUserIds.find((userId) => {
          const targetUser = targetUsersById.get(userId);
          return !targetUser || targetUser.site_id !== req.user!.site_id;
        });

        if (invalidUserId) {
          sendError(
            res,
            403,
            "INSUFFICIENT_PERMISSIONS",
            `Site research scientists can only assign devices to users in their own site: ${invalidUserId}`,
          );
          return;
        }
      }

      const now = new Date();
      const values = devices.map((d) => ({
        device_id: d.device_id,
        device_name: d.device_name || null,
        user_id: d.user_id,
        registered_at: now,
      }));

      for (const device of values) {
        await db
          .insert(schema.devices)
          .values(device)
          .onConflictDoUpdate({
            target: schema.devices.device_id,
            set: {
              device_name: device.device_name,
              user_id: device.user_id,
              registered_at: device.registered_at,
            },
          });
      }

      sendSuccess(res, { created: devices.length }, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
          errors: error.errors,
        });
      } else {
        console.error("Bulk device register error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      }
    }
  },
);

/**
 * PATCH /api/v1/devices/:deviceId/authorization
 * Central admins can manage any device; site research scientists are limited to their site.
 */
router.patch(
  "/:deviceId/authorization",
  requireAuth,
  requireRole("central_admin", "site_research_scientist"),
  async (req: Request, res: Response) => {
    try {
      const { authorized } = deviceAuthorizationSchema.parse(req.body);
      const deviceId = String(req.params.deviceId || "");
      const [device] = await db
        .select()
        .from(schema.devices)
        .where(eq(schema.devices.device_id, deviceId))
        .limit(1);

      if (!device) {
        sendError(res, 404, "DEVICE_NOT_FOUND", "Registered device not found");
        return;
      }

      if (req.user!.role === "site_research_scientist") {
        const [deviceUser] = device.user_id
          ? await db
              .select({ site_id: schema.users.site_id })
              .from(schema.users)
              .where(eq(schema.users.user_id, device.user_id))
              .limit(1)
          : [];
        if (!deviceUser || deviceUser.site_id !== req.user!.site_id) {
          sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "You can only manage devices registered to users in your site");
          return;
        }
      }

      const now = new Date();
      if (authorized && !device.authorized && device.user_id) {
        const otherActiveDevices = await db
          .select({ device_id: schema.devices.device_id })
          .from(schema.devices)
          .where(
            and(
              eq(schema.devices.user_id, device.user_id),
              eq(schema.devices.authorized, true),
              ne(schema.devices.device_id, deviceId),
            ),
          );
        if (otherActiveDevices.length >= MAX_AUTHORIZED_DEVICES_PER_USER) {
          sendError(res, 409, "DEVICE_LIMIT_REACHED", DEVICE_LIMIT_MESSAGE);
          return;
        }
      }
      const [updated] = await db
        .update(schema.devices)
        .set({
          authorized,
          deauthorized_at: authorized ? null : now,
          deauthorized_by_user_id: authorized ? null : req.user!.sub,
        })
        .where(eq(schema.devices.device_id, deviceId))
        .returning();

      sendSuccess(res, updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", { errors: error.errors });
      } else {
        console.error("Device authorization error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      }
    }
  },
);

export default router;
