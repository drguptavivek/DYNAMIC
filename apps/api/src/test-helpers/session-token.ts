import { randomUUID } from "node:crypto";
import { db, schema } from "../db";
import { JwtPayload, signAccessToken } from "../lib/jwt";
import { markAccessSessionActive } from "../lib/tokenSessionCache";

type TokenSubjectPayload = Omit<JwtPayload, "type" | "refresh_session_id">;

export async function createSessionBackedAccessToken(
  payload: TokenSubjectPayload,
): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sessionId = `test-session-${randomUUID()}`;

  await db.insert(schema.refreshTokenSessions).values({
    session_id: sessionId,
    user_id: payload.sub,
    token_hash: `test-token-${sessionId}`,
    issued_at: now,
    expires_at: expiresAt,
    created_at: now,
  });
  await markAccessSessionActive(sessionId, expiresAt);

  return signAccessToken(payload, sessionId);
}
