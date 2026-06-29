import { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { sendError } from "./errors";
import { JwtPayload } from "../middleware/auth";

export type DataAccessCapability =
  | "can_access_pii"
  | "can_access_raw_crfs"
  | "can_access_deidentified_exports"
  | "can_access_aggregate_dashboards"
  | "can_access_admin_audit";

export interface DataAccessProfile {
  can_access_pii: boolean;
  can_access_raw_crfs: boolean;
  can_access_deidentified_exports: boolean;
  can_access_aggregate_dashboards: boolean;
  can_access_admin_audit: boolean;
}

declare global {
  namespace Express {
    interface Request {
      dataAccessProfile?: DataAccessProfile;
    }
  }
}

function fallbackProfileForRole(role: JwtPayload["role"]): DataAccessProfile {
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

export async function getDataAccessProfile(user: JwtPayload): Promise<DataAccessProfile> {
  const [row] = await db
    .select({
      can_access_pii: schema.dataAccessProfiles.can_access_pii,
      can_access_raw_crfs: schema.dataAccessProfiles.can_access_raw_crfs,
      can_access_deidentified_exports: schema.dataAccessProfiles.can_access_deidentified_exports,
      can_access_aggregate_dashboards: schema.dataAccessProfiles.can_access_aggregate_dashboards,
      can_access_admin_audit: schema.dataAccessProfiles.can_access_admin_audit,
    })
    .from(schema.users)
    .leftJoin(schema.studyStaffMembers, eq(schema.users.staff_id, schema.studyStaffMembers.staff_id))
    .leftJoin(schema.dataAccessProfiles, eq(schema.studyStaffMembers.staff_id, schema.dataAccessProfiles.staff_id))
    .where(eq(schema.users.user_id, user.sub))
    .limit(1);

  if (!row || row.can_access_pii === null) {
    return fallbackProfileForRole(user.role);
  }

  return {
    can_access_pii: row.can_access_pii ?? false,
    can_access_raw_crfs: row.can_access_raw_crfs ?? false,
    can_access_deidentified_exports: row.can_access_deidentified_exports ?? false,
    can_access_aggregate_dashboards: row.can_access_aggregate_dashboards ?? false,
    can_access_admin_audit: row.can_access_admin_audit ?? false,
  };
}

export async function getRequestDataAccessProfile(req: Request): Promise<DataAccessProfile> {
  if (!req.user) {
    throw new Error("Missing authenticated user");
  }
  if (!req.dataAccessProfile) {
    req.dataAccessProfile = await getDataAccessProfile(req.user);
  }
  return req.dataAccessProfile;
}

export function requireDataAccess(
  capability: DataAccessCapability,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    void getRequestDataAccessProfile(req)
      .then((profile) => {
        if (!profile[capability]) {
          sendError(res, 403, "INSUFFICIENT_DATA_ACCESS", `Requires ${capability}`);
          return;
        }
        next();
      })
      .catch((error) => {
        console.error("Data access check error:", error);
        sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
      });
  };
}

export async function canAccessPii(req: Request): Promise<boolean> {
  const profile = await getRequestDataAccessProfile(req);
  return profile.can_access_pii;
}

export function redactFields<T extends Record<string, unknown>>(
  row: T,
  fields: readonly (keyof T)[],
): T {
  const redacted = { ...row };
  for (const field of fields) {
    if (field in redacted) {
      redacted[field] = null as T[keyof T];
    }
  }
  return redacted;
}
