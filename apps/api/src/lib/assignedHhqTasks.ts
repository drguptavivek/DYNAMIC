import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { addDays, parseISODate, toISODate } from "@dynamic/shared-workflow";
import { db, schema } from "../db";

const HHQ_ASSIGNMENT_WINDOW_DAYS = 180;
const INSERT_BATCH_SIZE = 200;
const ACTIONABLE_HHQ_STATUSES = new Set(["planned", "open", "in_progress"]);
const FINISHED_HHQ_STATUSES = new Set([
  "completed",
  "missed",
  "cancelled",
  "closed",
  "closed_final_reason",
]);

type AssignedHousehold = {
  household_id: string;
  site_id: number;
  locality_code: string;
  baseline_enrollment_status: string | null;
  assigned_at: Date;
};

type ExistingHhqTask = {
  household_id: string | null;
  status: string | null;
};

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function assignmentDate(value: Date, fallback: Date): string {
  return toISODate(Number.isNaN(value.getTime()) ? fallback : value);
}

export function buildMissingAssignedHhqTasks(
  assignedHouseholds: AssignedHousehold[],
  existingTasks: ExistingHhqTask[],
  now = new Date(),
) {
  const blockingHouseholds = new Set(
    existingTasks
      .filter((task) => {
        const status = String(task.status || "planned").toLowerCase();
        return ACTIONABLE_HHQ_STATUSES.has(status) || FINISHED_HHQ_STATUSES.has(status);
      })
      .map((task) => task.household_id)
      .filter((householdId): householdId is string => Boolean(householdId)),
  );

  return assignedHouseholds
    .filter(
      (household) =>
        String(household.baseline_enrollment_status || "pending").toLowerCase() === "pending" &&
        !blockingHouseholds.has(household.household_id),
    )
    .map((household) => {
      const anchorDate = assignmentDate(household.assigned_at, now);
      const deadlineDate = toISODate(
        addDays(parseISODate(anchorDate), HHQ_ASSIGNMENT_WINDOW_DAYS),
      );
      return {
        task_id: randomUUID(),
        task_key: `${household.household_id}:household:${household.household_id}:HHQ:baseline:${deadlineDate}:v1`,
        site_id: household.site_id,
        locality_code: household.locality_code,
        household_id: household.household_id,
        subject_type: "household",
        subject_id: household.household_id,
        task_type: "HHQ",
        form_code: "HHQ",
        expected_forms: ["HHQ"],
        protocol_visit_label: "baseline",
        generation_source: "field_worker_assignment_sync_reconciliation",
        anchor_date: anchorDate,
        window_start: anchorDate,
        target_date: deadlineDate,
        deadline_date: deadlineDate,
        status: "planned",
        rules_version: "1.0.0",
        form_availability: "available",
        action_state: "enabled",
        disabled_reason: null,
        created_at: now,
        updated_at: now,
      };
    });
}

/**
 * Repairs assignment/task drift caused by operational cleanup or an older
 * assignment path. It never creates HHQ work for a completed baseline and it
 * preserves actionable or finished HHQ evidence already on the server.
 */
export async function ensureAssignedPendingHhqTasks(userId: string, now = new Date()): Promise<number> {
  const assignedHouseholds = await db
    .select({
      household_id: schema.households.household_id,
      site_id: schema.households.site_id,
      locality_code: schema.households.locality_code,
      baseline_enrollment_status: schema.households.baseline_enrollment_status,
      assigned_at: schema.fieldWorkerHouseholdAssignments.assigned_at,
    })
    .from(schema.fieldWorkerHouseholdAssignments)
    .innerJoin(
      schema.households,
      eq(schema.fieldWorkerHouseholdAssignments.household_id, schema.households.household_id),
    )
    .where(eq(schema.fieldWorkerHouseholdAssignments.user_id, userId));

  if (assignedHouseholds.length === 0) return 0;

  const existingTasks: ExistingHhqTask[] = [];
  for (const householdBatch of chunks(assignedHouseholds, INSERT_BATCH_SIZE)) {
    existingTasks.push(
      ...(await db
        .select({
          household_id: schema.followUpTasks.household_id,
          status: schema.followUpTasks.status,
        })
        .from(schema.followUpTasks)
        .where(
          and(
            eq(schema.followUpTasks.task_type, "HHQ"),
            inArray(
              schema.followUpTasks.household_id,
              householdBatch.map((household) => household.household_id),
            ),
          ),
        )),
    );
  }

  const missingTasks = buildMissingAssignedHhqTasks(assignedHouseholds, existingTasks, now);
  for (const taskBatch of chunks(missingTasks, INSERT_BATCH_SIZE)) {
    await db
      .insert(schema.followUpTasks)
      .values(taskBatch)
      .onConflictDoUpdate({
        target: schema.followUpTasks.task_key,
        set: {
          status: "planned",
          form_availability: "available",
          action_state: "enabled",
          disabled_reason: null,
          generation_source: sql`excluded.generation_source`,
          updated_at: now,
        },
      });
  }

  return missingTasks.length;
}
