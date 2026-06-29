import { createClient, RedisClientType } from "redis";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "../db";
import { JwtPayload } from "./jwt";

const memoryCache = new Map<string, { value: "active" | "revoked"; expiresAt: number }>();

let redisClient: RedisClientType | null = null;
let redisUnavailable = false;

function redisUrl(): string | undefined {
  return process.env.REDIS_URL || process.env.DYNAMIC_REDIS_URL;
}

async function getRedisClient(): Promise<RedisClientType | null> {
  const url = redisUrl();
  if (!url || redisUnavailable) return null;
  if (redisClient?.isOpen) return redisClient;

  try {
    redisClient = createClient({ url });
    redisClient.on("error", () => {
      redisUnavailable = true;
    });
    await redisClient.connect();
    return redisClient;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

function cacheKey(sessionId: string): string {
  return `dynamic:access-session:${sessionId}`;
}

function ttlSeconds(expiresAt: Date): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
}

function setMemory(sessionId: string, value: "active" | "revoked", expiresAt: Date): void {
  memoryCache.set(cacheKey(sessionId), { value, expiresAt: expiresAt.getTime() });
}

function getMemory(sessionId: string): "active" | "revoked" | null {
  const cached = memoryCache.get(cacheKey(sessionId));
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    memoryCache.delete(cacheKey(sessionId));
    return null;
  }
  return cached.value;
}

export async function markAccessSessionActive(sessionId: string, expiresAt: Date): Promise<void> {
  setMemory(sessionId, "active", expiresAt);
  const redis = await getRedisClient();
  if (redis) {
    await redis.setEx(cacheKey(sessionId), ttlSeconds(expiresAt), "active");
  }
}

export async function markAccessSessionRevoked(sessionId: string, expiresAt = new Date(Date.now() + 172800000)): Promise<void> {
  setMemory(sessionId, "revoked", expiresAt);
  const redis = await getRedisClient();
  if (redis) {
    await redis.setEx(cacheKey(sessionId), ttlSeconds(expiresAt), "revoked");
  }
}

export async function isAccessSessionActive(payload: JwtPayload): Promise<boolean> {
  if (payload.type !== "access" || !payload.refresh_session_id) {
    return false;
  }

  const redis = await getRedisClient();
  const cached = redis
    ? ((await redis.get(cacheKey(payload.refresh_session_id))) as "active" | "revoked" | null)
    : getMemory(payload.refresh_session_id);

  if (cached === "active") return true;
  if (cached === "revoked") return false;

  const [session] = await db
    .select({
      session_id: schema.refreshTokenSessions.session_id,
      expires_at: schema.refreshTokenSessions.expires_at,
    })
    .from(schema.refreshTokenSessions)
    .where(
      and(
        eq(schema.refreshTokenSessions.session_id, payload.refresh_session_id),
        eq(schema.refreshTokenSessions.user_id, payload.sub),
        isNull(schema.refreshTokenSessions.revoked_at),
        gt(schema.refreshTokenSessions.expires_at, new Date()),
      ),
    )
    .limit(1);

  if (!session) {
    await markAccessSessionRevoked(payload.refresh_session_id);
    return false;
  }

  await markAccessSessionActive(session.session_id, session.expires_at);
  return true;
}
