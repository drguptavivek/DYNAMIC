import jwt from "jsonwebtoken";

export interface JwtPayload {
  sub: string;
  username: string;
  role:
    | "field_worker"
    | "field_supervisor"
    | "site_research_scientist"
    | "central_admin"
    | "site_data_manager"
    | "central_data_manager"
    | "us_collaborator";
  site_id: number | null;
  type: "access" | "refresh";
  refresh_session_id?: string;
}

type JwtTokenType = JwtPayload["type"];

function isDevelopmentRuntime(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.APP_ENV !== "production";
}

function getJwtSecret(type: JwtTokenType): string {
  const envName = type === "access" ? "JWT_SECRET" : "JWT_REFRESH_SECRET";
  const secret = process.env[envName];
  if (secret) {
    return secret;
  }

  if (isDevelopmentRuntime()) {
    return type === "access"
      ? "dev-access-secret-key-change-in-production"
      : "dev-refresh-secret-key-change-in-production";
  }

  throw new Error(`${envName} is required outside local development`);
}

type TokenSubjectPayload = Omit<JwtPayload, "type" | "refresh_session_id">;

export function signAccessToken(payload: TokenSubjectPayload, refreshSessionId?: string): string {
  return jwt.sign({ ...payload, type: "access", refresh_session_id: refreshSessionId }, getJwtSecret("access"), {
    algorithm: "HS256",
    expiresIn: "2d",
  });
}

export function signRefreshToken(
  payload: TokenSubjectPayload,
  refreshSessionId?: string,
): string {
  return jwt.sign(
    { ...payload, type: "refresh", refresh_session_id: refreshSessionId },
    getJwtSecret("refresh"),
    {
      algorithm: "HS256",
      expiresIn: "30d",
    },
  );
}

export function verifyToken(token: string, expectedType: JwtTokenType = "access"): JwtPayload {
  const payload = jwt.verify(token, getJwtSecret(expectedType), {
    algorithms: ["HS256"],
  }) as JwtPayload;

  if (payload.type !== expectedType) {
    throw new Error(`Expected ${expectedType} token`);
  }

  return payload;
}
