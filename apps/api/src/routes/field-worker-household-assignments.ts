import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendError, sendSuccess } from "../lib/errors";
import { addDays, parseISODate, toISODate } from "@dynamic/shared-workflow";

const router = Router();

const assignmentListSchema = z.object({
  site_id: z.coerce.number().int().positive(),
  locality_code: z.string().optional(),
  household_start: z.string().optional(),
  household_end: z.string().optional(),
});

const assignSchema = z.object({
  household_ids: z.array(z.string().min(1)).min(1),
  user_ids: z.array(z.string().min(1)).min(1),
});

const clearAssignmentsSchema = z.object({
  household_ids: z.array(z.string().min(1)).min(1),
  user_ids: z.array(z.string().min(1)).optional(),
});

function parseRange(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildHhqTaskKey(householdId: string, targetDate: string): string {
  return `${householdId}:household:${householdId}:HHQ:baseline:${targetDate}:v1`;
}

router.get(
  "/",
  requireAuth,
  requireRole("central_admin", "site_research_scientist", "field_supervisor"),
  async (req: Request, res: Response) => {
    try {
      const query = assignmentListSchema.parse(req.query);
      if (req.user!.role !== "central_admin" && req.user!.site_id !== query.site_id) {
        sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "You can only view your own site");
        return;
      }

      const start = parseRange(query.household_start);
      const end = parseRange(query.household_end);
      const conditions: any[] = [eq(schema.households.site_id, query.site_id)];
      if (query.locality_code) {
        conditions.push(eq(schema.households.locality_code, query.locality_code));
      }
      if (start !== undefined) {
        conditions.push(sql`cast(${schema.households.household_number} as integer) >= ${start}`);
      }
      if (end !== undefined) {
        conditions.push(sql`cast(${schema.households.household_number} as integer) <= ${end}`);
      }

      const rows = await db
        .select({
          household_id: schema.households.household_id,
          site_id: schema.households.site_id,
          locality_code: schema.households.locality_code,
          household_number: schema.households.household_number,
          assigned_user_id: schema.fieldWorkerHouseholdAssignments.user_id,
          assigned_field_worker_name: schema.users.display_name,
          assigned_field_worker_username: schema.users.username,
        })
        .from(schema.households)
        .leftJoin(
          schema.fieldWorkerHouseholdAssignments,
          eq(schema.households.household_id, schema.fieldWorkerHouseholdAssignments.household_id),
        )
        .leftJoin(schema.users, eq(schema.fieldWorkerHouseholdAssignments.user_id, schema.users.user_id))
        .where(and(...conditions))
        .orderBy(schema.households.household_id);

      const groupedRows = rows.reduce<
        Array<{
          household_id: string;
          site_id: number;
          locality_code: string;
          household_number: string;
          assigned_user_ids: string[];
          assigned_field_worker_names: string[];
          assigned_field_worker_usernames: string[];
        }>
      >((acc, row) => {
        let grouped = acc.find((item) => item.household_id === row.household_id);
        if (!grouped) {
          grouped = {
            household_id: row.household_id,
            site_id: row.site_id,
            locality_code: row.locality_code,
            household_number: row.household_number,
            assigned_user_ids: [],
            assigned_field_worker_names: [],
            assigned_field_worker_usernames: [],
          };
          acc.push(grouped);
        }

        if (row.assigned_user_id) grouped.assigned_user_ids.push(row.assigned_user_id);
        if (row.assigned_field_worker_name) {
          grouped.assigned_field_worker_names.push(row.assigned_field_worker_name);
        }
        if (row.assigned_field_worker_username) {
          grouped.assigned_field_worker_usernames.push(row.assigned_field_worker_username);
        }
        return acc;
      }, []);

      sendSuccess(res, groupedRows, 200, { total: groupedRows.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid assignment filters", {
          errors: error.errors,
        });
        return;
      }
      console.error("List field worker household assignments error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

router.post(
  "/",
  requireAuth,
  requireRole("central_admin", "site_research_scientist", "field_supervisor"),
  async (req: Request, res: Response) => {
    try {
      const data = assignSchema.parse(req.body);
      const uniqueHouseholdIds = [...new Set(data.household_ids)];
      const uniqueUserIds = [...new Set(data.user_ids)];
      const now = new Date();
      const assignmentDate = toISODate(now);
      const assignmentDeadline = toISODate(addDays(parseISODate(assignmentDate), 30));

      const fieldWorkers = await db
        .select({
          user_id: schema.users.user_id,
          role: schema.users.role,
          site_id: schema.users.site_id,
          active: schema.users.active,
        })
        .from(schema.users)
        .where(inArray(schema.users.user_id, uniqueUserIds));

      if (
        fieldWorkers.length !== uniqueUserIds.length ||
        fieldWorkers.some((fieldWorker) => fieldWorker.role !== "field_worker" || fieldWorker.active === false)
      ) {
        sendError(res, 400, "INVALID_FIELD_WORKER", "Select active field workers");
        return;
      }
      const selectedSiteId = fieldWorkers[0]?.site_id;
      if (selectedSiteId == null) {
        sendError(res, 400, "INVALID_FIELD_WORKER_SITE", "Selected field workers must have a site");
        return;
      }
      if (fieldWorkers.some((fieldWorker) => fieldWorker.site_id !== selectedSiteId)) {
        sendError(res, 400, "INVALID_FIELD_WORKER_SITE", "Selected field workers must belong to one site");
        return;
      }
      if (req.user!.role !== "central_admin" && req.user!.site_id !== selectedSiteId) {
        sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "You can only assign your own site");
        return;
      }

      const households = await db
        .select({
          household_id: schema.households.household_id,
          site_id: schema.households.site_id,
          locality_code: schema.households.locality_code,
          baseline_enrollment_status: schema.households.baseline_enrollment_status,
        })
        .from(schema.households)
        .where(inArray(schema.households.household_id, uniqueHouseholdIds));

      if (households.length !== uniqueHouseholdIds.length) {
        sendError(res, 400, "INVALID_HOUSEHOLD", "One or more households do not exist");
        return;
      }
      if (households.some((household) => household.site_id !== selectedSiteId)) {
        sendError(
          res,
          400,
          "INVALID_ASSIGNMENT_SITE",
          "Households must belong to the selected field worker site",
        );
        return;
      }

      const values = uniqueHouseholdIds.flatMap((householdId) =>
        uniqueUserIds.map((userId) => ({
          assignment_id: randomUUID(),
          household_id: householdId,
          user_id: userId,
          assigned_by_user_id: req.user!.sub,
          assigned_at: now,
          updated_at: now,
        })),
      );

      await db
        .delete(schema.fieldWorkerHouseholdAssignments)
        .where(inArray(schema.fieldWorkerHouseholdAssignments.household_id, uniqueHouseholdIds));

      await db
        .insert(schema.fieldWorkerHouseholdAssignments)
        .values(values)
        .onConflictDoUpdate({
          target: [
            schema.fieldWorkerHouseholdAssignments.household_id,
            schema.fieldWorkerHouseholdAssignments.user_id,
          ],
          set: {
            assigned_by_user_id: req.user!.sub,
            updated_at: now,
          },
        });

      const hhqTaskValues = households
        .filter((household) => (household.baseline_enrollment_status ?? "pending") === "pending")
        .map((household) => ({
          task_id: randomUUID(),
          task_key: buildHhqTaskKey(household.household_id, assignmentDate),
          site_id: household.site_id,
          locality_code: household.locality_code,
          household_id: household.household_id,
          subject_type: "household",
          subject_id: household.household_id,
          task_type: "HHQ",
          form_code: "HHQ",
          expected_forms: ["HHQ"],
          protocol_visit_label: "baseline",
          generation_source: "field_worker_household_assignment",
          anchor_date: assignmentDate,
          window_start: assignmentDate,
          target_date: assignmentDate,
          deadline_date: assignmentDeadline,
          status: "planned",
          rules_version: "1.0.0",
          form_availability: "available",
          action_state: "enabled",
          created_at: now,
          updated_at: now,
        }));

      if (hhqTaskValues.length > 0) {
        await db
          .insert(schema.followUpTasks)
          .values(hhqTaskValues)
          .onConflictDoUpdate({
            target: schema.followUpTasks.task_key,
            set: {
              site_id: sql`excluded.site_id`,
              locality_code: sql`excluded.locality_code`,
              household_id: sql`excluded.household_id`,
              subject_type: sql`excluded.subject_type`,
              subject_id: sql`excluded.subject_id`,
              task_type: sql`excluded.task_type`,
              form_code: sql`excluded.form_code`,
              expected_forms: sql`excluded.expected_forms`,
              protocol_visit_label: sql`excluded.protocol_visit_label`,
              generation_source: sql`excluded.generation_source`,
              anchor_date: sql`excluded.anchor_date`,
              window_start: sql`excluded.window_start`,
              target_date: sql`excluded.target_date`,
              deadline_date: sql`excluded.deadline_date`,
              rules_version: sql`excluded.rules_version`,
              form_availability: sql`excluded.form_availability`,
              action_state: sql`excluded.action_state`,
              updated_at: now,
            },
          });
      }

      sendSuccess(res, {
        assigned: uniqueHouseholdIds.length,
        field_workers: uniqueUserIds.length,
        hhq_tasks_ready: hhqTaskValues.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid assignment request", {
          errors: error.errors,
        });
        return;
      }
      console.error("Assign field worker households error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

router.delete(
  "/",
  requireAuth,
  requireRole("central_admin", "site_research_scientist", "field_supervisor"),
  async (req: Request, res: Response) => {
    try {
      const data = clearAssignmentsSchema.parse(req.body);
      const uniqueHouseholdIds = [...new Set(data.household_ids)];
      const uniqueUserIds = data.user_ids ? [...new Set(data.user_ids)] : [];

      const households = await db
        .select({
          household_id: schema.households.household_id,
          site_id: schema.households.site_id,
        })
        .from(schema.households)
        .where(inArray(schema.households.household_id, uniqueHouseholdIds));

      if (households.length !== uniqueHouseholdIds.length) {
        sendError(res, 400, "INVALID_HOUSEHOLD", "One or more households do not exist");
        return;
      }
      if (
        req.user!.role !== "central_admin" &&
        households.some((household) => household.site_id !== req.user!.site_id)
      ) {
        sendError(res, 403, "INSUFFICIENT_PERMISSIONS", "You can only clear your own site");
        return;
      }

      const deleteConditions = [
        inArray(schema.fieldWorkerHouseholdAssignments.household_id, uniqueHouseholdIds),
      ];
      if (uniqueUserIds.length > 0) {
        deleteConditions.push(inArray(schema.fieldWorkerHouseholdAssignments.user_id, uniqueUserIds));
      }

      await db.delete(schema.fieldWorkerHouseholdAssignments).where(and(...deleteConditions));

      sendSuccess(res, { cleared: uniqueHouseholdIds.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Invalid clear assignment request", {
          errors: error.errors,
        });
        return;
      }
      console.error("Clear field worker household assignments error:", error);
      sendError(res, 500, "INTERNAL_ERROR", "An error occurred");
    }
  },
);

export default router;
