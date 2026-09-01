/**
 * Server-side emergency security reset. Run only on the API host with the
 * production DATABASE_URL loaded, for example:
 *   sudo -u dynamic-api sh -c '. /etc/dynamic/api.env; npm --workspace @dynamic/api run security-reset -- --username dev-central-admin'
 *
 * The generated password is printed once to the terminal and is not written
 * to the repository or an application log.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { hashPassword } from "../lib/password";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const username = argument("--username");
if (!username) {
  console.error("Usage: security-reset --username <username> [--password <temporary-password>]");
  process.exit(2);
}

const password = argument("--password") ?? `Dyn-${crypto.randomBytes(18).toString("base64url")}`;
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(2);
}

const [target] = await db.select({ user_id: schema.users.user_id, username: schema.users.username })
  .from(schema.users).where(eq(schema.users.username, username)).limit(1);
if (!target) {
  console.error("User not found.");
  process.exit(1);
}

await db.update(schema.users).set({
  password_hash: await hashPassword(password),
  password_reset_required: false,
  active: true,
  failed_login_attempts: 0,
  locked_until: null,
  totp_secret: null,
  totp_enabled: false,
  updated_at: new Date(),
}).where(eq(schema.users.user_id, target.user_id));
await db.update(schema.refreshTokenSessions)
  .set({ revoked_at: new Date() })
  .where(eq(schema.refreshTokenSessions.user_id, target.user_id));

console.log(`Security reset completed for ${target.username}.`);
console.log(`Temporary password (showing once): ${password}`);
console.log("The user must enroll a new authenticator on next web login.");
process.exit(0);
