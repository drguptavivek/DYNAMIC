import { Router, Request, Response } from "express";
import { z } from "zod";
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

/**
 * POST /api/v1/devices/register
 * Field worker registers own device
 */
router.post("/register", requireAuth, async (req: Request, res: Response) => {
  try {
    const { device_id, device_name } = registerDeviceSchema.parse(req.body);

    if (!req.user) {
      sendError(res, 401, "MISSING_AUTH", "Authentication required");
      return;
    }

    const now = new Date();

    await db
      .insert(schema.devices)
      .values({
        device_id,
        device_name: device_name || null,
        user_id: req.user.sub,
        registered_at: now,
      })
      .onConflictDoUpdate({
        target: schema.devices.device_id,
        set: {
          device_name: device_name || null,
          user_id: req.user.sub,
          registered_at: now,
        },
      });

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
 * Bulk register devices (central_admin only)
 */
router.post("/", requireAuth, requireRole("central_admin"), async (req: Request, res: Response) => {
  try {
    const { devices } = bulkRegisterSchema.parse(req.body);

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
});

export default router;
