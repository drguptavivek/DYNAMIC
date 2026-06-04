import { db, schema } from "../db";
import { TaskDescriptor } from "@dynamic/shared-workflow";
import { randomUUID } from "crypto";

function parseHouseholdId(householdId: string): { site_id: number; locality_code: string } {
  const parts = householdId.split("-");
  return {
    site_id: parseInt(parts[0]) || 0,
    locality_code: parts[1] || "",
  };
}

export async function writeTasksFromDescriptors(descriptors: TaskDescriptor[]): Promise<void> {
  if (descriptors.length === 0) return;

  for (const descriptor of descriptors) {
    try {
      const { site_id, locality_code } = parseHouseholdId(descriptor.household_id);

      await db
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
    } catch (err) {
      console.error(`Failed to write task descriptor with key ${descriptor.task_key}:`, err);
    }
  }
}

export async function writeTaskDescriptor(descriptor: TaskDescriptor): Promise<void> {
  await writeTasksFromDescriptors([descriptor]);
}
