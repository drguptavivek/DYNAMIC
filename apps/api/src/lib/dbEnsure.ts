/**
 * Startup database self-provisioning.
 *
 * If the dev database volume is reset (or pointed at a fresh database), the
 * schema and dev seed are recreated automatically so the API, admin console,
 * and field app keep working without manual `db-push`/`db-seed` steps. Data
 * loss from the reset is accepted; table structure and functionality are not.
 *
 * Enabled in development runs (same rule as the JWT dev secrets); production
 * deployments manage their own migrations and never auto-push.
 */
import { sql } from "drizzle-orm";
import { spawn } from "node:child_process";
import path from "node:path";
import { db } from "../db";
import { upsertDevSeed } from "../dev/dev-seed";

async function coreTablesExist(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`select to_regclass('public.users') is not null as exists`,
    );
    return Boolean((result.rows?.[0] as { exists?: boolean } | undefined)?.exists);
  } catch (error) {
    console.error("[db-ensure] Could not inspect database state:", error);
    return false;
  }
}

async function runSchemaPush(): Promise<void> {
  const cwd = path.resolve(__dirname, "../..");
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["drizzle-kit", "push", "--config=drizzle.config.ts"],
    {
      cwd,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "" },
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  // Executor form: the tsconfig lib predates Promise.withResolvers (es2024).
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("drizzle-kit push timed out after 180s"));
    }, 180_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`drizzle-kit push exited with code ${code}`));
    });
  });
}

async function seedIfEmpty(): Promise<void> {
  const userCountResult = await db.execute(sql`select count(*)::int as count from users`);
  const userCount = (userCountResult.rows?.[0] as { count?: number } | undefined)?.count ?? 0;
  if (userCount > 0) return;

  console.log("[db-ensure] Users table is empty; seeding development data...");
  await upsertDevSeed();
  console.log("[db-ensure] Development seed restored (dev users, site, locality, household, task).");
}

export async function ensureDatabaseReady(): Promise<void> {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.warn("[db-ensure] DATABASE_URL not set; skipping startup provisioning.");
    return;
  }

  if (await coreTablesExist()) return;

  console.log("[db-ensure] Core tables are missing (database reset?); recreating full schema...");
  try {
    await runSchemaPush();
    await seedIfEmpty();
    console.log("[db-ensure] Database self-provisioning complete.");
  } catch (error) {
    console.error(
      "[db-ensure] Automatic provisioning failed; run `make db-push && make db-seed` manually:",
      error,
    );
  }
}
