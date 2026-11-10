import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { eligibleWomanIdentified, wqCompleted } from "@dynamic/event-core";
import { buildDetectedPregnancyId } from "@dynamic/shared-domain";
import type { TaskDescriptor } from "@dynamic/shared-workflow";
import { db, schema } from "../db";
import { getDb, runWithDb } from "../lib/dbContext";
import { writeTasksFromDescriptors } from "./taskWriter";

export class MemberWorkflowCorrectionError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const memberCorrectionFields = [
  { key: "sex", label: "Sex", type: "choice", options: [{ value: 1, label: "Male" }, { value: 2, label: "Female" }, { value: 3, label: "Transgender" }] },
  { key: "reported_age_years", label: "Age recorded at BHQ", type: "number", min: 0, max: 120 },
  { key: "marital_status", label: "Marital status recorded at BHQ", type: "choice", options: [
    { value: 1, label: "Currently married" }, { value: 2, label: "Married, but Gauna not performed" },
    { value: 3, label: "Widowed" }, { value: 4, label: "Divorced" }, { value: 5, label: "Separated" },
    { value: 6, label: "Deserted" }, { value: 7, label: "Never married" },
  ] },
  { key: "wq_pregnant", label: "Pregnancy answer in saved BWQ", type: "choice", options: [{ value: 1, label: "Yes" }, { value: 2, label: "No" }, { value: 98, label: "Unsure" }] },
] as const;
type Field = typeof memberCorrectionFields[number]["key"];
type Values = Record<Field, number | null>;
const changesSchema = z.object({ sex: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  reported_age_years: z.number().int().min(0).max(120).optional(), marital_status: z.number().int().min(1).max(7).optional(),
  wq_pregnant: z.union([z.literal(1), z.literal(2), z.literal(98)]).optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Select at least one field");
const inputSchema = z.object({ changes: changesSchema, reason: z.string().trim().min(1).max(1000),
  preview_token: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export function parseMemberWorkflowCorrection(input: unknown) {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new MemberWorkflowCorrectionError(400, "INVALID_INPUT", "Provide supported correction values and a reason of 1–1000 characters");
  return result.data;
}

type Context = {
  actor: typeof schema.users.$inferSelect;
  household: typeof schema.households.$inferSelect;
  member: typeof schema.householdMembers.$inferSelect;
  woman: typeof schema.eligibleWomen.$inferSelect | undefined;
  tasks: (typeof schema.followUpTasks.$inferSelect)[];
  responses: (typeof schema.formResponses.$inferSelect)[];
  pregnancies: (typeof schema.pregnancies.$inferSelect)[];
  drafts: (typeof schema.questionnaireDrafts.$inferSelect)[];
  corrections: (typeof schema.adminCorrectionEvents.$inferSelect)[];
  source: typeof schema.formResponses.$inferSelect | undefined;
  current: Values;
};
const openStates = new Set(["open", "planned", "pending", "due", "urgent", "overdue", "in_progress", "disabled"]);
const completedAt = (response: typeof schema.formResponses.$inferSelect) => response.created_offline_at ?? response.synced_at ?? response.created_at ?? new Date(0);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const eligible = (value: Values) => value.sex === 2 && value.reported_age_years !== null && value.reported_age_years >= 18 && value.reported_age_years <= 49 && value.marital_status !== null && value.marital_status !== 7;

async function withMember<T>(memberId: string, actorId: string, work: (context: Context) => Promise<T>): Promise<T> {
  return getDb().transaction(async tx => runWithDb(tx as unknown as typeof db, async () => {
    const [actor] = await tx.select().from(schema.users).where(eq(schema.users.user_id, actorId)).for("share");
    if (!actor?.active || !["central_admin", "site_data_manager", "site_research_scientist"].includes(actor.role)) {
      throw new MemberWorkflowCorrectionError(403, "INSUFFICIENT_PERMISSIONS", "Current user cannot correct member workflow");
    }
    if (actor.staff_id) {
      const [profile] = await tx.select().from(schema.dataAccessProfiles).where(eq(schema.dataAccessProfiles.staff_id, actor.staff_id));
      if (profile && (!profile.can_access_pii || !profile.can_access_raw_crfs)) throw new MemberWorkflowCorrectionError(403, "INSUFFICIENT_DATA_ACCESS", "PII and raw CRF access are required");
    }
    const [known] = await tx.select().from(schema.householdMembers).where(eq(schema.householdMembers.household_member_id, memberId));
    if (!known) throw new MemberWorkflowCorrectionError(404, "MEMBER_NOT_FOUND", "Member not found");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`form-opportunity|HHQ|${known.household_id}`},0))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`woman-pathway|${known.household_id}|${memberId}`},0))`);
    const [household] = await tx.select().from(schema.households).where(eq(schema.households.household_id, known.household_id)).for("update");
    const [member] = await tx.select().from(schema.householdMembers).where(eq(schema.householdMembers.household_member_id, memberId)).for("update");
    if (!household || !member || member.household_id !== household.household_id || member.site_id !== household.site_id || member.locality_code !== household.locality_code) {
      throw new MemberWorkflowCorrectionError(409, "MEMBER_CONTEXT_CHANGED", "Member household context needs review");
    }
    if (actor.role !== "central_admin") {
      const assignments = (await tx.select().from(schema.userAreaAssignments).where(eq(schema.userAreaAssignments.user_id, actorId)))
        .filter(a => (!a.active_from || a.active_from <= today()) && (!a.active_to || a.active_to >= today()));
      if (actor.site_id !== member.site_id || (assignments.length > 0 && !assignments.some(a => a.site_id === member.site_id && a.locality_code === member.locality_code))) {
        throw new MemberWorkflowCorrectionError(403, "OUT_OF_SCOPE", "Member is outside the user's current area scope");
      }
    }
    const [woman] = await tx.select().from(schema.eligibleWomen).where(eq(schema.eligibleWomen.household_member_id, memberId)).for("update");
    const ids = [...new Set([memberId, woman?.woman_id ?? memberId])];
    const pregnancies = await tx.select().from(schema.pregnancies).where(and(eq(schema.pregnancies.household_id, household.household_id),
      or(inArray(schema.pregnancies.woman_id, ids), eq(schema.pregnancies.household_member_id, memberId))));
    const allIds = [...ids, ...pregnancies.map(p => p.pregnancy_id)];
    const tasks = await tx.select().from(schema.followUpTasks).where(and(eq(schema.followUpTasks.household_id, household.household_id),
      or(inArray(schema.followUpTasks.woman_id, ids), inArray(schema.followUpTasks.subject_id, allIds), inArray(schema.followUpTasks.pregnancy_id, allIds))));
    const responses = await tx.select().from(schema.formResponses).where(and(eq(schema.formResponses.household_id, household.household_id),
      or(inArray(schema.formResponses.subject_id, allIds), inArray(schema.formResponses.task_id, tasks.map(t => t.task_id)))));
    const drafts = await tx.select().from(schema.questionnaireDrafts).where(and(eq(schema.questionnaireDrafts.household_id, household.household_id),
      or(inArray(schema.questionnaireDrafts.subject_id, allIds), inArray(schema.questionnaireDrafts.task_id, tasks.map(t => t.task_id)))));
    const corrections = await tx.select().from(schema.adminCorrectionEvents).where(and(eq(schema.adminCorrectionEvents.subject_type, "member"), eq(schema.adminCorrectionEvents.subject_id, memberId)));
    const source = responses.filter(r => r.form_code === "WQ" && (r.response_status ?? "primary") === "primary")
      .sort((a, b) => completedAt(b).getTime() - completedAt(a).getTime() || b.form_response_id.localeCompare(a.form_response_id))[0];
    let pregnancyAnswer = source ? Number((source.answers_json as Record<string, unknown>)?.wq_pregnant) : NaN;
    if (source) {
      const overlay = corrections.filter(c => c.field_name === "wq_pregnant" && c.source_reference === `form_responses:${source.form_response_id}`)
        .sort((a, b) => b.corrected_at.getTime() - a.corrected_at.getTime() || b.correction_event_id.localeCompare(a.correction_event_id))[0];
      if (overlay) pregnancyAnswer = Number(overlay.new_value);
    }
    return work({ actor, household, member, woman, tasks, responses, pregnancies, drafts, corrections, source,
      current: { sex: member.sex, reported_age_years: member.reported_age_years, marital_status: member.marital_status,
        wq_pregnant: [1, 2, 98].includes(pregnancyAnswer) ? pregnancyAnswer : null } });
  }));
}

export function planMemberWorkflowCorrection(context: Context, input: ReturnType<typeof parseMemberWorkflowCorrection>) {
  const next: Values = { ...context.current, ...input.changes };
  const changes = memberCorrectionFields.filter(field => input.changes[field.key] !== undefined && next[field.key] !== context.current[field.key])
    .map(field => ({ field: field.key, label: field.label, old_value: context.current[field.key], new_value: next[field.key] }));
  const warnings: string[] = [];
  if (changes.length === 0) warnings.push("No values have changed.");
  if (input.changes.wq_pregnant !== undefined && !context.source) warnings.push("A completed, accepted BWQ is required to correct its pregnancy answer.");
  if (context.source && next.wq_pregnant === null) warnings.push("The saved BWQ has no known pregnancy answer. Correct that answer explicitly before recalculating this workflow.");
  const sourceDate = context.source ? completedAt(context.source) : null;
  const clinicalEvidence = context.responses.some(r => (r.response_status ?? "primary") === "primary" &&
    ["PEF", "PSF", "PFF", "POF", "UF", "BAF", "SBF", "NFF", "CDF"].includes(r.form_code) && (!sourceDate || completedAt(r) >= sourceDate));
  const advancedPregnancy = context.pregnancies.some(p => p.enrollment_date || p.outcome_recorded_date || p.pregnancy_status === "enrolled");
  const routingChanged = eligible(next) !== eligible(context.current) || (next.wq_pregnant === 1) !== (context.current.wq_pregnant === 1) ||
    Boolean(context.source && context.current.wq_pregnant === null && next.wq_pregnant !== null);
  const completedClinicalTask = context.tasks.some(t => (["completed", "completed_on_time", "completed_late"].includes(t.status ?? "") || t.completed_at) && ["PEF", "PSF", "PFF", "POF", "UF", "BAF", "SBF", "NFF", "CDF"].includes(t.form_code ?? t.task_type));
  const laterDetection = sourceDate && context.pregnancies.some(p => p.detected_date && p.detected_date > sourceDate.toISOString().slice(0, 10) && p.pregnancy_status === "active");
  if (routingChanged && (clinicalEvidence || advancedPregnancy || completedClinicalTask || laterDetection)) warnings.push("Later pregnancy/surveillance evidence exists. Central clinical review is required before changing this pathway.");
  let inferredDateOfBirth: string | undefined;
  if (changes.some(change => change.field === "reported_age_years")) {
    const asOf = context.member.reported_age_as_of_date ?? context.household.baseline_completed_date;
    if (!asOf) warnings.push("The original age reference date is missing. Review the date of birth before correcting age.");
    else if (context.member.date_of_birth_precision === "inferred_from_age" || !context.member.date_of_birth) {
      inferredDateOfBirth = `${Number(asOf.slice(0, 4)) - next.reported_age_years!}-01-01`;
    } else {
      const dob = context.member.date_of_birth;
      const reportedAge = Number(asOf.slice(0, 4)) - Number(dob.slice(0, 4)) - (asOf.slice(5) < dob.slice(5) ? 1 : 0);
      if (reportedAge !== next.reported_age_years) warnings.push("The corrected age conflicts with the reported date of birth. Review the original birth date rather than replacing it.");
    }
  }
  if (context.member.member_status !== "active" || !context.member.usual_resident || context.household.baseline_enrollment_status !== "enrolled" ||
    context.household.closed_reason || (context.household.cohort_status !== null && !["active", "listed", "enrolled"].includes(context.household.cohort_status)) ||
    context.woman?.tracking_status === "terminated" || ["deceased", "excluded"].includes(context.woman?.current_eligibility_status ?? "")) {
    warnings.push("This member or household is inactive, excluded or closed. Review is required before correcting its workflow.");
  }
  const womanId = context.woman?.woman_id ?? context.member.household_member_id;
  const anchor = context.woman?.eligibility_start_date ?? context.household.baseline_completed_date ?? today();
  const eventInput = { event_id: "member-correction-preview", site_id: context.member.site_id, locality_code: context.member.locality_code,
    household_id: context.member.household_id, woman_id: womanId, recorded_at: new Date().toISOString(), user_id: context.actor.user_id };
  let descriptors: TaskDescriptor[] = [];
  if (routingChanged && eligible(next)) {
    if (context.source) {
      const answers = context.source.answers_json as Record<string, unknown>;
      const value = typeof answers.wq_interview_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(answers.wq_interview_date) ? answers.wq_interview_date : completedAt(context.source).toISOString().slice(0, 10);
      descriptors = wqCompleted.planWorkflow({ event: wqCompleted.buildEvent({ ...eventInput,
        form_response_id: context.source.form_response_id, task_id: context.source.task_id ?? undefined,
        completed_date: value, wq_pregnant: next.wq_pregnant === 1 }) });
    } else {
      descriptors = eligibleWomanIdentified.planWorkflow({ event: eligibleWomanIdentified.buildEvent({ ...eventInput, eligibility_start_date: anchor }) });
    }
  }
  const protectedTaskIds = new Set(context.responses.filter(r => (r.response_status ?? "primary") === "primary").map(r => r.task_id));
  const toWithdraw = context.tasks.filter(t => routingChanged && openStates.has(t.status ?? "planned") && !protectedTaskIds.has(t.task_id) &&
    ((!eligible(next) && ["WQ", "PSF", "PEF"].includes(t.form_code ?? t.task_type)) ||
      (context.source && next.wq_pregnant !== 1 && (t.form_code ?? t.task_type) === "PEF")));
  const toCreate = descriptors.filter(d => {
    const existing = context.tasks.find(t => t.task_key === d.task_key);
    if (existing) return existing.status === "superseded" && existing.closed_reason === "member_workflow_correction" && !protectedTaskIds.has(existing.task_id);
    if (d.form_code === "WQ") return !context.tasks.some(t => (t.form_code ?? t.task_type) === "WQ");
    if (d.form_code === "PEF") return !context.tasks.some(t => (t.form_code ?? t.task_type) === "PEF" && openStates.has(t.status ?? "planned"));
    return true;
  });
  if (routingChanged && eligible(next) && !context.source && context.tasks.some(t => (t.form_code ?? t.task_type) === "WQ") &&
    !toCreate.some(d => d.form_code === "WQ") && !context.tasks.some(t => (t.form_code ?? t.task_type) === "WQ" &&
      openStates.has(t.status ?? "planned") && t.status !== "disabled" && t.action_state !== "disabled" && t.form_availability !== "disabled")) {
    warnings.push("Existing BWQ work is completed or closed without an accepted completed BWQ. A correction/revisit review is required; the old task will not be reopened.");
  }
  if (toWithdraw.some(t => context.drafts.some(d => d.task_id === t.task_id && d.draft_status === "active"))) {
    warnings.push("An active saved draft exists on work that would be withdrawn. Review the draft before changing this pathway.");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ actor: context.actor, household: context.household, member: context.member,
    woman: context.woman, tasks: [...context.tasks].sort((a, b) => a.task_id.localeCompare(b.task_id)),
    responses: [...context.responses].sort((a, b) => a.form_response_id.localeCompare(b.form_response_id)),
    pregnancies: [...context.pregnancies].sort((a, b) => a.pregnancy_id.localeCompare(b.pregnancy_id)),
    drafts: [...context.drafts].sort((a, b) => a.draft_id.localeCompare(b.draft_id)),
    corrections: [...context.corrections].sort((a, b) => a.correction_event_id.localeCompare(b.correction_event_id)),
    changes, reason: input.reason, anchor, next, inferredDateOfBirth,
    descriptors: [...toCreate].sort((a, b) => a.task_key.localeCompare(b.task_key)), withdrawn: toWithdraw.map(t => t.task_id).sort(), warnings })).digest("hex");
  return { preview_token: fingerprint, changes, tasks_to_create: toCreate.map(d => ({ form_code: d.form_code, target_date: d.target_date })),
    tasks_to_withdraw: toWithdraw.map(t => ({ task_id: t.task_id, form_code: t.form_code ?? t.task_type })), warnings,
    can_apply: warnings.length === 0, next, descriptors: toCreate, withdrawn: toWithdraw, anchor, womanId, inferredDateOfBirth, routingChanged };
}

export async function getMemberCorrectionContext(memberId: string, actorId: string) {
  return withMember(memberId, actorId, async c => ({ member_id: memberId, household_id: c.member.household_id, name: c.member.name,
    current: c.current, source_response_id: c.source?.form_response_id ?? null,
    fields: memberCorrectionFields.map(field => ({ ...field, editable: field.key !== "wq_pregnant" || Boolean(c.source) })) }));
}
export async function previewMemberWorkflowCorrection(memberId: string, actorId: string, body: unknown) {
  const input = parseMemberWorkflowCorrection(body);
  return withMember(memberId, actorId, async c => {
    const { next, descriptors, withdrawn, anchor, womanId, inferredDateOfBirth, routingChanged, ...preview } = planMemberWorkflowCorrection(c, input);
    return preview;
  });
}

export async function applyMemberWorkflowCorrection(memberId: string, actorId: string, body: unknown) {
  const input = parseMemberWorkflowCorrection(body);
  if (!input.preview_token) throw new MemberWorkflowCorrectionError(400, "PREVIEW_REQUIRED", "Preview the correction before applying it");
  return withMember(memberId, actorId, async c => {
    const plan = planMemberWorkflowCorrection(c, input);
    if (plan.preview_token !== input.preview_token) throw new MemberWorkflowCorrectionError(409, "STALE_PREVIEW", "Member data or workflow changed. Refresh and preview again");
    if (!plan.can_apply) throw new MemberWorkflowCorrectionError(409, "CORRECTION_REQUIRES_REVIEW", plan.warnings.join(" "));
    const now = new Date(Math.max(Date.now(), ...c.corrections.map(correction => correction.corrected_at.getTime() + 1))), eventId = randomUUID(), correctionIds: string[] = [];
    for (const change of plan.changes) {
      const id = randomUUID(); correctionIds.push(id);
      await getDb().insert(schema.adminCorrections).values({ id, entity_type: "member", entity_id: memberId, field: change.field,
        old_value: change.old_value === null ? null : String(change.old_value), new_value: String(change.new_value), reason: input.reason, corrected_by: actorId, corrected_at: now });
      await getDb().insert(schema.adminCorrectionEvents).values({ correction_event_id: id, site_id: c.member.site_id, subject_type: "member", subject_id: memberId,
        field_name: change.field, old_value: change.old_value === null ? null : String(change.old_value), new_value: String(change.new_value),
        reason_code: "member_workflow_correction", reason_text: input.reason,
        source_reference: change.field === "wq_pregnant" ? `form_responses:${c.source!.form_response_id}` : `admin_corrections:${id}`,
        corrected_by_user_id: actorId, corrected_at: now, created_at: now });
    }
    const { wq_pregnant, ...memberValues } = plan.next;
    await getDb().update(schema.householdMembers).set({ ...memberValues, ...(plan.inferredDateOfBirth ? { date_of_birth: plan.inferredDateOfBirth, date_of_birth_precision: "inferred_from_age" } : {}), woman_questionnaire_eligible: eligible(plan.next), updated_at: now })
      .where(eq(schema.householdMembers.household_member_id, memberId));
    await getDb().update(schema.households).set({ updated_at: now }).where(eq(schema.households.household_id, c.member.household_id));
    if (plan.routingChanged && eligible(plan.next) && !c.woman) {
      await getDb().insert(schema.eligibleWomen).values({ woman_id: plan.womanId, household_member_id: memberId, household_id: c.member.household_id,
        site_id: c.member.site_id, locality_code: c.member.locality_code, eligibility_start_date: plan.anchor, eligibility_source_event_id: eventId,
        eligibility_basis: "admin_correction", wq_status: c.source ? "completed" : "pending", tracking_status: c.source ? (plan.next.wq_pregnant === 1 ? "enrolled" : "not_pregnant") : "not_tracked",
        current_eligibility_status: "eligible", sync_status: "synced", created_at: now, updated_at: now });
    } else if (plan.routingChanged && c.woman) {
      await getDb().update(schema.eligibleWomen).set({ current_eligibility_status: eligible(plan.next) ? "eligible" : "not_eligible",
        ...(!eligible(plan.next) ? { tracking_status: "not_tracked" } : c.source ? { tracking_status: plan.next.wq_pregnant === 1 ? "enrolled" : "not_pregnant" } : {}), updated_at: now })
        .where(eq(schema.eligibleWomen.woman_id, plan.womanId));
    }
    await getDb().insert(schema.domainEvents).values({ event_id: eventId, event_type: "member_workflow_corrected", household_id: c.member.household_id,
      site_id: c.member.site_id, locality_code: c.member.locality_code, subject_type: "member", subject_id: memberId,
      form_response_id: c.source?.form_response_id, event_datetime: now, sync_status: "synced", apply_status: "applied", created_at: now });
    let pregnancyId: string | undefined;
    if (plan.routingChanged && c.source && eligible(plan.next) && wq_pregnant === 1) {
      const detected = c.pregnancies.find(p => p.pregnancy_status === "active" && !p.enrollment_date);
      pregnancyId = detected?.pregnancy_id ?? buildDetectedPregnancyId(plan.womanId, c.source.form_response_id);
      if (!detected) await getDb().insert(schema.pregnancies).values({ pregnancy_id: pregnancyId, woman_id: plan.womanId,
        household_member_id: memberId, household_id: c.member.household_id, site_id: c.member.site_id, locality_code: c.member.locality_code,
        pregnancy_sequence: Math.max(0, ...c.pregnancies.map(p => p.pregnancy_sequence)) + 1, pregnancy_status: "active",
        detected_date: plan.descriptors.find(d => d.form_code === "PEF")?.anchor_date ?? plan.anchor, detection_source: "wq_admin_correction", source_event_id: eventId,
        sync_status: "synced", created_at: now, updated_at: now }).onConflictDoUpdate({ target: schema.pregnancies.pregnancy_id,
          set: { pregnancy_status: "active", updated_at: now } });
    } else if (plan.routingChanged && c.source && (wq_pregnant !== 1 || !eligible(plan.next))) {
      for (const pregnancy of c.pregnancies.filter(p => p.pregnancy_status === "active" && !p.enrollment_date && !p.outcome_recorded_date)) {
        await getDb().update(schema.pregnancies).set({ pregnancy_status: "closed", updated_at: now }).where(eq(schema.pregnancies.pregnancy_id, pregnancy.pregnancy_id));
      }
    }
    for (const task of plan.withdrawn) await getDb().update(schema.followUpTasks).set({ status: "superseded", action_state: "disabled",
      closed_at: now, closed_reason: "member_workflow_correction", superseded_by_event_id: eventId, updated_at: now })
      .where(eq(schema.followUpTasks.task_id, task.task_id));
    const descriptors = plan.descriptors.map(d => ({ ...d, source_event_id: eventId, ...(d.form_code === "PEF" ? { pregnancy_id: pregnancyId } : {}) }));
    for (const descriptor of descriptors) {
      const existing = c.tasks.find(t => t.task_key === descriptor.task_key);
      if (existing) await getDb().update(schema.followUpTasks).set({ status: "planned", action_state: descriptor.action_state,
        closed_at: null, closed_reason: null, superseded_by_event_id: null, source_event_id: eventId, pregnancy_id: descriptor.pregnancy_id ?? null, updated_at: now })
        .where(eq(schema.followUpTasks.task_id, existing.task_id));
      else await writeTasksFromDescriptors([descriptor]);
    }
    return { correction_ids: correctionIds, created_tasks: plan.tasks_to_create.length, withdrawn_tasks: plan.tasks_to_withdraw.length,
      message: "Correction applied. The assigned field worker will receive the current tasks on sync." };
  });
}
