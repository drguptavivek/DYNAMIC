import { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { sendError } from "../lib/errors";
import { decryptLoginQrPayload } from "../lib/loginQr";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

function getLimit(): number {
  const parsed = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function getWindowMs(): number {
  const parsed = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "900000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 900000;
}

function getPrincipal(req: Request, path: string): string {
  if (path === "/qr-login") {
    try {
      // Only the authenticated QR identity may isolate an account's login budget.
      return `qr:${decryptLoginQrPayload(req.body?.qr_payload).user_id}`;
    } catch {
      return "anonymous";
    }
  }
  if (path === "/refresh") {
    return typeof req.body?.refresh_token === "string"
      ? `refresh:${createHash("sha256").update(req.body.refresh_token).digest("hex")}`
      : "anonymous";
  }
  return typeof req.body?.username === "string" ? req.body.username : "anonymous";
}

export function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const windowMs = getWindowMs();
  const limit = getLimit();
  const path = req.path.toLowerCase().replace(/\/+$/, "");
  const principal = getPrincipal(req, path);
  const key = `${req.ip || req.socket.remoteAddress || "unknown"}:${path}:${principal}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }

  current.count += 1;
  if (current.count > limit) {
    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000).toString());
    sendError(res, 429, "RATE_LIMITED", "Too many authentication attempts");
    return;
  }

  next();
}

export function resetAuthRateLimitForTests(): void {
  buckets.clear();
}
