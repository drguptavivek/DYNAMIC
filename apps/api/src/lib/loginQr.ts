import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { getJwtSecret } from "./jwt";

export const LOGIN_QR_TYPE = "dynamic-login-token-v1";
const LOGIN_QR_TTL_MS = 24 * 60 * 60 * 1000;

const encryptedQrSchema = z.object({
  type: z.literal(LOGIN_QR_TYPE),
  token: z.string().min(1),
});

const qrPayloadSchema = z.object({
  user_id: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  nonce: z.string().min(1),
  issued_at: z.number(),
  expires_at: z.number(),
});

function getLoginQrKey(): Buffer {
  return createHash("sha256").update(`dynamic-login-qr:${getJwtSecret("access")}`).digest();
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function createLoginQrPayload(input: {
  userId: string;
  username: string;
  password: string;
}): string {
  const now = Date.now();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getLoginQrKey(), iv);
  const plaintext = JSON.stringify({
    user_id: input.userId,
    username: input.username,
    password: input.password,
    nonce: randomUUID(),
    issued_at: now,
    expires_at: now + LOGIN_QR_TTL_MS,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    type: LOGIN_QR_TYPE,
    token: [toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join("."),
  });
}

export function decryptLoginQrPayload(value: string): z.infer<typeof qrPayloadSchema> {
  const envelope = encryptedQrSchema.parse(JSON.parse(value));
  const [ivPart, tagPart, encryptedPart] = envelope.token.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Invalid QR login token");
  }

  const decipher = createDecipheriv("aes-256-gcm", getLoginQrKey(), fromBase64Url(ivPart));
  decipher.setAuthTag(fromBase64Url(tagPart));
  const decrypted = Buffer.concat([
    decipher.update(fromBase64Url(encryptedPart)),
    decipher.final(),
  ]).toString("utf8");
  const payload = qrPayloadSchema.parse(JSON.parse(decrypted));

  if (payload.expires_at <= Date.now()) {
    throw new Error("QR login token has expired");
  }

  return payload;
}
