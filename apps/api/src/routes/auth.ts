import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { db, schema } from "../db";
import { requireAuth } from "../middleware/auth";
import { authRateLimit } from "../middleware/rateLimit";
import { sendError, sendSuccess } from "../lib/errors";
import { JwtPayload, signAccessToken, signRefreshToken, verifyToken } from "../lib/jwt";
import { markAccessSessionActive, markAccessSessionRevoked } from "../lib/tokenSessionCache";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, "Refresh token required"),
});

const logoutSchema = z
  .object({
    refresh_token: z.string().min(1).optional(),
  })
  .optional();

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type TokenSubjectPayload = Omit<JwtPayload, "type" | "refresh_session_id">;

function buildTokenPayload(user: typeof schema.users.$inferSelect): TokenSubjectPayload {
  return {
    sub: user.user_id,
    username: user.username,
    role: user.role as JwtPayload["role"],
    site_id: user.site_id,
  };
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createRefreshSession(userId: string, tokenPayload: TokenSubjectPayload) {
  const now = new Date();
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken(tokenPayload, sessionId);

  await db.insert(schema.refreshTokenSessions).values({
    session_id: sessionId,
    user_id: userId,
    token_hash: hashRefreshToken(refreshToken),
    issued_at: now,
    expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    created_at: now,
  });
  await markAccessSessionActive(sessionId, new Date(now.getTime() + REFRESH_TOKEN_TTL_MS));

  return { sessionId, refreshToken };
}

async function rotateRefreshSession(
  previousSessionId: string,
  userId: string,
  tokenPayload: TokenSubjectPayload,
) {
  const now = new Date();
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken(tokenPayload, sessionId);

  await db.transaction(async (tx) => {
    await tx.insert(schema.refreshTokenSessions).values({
      session_id: sessionId,
      user_id: userId,
      token_hash: hashRefreshToken(refreshToken),
      issued_at: now,
      expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      created_at: now,
    });
    await tx
      .update(schema.refreshTokenSessions)
      .set({
        revoked_at: now,
        replaced_by_session_id: sessionId,
      })
      .where(eq(schema.refreshTokenSessions.session_id, previousSessionId));
  });
  await markAccessSessionRevoked(previousSessionId);
  await markAccessSessionActive(sessionId, new Date(now.getTime() + REFRESH_TOKEN_TTL_MS));

  return { sessionId, refreshToken };
}

/**
 * POST /api/v1/auth/login
 * Login with username and password, return access and refresh tokens
 */
router.post("/login", authRateLimit, async (req: Request, res: Response) => {
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

    const tokenPayload = buildTokenPayload(user);

    const { sessionId, refreshToken } = await createRefreshSession(user.user_id, tokenPayload);
    const accessToken = signAccessToken(tokenPayload, sessionId);

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
router.post("/refresh", authRateLimit, async (req: Request, res: Response) => {
  try {
    const { refresh_token } = refreshSchema.parse(req.body);

    let payload;
    try {
      payload = verifyToken(refresh_token, "refresh");
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

    if (!payload.refresh_session_id) {
      sendError(res, 401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
      return;
    }

    const [refreshSession] = await db
      .select()
      .from(schema.refreshTokenSessions)
      .where(eq(schema.refreshTokenSessions.session_id, payload.refresh_session_id));

    if (
      !refreshSession ||
      refreshSession.user_id !== payload.sub ||
      refreshSession.revoked_at ||
      refreshSession.expires_at <= new Date() ||
      refreshSession.token_hash !== hashRefreshToken(refresh_token)
    ) {
      sendError(res, 401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
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

    const tokenPayload = buildTokenPayload(user);

    const { sessionId, refreshToken } = await rotateRefreshSession(
      refreshSession.session_id,
      user.user_id,
      tokenPayload,
    );
    const newAccessToken = signAccessToken(tokenPayload, sessionId);

    sendSuccess(res, {
      access_token: newAccessToken,
      refresh_token: refreshToken,
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
 * Logout user and revoke the current refresh session when supplied.
 */
router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = logoutSchema.parse(req.body);
    const now = new Date();

    if (parsed?.refresh_token) {
      try {
        const payload = verifyToken(parsed.refresh_token, "refresh");
        if (payload.refresh_session_id && payload.sub === req.user?.sub) {
          const [session] = await db
            .select({ expires_at: schema.refreshTokenSessions.expires_at })
            .from(schema.refreshTokenSessions)
            .where(eq(schema.refreshTokenSessions.session_id, payload.refresh_session_id))
            .limit(1);
          await db
            .update(schema.refreshTokenSessions)
            .set({ revoked_at: now })
            .where(
              and(
                eq(schema.refreshTokenSessions.session_id, payload.refresh_session_id),
                eq(schema.refreshTokenSessions.user_id, req.user.sub),
                eq(schema.refreshTokenSessions.token_hash, hashRefreshToken(parsed.refresh_token)),
                isNull(schema.refreshTokenSessions.revoked_at),
              ),
            );
          await markAccessSessionRevoked(payload.refresh_session_id, session?.expires_at);
        }
      } catch {
        // Logout is idempotent; invalid refresh tokens do not keep the access session alive.
      }
    } else if (req.user?.sub) {
      const sessions = await db
        .select({
          session_id: schema.refreshTokenSessions.session_id,
          expires_at: schema.refreshTokenSessions.expires_at,
        })
        .from(schema.refreshTokenSessions)
        .where(
          and(
            eq(schema.refreshTokenSessions.user_id, req.user.sub),
            isNull(schema.refreshTokenSessions.revoked_at),
          ),
        );
      await db
        .update(schema.refreshTokenSessions)
        .set({ revoked_at: now })
        .where(
          and(
            eq(schema.refreshTokenSessions.user_id, req.user.sub),
            isNull(schema.refreshTokenSessions.revoked_at),
          ),
        );
      await Promise.all(
        sessions.map((session) => markAccessSessionRevoked(session.session_id, session.expires_at)),
      );
    }

    sendSuccess(res, { message: "Logged out successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("Logout error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  }
});

export default router;
