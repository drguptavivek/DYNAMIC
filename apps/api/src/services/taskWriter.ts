import { eq, sql } from "drizzle-orm";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { TaskDescriptor } from "@dynamic/shared-workflow";
import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const generatedTaskKeys = new AsyncLocalStorage<{ expected: Set<string>; seen: Set<string> }>();

export async function withGeneratedTaskKeys<T>(keys: unknown, work: () => Promise<T>): Promise<T> {
  if (!Array.isArray(keys) || keys.length > 1000 ||
      keys.some((key) => typeof key !== "string" || !key || key.length > 512) ||
      new Set(keys).size !== keys.length) {
    throw new Error("Invalid generated_task_keys");
  }
  const expected = new Set<string>(keys);
  return generatedTaskKeys.run({ expected, seen: new Set() }, async () => {
    const result = await work();
    const seen = generatedTaskKeys.getStore()!.seen;
    if (seen.size !== expected.size) throw new Error("Generated task keys do not match server workflow");
    return result;
  });
}

export function checkGeneratedTaskKey(key: string): void {
  const plan = generatedTaskKeys.getStore();
  if (!plan) return;
  if (!plan.expected.has(key)) throw new Error("Generated task keys do not match server workflow");
  plan.seen.add(key);
}

function parseHouseholdId(householdId: string): { site_id: number; locality_code: string } {
  const parts = householdId.split("-");
  return {
    site_id: parseInt(parts[0]) || 0,
    locality_code: parts[1] || "",
  };
}

// Child and household work belongs to independent tracks, even when a mother ID is present.
export async function resolveTaskWomanId(task: {
  subject_type?: string | null; subject_id?: string | null;
  woman_id?: string | null; pregnancy_id?: string | null; child_id?: string | null;
}): Promise<string | null> {
  if (task.subject_type === "child" || task.child_id || task.subject_type === "household") return null;
  if (task.woman_id) return task.woman_id;
  const pregnancyId = task.pregnancy_id || (task.subject_type === "pregnancy" ? task.subject_id : null);
  if (pregnancyId) {
    const [pregnancy] = await getDb().select({ woman_id: schema.pregnancies.woman_id })
      .from(schema.pregnancies).where(eq(schema.pregnancies.pregnancy_id, pregnancyId)).limit(1);
    return pregnancy?.woman_id ?? null;
  }
  return task.subject_id ?? null;
}

export async function isWomanTerminated(womanId: string | null): Promise<boolean> {
  if (!womanId) return false;
  const [woman] = await getDb().select({ tracking_status: schema.eligibleWomen.tracking_status,
    current_eligibility_status: schema.eligibleWomen.current_eligibility_status })
    .from(schema.eligibleWomen).where(eq(schema.eligibleWomen.woman_id, womanId)).limit(1);
  return woman?.tracking_status === "terminated" || woman?.current_eligibility_status === "deceased";
}

export async function writeTasksFromDescriptors(descriptors: TaskDescriptor[]): Promise<void> {
  if (descriptors.length === 0) return;

  for (const descriptor of descriptors) {
    checkGeneratedTaskKey(descriptor.task_key);
    const womanId = await resolveTaskWomanId(descriptor);
    if (womanId) {
      await getDb().execute(sql`select pg_advisory_xact_lock(hashtextextended(${`woman-pathway|${descriptor.household_id}|${womanId}`}, 0))`);
      if (await isWomanTerminated(womanId)) continue;
    }
    const { site_id, locality_code } = parseHouseholdId(descriptor.household_id);

    await getDb()
      .insert(schema.followUpTasks)
      .values({
        task_id: randomUUID(),
        task_key: descriptor.task_key,
        site_id,
        locality_code,
        household_id: descriptor.household_id,
        subject_type: descriptor.subject_type,
        subject_id: descriptor.subject_id,
        woman_id: descriptor.woman_id,
        pregnancy_id: descriptor.pregnancy_id,
        child_id: descriptor.child_id,
        task_type: descriptor.task_type,
        form_code: descriptor.form_code,
        protocol_visit_label: descriptor.protocol_visit_label,
        generation_source: descriptor.generation_source,
        source_event_id: descriptor.source_event_id,
        anchor_date: descriptor.anchor_date ? descriptor.anchor_date : null,
        window_start: descriptor.window_start ? descriptor.window_start : null,
        target_date: descriptor.target_date,
        deadline_date: descriptor.deadline_date ? descriptor.deadline_date : null,
        default_expected_mode: descriptor.default_expected_mode,
        allowed_modes: descriptor.allowed_modes || [],
        mode_rule_strength: descriptor.mode_rule_strength,
        max_failed_attempts: descriptor.max_failed_attempts,
        requires_final_close_reason: descriptor.requires_final_close_reason,
        rules_version: descriptor.rules_version,
        form_availability: descriptor.form_availability,
        action_state: descriptor.action_state,
        disabled_reason: descriptor.disabled_reason,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflictDoNothing();
  }
}
