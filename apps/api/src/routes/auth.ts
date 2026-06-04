import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { signAccessToken, signRefreshToken, verifyToken } from "../lib/jwt";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, "Refresh token required"),
});

/**
 * POST /api/v1/auth/login
 * Login with username and password, return access and refresh tokens
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));

    if (!user) {
      sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      return;
    }

    if (!user.active) {
      sendError(res, 401, "ACCOUNT_DISABLED", "This account has been disabled");
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      return;
    }

    const tokenPayload = {
      sub: user.user_id,
      username: user.username,
      role: user.role as any,
      site_id: user.site_id,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    sendSuccess(res, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 172800,
      token_type: "Bearer",
      user: {
        user_id: user.user_id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        site_id: user.site_id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("Login error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refresh_token } = refreshSchema.parse(req.body);

    let payload;
    try {
      payload = verifyToken(refresh_token);
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (err.name === "TokenExpiredError") {
        sendError(
          res,
          401,
          "INVALID_REFRESH_TOKEN",
          "Refresh token has expired, please login again",
        );
        return;
      }
      sendError(res, 401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
      return;
    }

    if (payload.type !== "refresh") {
      sendError(res, 401, "INVALID_REFRESH_TOKEN", "Token is not a refresh token");
      return;
    }

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.user_id, payload.sub));

    if (!user || !user.active) {
      sendError(res, 401, "INVALID_REFRESH_TOKEN", "User not found or account disabled");
      return;
    }

    const tokenPayload = {
      sub: user.user_id,
      username: user.username,
      role: user.role as any,
      site_id: user.site_id,
    };

    const newAccessToken = signAccessToken(tokenPayload);

    sendSuccess(res, {
      access_token: newAccessToken,
      expires_in: 172800,
      token_type: "Bearer",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("Refresh error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user (token invalidation via blacklist is out of scope for v1)
 */
router.post("/logout", requireAuth, (req: Request, res: Response) => {
  sendSuccess(res, { message: "Logged out successfully" });
});

export default router;
