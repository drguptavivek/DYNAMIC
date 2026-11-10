import { randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { eligibleWomanIdentified } from "@dynamic/event-core";
import { db, schema } from "../db";
import { getDb, runWithDb } from "../lib/dbContext";
import { writeTasksFromDescriptors } from "./taskWriter";

export class MemberSexCorrectionError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const inputSchema = z.object({
  field: z.literal("sex"), old_value: z.literal(1), new_value: z.literal(2),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export async function correctMemberSex(memberId: string, actorId: string, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new MemberSexCorrectionError(400, "INVALID_INPUT", "Only Male to Female (1 to 2) is supported; a reason of 1–1000 characters is required");
  const { reason } = parsed.data;
  return getDb().transaction(async (tx) => runWithDb(tx as unknown as typeof db, async () => {
    const [actor] = await tx.select().from(schema.users).where(eq(schema.users.user_id, actorId)).for("share");
    if (!actor?.active || !["central_admin", "site_data_manager", "site_research_scientist"].includes(actor.role)) {
      throw new MemberSexCorrectionError(403, "INSUFFICIENT_PERMISSIONS", "Current user cannot correct member sex");
    }
    const [knownMember] = await tx.select().from(schema.householdMembers)
      .where(eq(schema.householdMembers.household_member_id, memberId));
    if (!knownMember) throw new MemberSexCorrectionError(404, "MEMBER_NOT_FOUND", "Member not found");
    // Serialize with BHQ promotion before taking its dependent woman/row locks.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`form-opportunity|HHQ|${knownMember.household_id}`}, 0))`);
    // Use the same lock as online/offline woman-pathway promotion before reading work history.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`woman-pathway|${knownMember.household_id}|${memberId}`}, 0))`);
    const [household] = await tx.select().from(schema.households)
      .where(eq(schema.households.household_id, knownMember.household_id)).for("update");
    const [member] = await tx.select().from(schema.householdMembers)
      .where(eq(schema.householdMembers.household_member_id, memberId)).for("update");
    if (!household || !member || member.household_id !== household.household_id ||
        member.site_id !== household.site_id || member.locality_code !== household.locality_code) {
      throw new MemberSexCorrectionError(409, "MEMBER_CONTEXT_CHANGED", "Member household context needs review");
    }
    if (actor.role !== "central_admin") {
      const today = new Date().toISOString().slice(0, 10);
      const assignments = (await tx.select().from(schema.userAreaAssignments)
        .where(eq(schema.userAreaAssignments.user_id, actorId)))
        .filter((a) => (!a.active_from || a.active_from <= today) && (!a.active_to || a.active_to >= today));
      if (actor.site_id !== member.site_id || (assignments.length > 0 && !assignments.some(
        (a) => a.site_id === member.site_id && a.locality_code === member.locality_code))) {
        throw new MemberSexCorrectionError(403, "OUT_OF_SCOPE", "Member is outside the user's current area scope");
      }
    }
    if (member.sex !== 1) throw new MemberSexCorrectionError(409, "STALE_MEMBER_SEX", "Member sex has changed; refresh before correcting");
    const eligible = member.reported_age_years !== null && member.reported_age_years >= 18 &&
      member.reported_age_years <= 49 && member.marital_status !== null && member.marital_status !== 7;
    const correctionId = randomUUID();
    const now = new Date();
    await tx.update(schema.householdMembers).set({ sex: 2, woman_questionnaire_eligible: eligible, updated_at: now })
      .where(eq(schema.householdMembers.household_member_id, memberId));
    // Existing Expo clients refresh member caches for households returned by incremental pull.
    await tx.update(schema.households).set({ updated_at: now })
      .where(eq(schema.households.household_id, household.household_id));
    await tx.insert(schema.adminCorrections).values({ id: correctionId, entity_type: "member", entity_id: memberId,
      field: "sex", old_value: "1", new_value: "2", reason, corrected_by: actorId, corrected_at: now });
    await tx.insert(schema.adminCorrectionEvents).values({ correction_event_id: correctionId, site_id: member.site_id,
      subject_type: "member", subject_id: memberId, field_name: "sex", old_value: "1", new_value: "2",
      reason_code: "admin_correction", reason_text: reason, source_reference: `admin_corrections:${correctionId}`,
      corrected_by_user_id: actorId, corrected_at: now, created_at: now });

    const [woman] = await tx.select().from(schema.eligibleWomen)
      .where(eq(schema.eligibleWomen.household_member_id, memberId));
    const womanId = woman?.woman_id ?? memberId;
    const subjectIds = [...new Set([memberId, womanId])];
    const [existingTask] = await tx.select().from(schema.followUpTasks).where(and(
      eq(schema.followUpTasks.household_id, household.household_id),
      or(inArray(schema.followUpTasks.woman_id, subjectIds), inArray(schema.followUpTasks.subject_id, subjectIds)),
      or(eq(schema.followUpTasks.form_code, "WQ"), eq(schema.followUpTasks.task_type, "WQ")),
    )).limit(1);
    const [existingResponse] = await tx.select().from(schema.formResponses).where(and(
      eq(schema.formResponses.household_id, household.household_id), eq(schema.formResponses.form_code, "WQ"),
      sql`coalesce(${schema.formResponses.response_status}, 'primary') = 'primary'`, inArray(schema.formResponses.subject_id, subjectIds),
    )).limit(1);
    let taskCreated = false;
    const canReceiveWork = eligible && member.member_status === "active" && member.usual_resident === true &&
      household.baseline_enrollment_status === "enrolled" && !household.closed_reason &&
      (household.cohort_status === null || ["active", "listed", "enrolled"].includes(household.cohort_status)) &&
      (!woman || (woman.wq_status === "pending" && woman.tracking_status === "not_tracked" && woman.current_eligibility_status === "eligible"));
    if (canReceiveWork && !existingTask && !existingResponse) {
      const anchor = woman?.eligibility_start_date ?? household.baseline_completed_date ?? now.toISOString().slice(0, 10);
      if (!woman) await tx.insert(schema.eligibleWomen).values({ woman_id: womanId, household_member_id: memberId,
        household_id: household.household_id, site_id: member.site_id, locality_code: member.locality_code,
        eligibility_start_date: anchor, eligibility_basis: "admin_correction", eligibility_source_event_id: correctionId,
        wq_status: "pending", tracking_status: "not_tracked", current_eligibility_status: "eligible",
        sync_status: "synced", created_at: now, updated_at: now });
      const event = eligibleWomanIdentified.buildEvent({ event_id: correctionId, household_id: household.household_id,
        site_id: member.site_id, locality_code: member.locality_code, woman_id: womanId,
        eligibility_start_date: anchor, recorded_at: now.toISOString(), user_id: actorId });
      await tx.insert(schema.domainEvents).values({ event_id: event.event_id, event_type: event.event_type,
        household_id: household.household_id, site_id: member.site_id, locality_code: member.locality_code,
        subject_type: "woman", subject_id: womanId, event_datetime: now,
        sync_status: "synced", apply_status: "applied", created_at: now });
      await writeTasksFromDescriptors(eligibleWomanIdentified.planWorkflow({ event }));
      taskCreated = true;
    }
    return { correction_id: correctionId, member_id: memberId, field: "sex", old_value: 1, new_value: 2,
      corrected_by: actorId, corrected_at: now, woman_questionnaire_eligible: eligible,
      bwq_task_created: taskCreated, bwq_task_exists: Boolean(existingTask || existingResponse) || taskCreated };
  }));
}
