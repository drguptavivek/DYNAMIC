import { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/errors";

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

export function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const windowMs = getWindowMs();
  const limit = getLimit();
  const principal =
    typeof req.body?.username === "string"
      ? req.body.username
      : typeof req.body?.refresh_token === "string"
        ? req.body.refresh_token.slice(0, 24)
        : "anonymous";
  const key = `${req.ip || req.socket.remoteAddress || "unknown"}:${req.path}:${principal}`;
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
