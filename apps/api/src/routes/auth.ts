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
import { decryptLoginQrPayload } from "../lib/loginQr";
import { markAccessSessionActive, markAccessSessionRevoked } from "../lib/tokenSessionCache";
import { buildTotpUri, decryptTotpSecret, encryptTotpSecret, generateTotpSecret, verifyTotp } from "../lib/totp";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
  totp_code: z.string().regex(/^\d{6}$/).optional(),
});

const qrLoginSchema = z.object({
  qr_payload: z.string().min(1, "QR payload required"),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, "Refresh token required"),
});

const logoutSchema = z
  .object({
    refresh_token: z.string().min(1).optional(),
  })
  .optional();
const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_FAILURE_LIMIT = 5;
const ACCOUNT_LOCKOUT_MS = 24 * 60 * 60 * 1000;
const IP_PAIR_FAILURE_LIMIT = 10;
const IP_PAIR_BLOCK_MS = 10 * 60 * 1000;
const ipPairFailures = new Map<string, { count: number; blockedUntil?: number; resetAt: number }>();

function requestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function recordIpFailure(req: Request, username: string): boolean {
  const now = Date.now();
  const key = `${requestIp(req)}:${username.toLowerCase()}`;
  const current = ipPairFailures.get(key);
  if (!current || current.resetAt <= now) {
    ipPairFailures.set(key, { count: 1, resetAt: now + IP_PAIR_BLOCK_MS });
    return false;
  }
  if (current.blockedUntil && current.blockedUntil > now) return true;
  current.count += 1;
  if (current.count >= IP_PAIR_FAILURE_LIMIT) {
    current.blockedUntil = now + IP_PAIR_BLOCK_MS;
    return true;
  }
  return false;
}

function isIpPairBlocked(req: Request, username: string): boolean {
  const current = ipPairFailures.get(`${requestIp(req)}:${username.toLowerCase()}`);
  return Boolean(current?.blockedUntil && current.blockedUntil > Date.now());
}

function clearIpFailures(req: Request, username: string): void {
  ipPairFailures.delete(`${requestIp(req)}:${username.toLowerCase()}`);
}

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
    const { username, password, totp_code } = loginSchema.parse(req.body);

    if (isIpPairBlocked(req, username)) {
      res.setHeader("Retry-After", "600");
      sendError(res, 429, "AUTH_THROTTLED", "Authentication temporarily unavailable");
      return;
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));

    if (!user) {
      recordIpFailure(req, username);
      sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      return;
    }

    if (!user.active) {
      sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      return;
    }

    if (user.locked_until && user.locked_until > new Date()) {
      // Keep lock state indistinguishable from other authentication failures.
      recordIpFailure(req, username);
      sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      const failures = (user.failed_login_attempts ?? 0) + 1;
      await db.update(schema.users).set({
        failed_login_attempts: failures >= ACCOUNT_FAILURE_LIMIT ? failures : failures,
        locked_until: failures >= ACCOUNT_FAILURE_LIMIT ? new Date(Date.now() + ACCOUNT_LOCKOUT_MS) : null,
        updated_at: new Date(),
      }).where(eq(schema.users.user_id, user.user_id));
      recordIpFailure(req, username);
      sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      return;
    }

    if (user.totp_enabled && !totp_code) {
      // Do not create a session until the second factor is supplied.
      sendSuccess(res, { requires_totp: true }, 202);
      return;
    }

    if (user.totp_enabled) {
      if (!totp_code || !user.totp_secret || !verifyTotp(decryptTotpSecret(user.totp_secret), totp_code)) {
        const failures = (user.failed_login_attempts ?? 0) + 1;
        await db.update(schema.users).set({
          failed_login_attempts: failures,
          locked_until: failures >= ACCOUNT_FAILURE_LIMIT ? new Date(Date.now() + ACCOUNT_LOCKOUT_MS) : null,
          updated_at: new Date(),
        }).where(eq(schema.users.user_id, user.user_id));
        recordIpFailure(req, username);
        sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or password");
        return;
      }
    }

    clearIpFailures(req, username);
    if ((user.failed_login_attempts ?? 0) > 0 || user.locked_until) {
      await db.update(schema.users).set({ failed_login_attempts: 0, locked_until: null, updated_at: new Date() })
        .where(eq(schema.users.user_id, user.user_id));
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
        totp_enabled: user.totp_enabled,
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
 * POST /api/v1/auth/qr-login
 * Login with an encrypted server-issued QR payload.
 */
router.post("/qr-login", authRateLimit, async (req: Request, res: Response) => {
  try {
    const { qr_payload } = qrLoginSchema.parse(req.body);
    const qrPayload = decryptLoginQrPayload(qr_payload);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.user_id, qrPayload.user_id));

    if (!user || user.username !== qrPayload.username) {
      sendError(res, 401, "INVALID_QR_LOGIN", "Invalid QR login code");
      return;
    }

    if (!user.active) {
      sendError(res, 401, "ACCOUNT_DISABLED", "This account has been disabled");
      return;
    }

    const passwordValid = await bcrypt.compare(qrPayload.password, user.password_hash);
    if (!passwordValid) {
      sendError(res, 401, "INVALID_QR_LOGIN", "Invalid QR login code");
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
        totp_enabled: user.totp_enabled,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", {
        errors: error.errors,
      });
    } else {
      console.error("QR login error:", error);
      sendError(res, 401, "INVALID_QR_LOGIN", "Invalid QR login code");
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

router.post("/totp/setup", requireAuth, async (req: Request, res: Response) => {
  const [user] = await db.select({ username: schema.users.username }).from(schema.users)
    .where(eq(schema.users.user_id, req.user!.sub));
  if (!user) { sendError(res, 401, "INVALID_CREDENTIALS", "Authentication required"); return; }
  const secret = generateTotpSecret();
  await db.update(schema.users).set({ totp_secret: encryptTotpSecret(secret), totp_enabled: false, updated_at: new Date() })
    .where(eq(schema.users.user_id, req.user!.sub));
  sendSuccess(res, { secret, otpauth_uri: buildTotpUri(secret, user.username) });
});

router.post("/totp/enable", requireAuth, async (req: Request, res: Response) => {
  try {
    const { code } = totpCodeSchema.parse(req.body);
    const [user] = await db.select({ totp_secret: schema.users.totp_secret }).from(schema.users)
      .where(eq(schema.users.user_id, req.user!.sub));
    if (!user?.totp_secret || !verifyTotp(decryptTotpSecret(user.totp_secret), code)) {
      sendError(res, 400, "INVALID_TOTP", "Invalid authenticator code"); return;
    }
    await db.update(schema.users).set({ totp_enabled: true, updated_at: new Date() })
      .where(eq(schema.users.user_id, req.user!.sub));
    sendSuccess(res, { enabled: true });
  } catch (error) {
    if (error instanceof z.ZodError) sendError(res, 400, "VALIDATION_ERROR", "Invalid authenticator code");
    else { console.error("TOTP enable error:", error); sendError(res, 500, "INTERNAL_ERROR", "An error occurred"); }
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
