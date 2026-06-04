import jwt from "jsonwebtoken";

export interface JwtPayload {
  sub: string;
  username: string;
  role: "field_worker" | "field_supervisor" | "site_research_scientist" | "central_admin";
  site_id: number | null;
  type: "access" | "refresh";
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-in-production";

export function signAccessToken(payload: Omit<JwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "access" }, JWT_SECRET, {
    expiresIn: "2d",
  });
}

export function signRefreshToken(payload: Omit<JwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "refresh" }, JWT_SECRET, {
    expiresIn: "30d",
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
