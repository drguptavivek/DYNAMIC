import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt";
import { sendError } from "../lib/errors";
import { isAccessSessionActive } from "../lib/tokenSessionCache";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export { JwtPayload };

/**
 * Middleware: verify Bearer JWT, attach req.user
 * Returns 401 if missing/invalid, 403 if expired
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendError(res, 401, "MISSING_AUTH", "Missing or invalid Authorization header");
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    if (!(await isAccessSessionActive(payload))) {
      sendError(res, 401, "TOKEN_REVOKED", "Token session is no longer active");
      return;
    }
    req.user = payload;
    next();
  } catch (error: unknown) {
    const err = error as Error & { name?: string };
    if (err.name === "TokenExpiredError") {
      sendError(res, 403, "TOKEN_EXPIRED", "Token has expired");
    } else {
      sendError(res, 401, "INVALID_TOKEN", "Invalid token");
    }
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    if (!(await isAccessSessionActive(payload))) {
      sendError(res, 401, "TOKEN_REVOKED", "Token session is no longer active");
      return;
    }
    req.user = payload;
    next();
  } catch (error: unknown) {
    const err = error as Error & { name?: string };
    if (err.name === "TokenExpiredError") {
      sendError(res, 403, "TOKEN_EXPIRED", "Token has expired");
    } else {
      sendError(res, 401, "INVALID_TOKEN", "Invalid token");
    }
  }
}

/**
 * Middleware factory: require specific roles
 * Usage: requireRole('central_admin', 'site_research_scientist')
 */
export function requireRole(
  ...roles: JwtPayload["role"][]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "MISSING_AUTH", "Authentication required");
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 403, "INSUFFICIENT_PERMISSIONS", `Requires one of: ${roles.join(", ")}`);
      return;
    }

    next();
  };
}
