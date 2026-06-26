import {
  promoteFormSubmission,
  reduceHouseholdProjectionEvents,
  reducePregnancyProjectionEvents,
  type DomainEventEnvelope,
} from "@dynamic/event-core";
import { and, eq } from "drizzle-orm";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import {
  toHhqProjectionEvent,
  type FormAnswers,
} from "./promotionEventBridge";

export interface ProjectionReplayResult {
  rebuilt: number;
  skipped: number;
}

type DomainEventRow = typeof schema.domainEvents.$inferSelect;

export async function rebuildHhqHouseholdProjection(householdId: string): Promise<ProjectionReplayResult> {
  const events = await getDb()
    .select()
    .from(schema.domainEvents)
    .where(
      and(
        eq(schema.domainEvents.household_id, householdId),
        eq(schema.domainEvents.event_type, "household_baseline_confirmed"),
      ),
    );

  if (events.length === 0) {
    return { rebuilt: 0, skipped: 1 };
  }

  const envelopes: DomainEventEnvelope[] = [];
  for (const event of events) {
    if (!event.form_response_id) {
      continue;
    }

    const [response] = await getDb()
      .select()
      .from(schema.formResponses)
      .where(eq(schema.formResponses.form_response_id, event.form_response_id))
      .limit(1);
    if (!response) {
      continue;
    }

    envelopes.push(toHhqProjectionEvent(event, response));
  }

  const projection = reduceHouseholdProjectionEvents(envelopes);
  if (!projection) {
    return { rebuilt: 0, skipped: 1 };
  }

  await getDb()
    .update(schema.households)
    .set({
      site_id: projection.site_id,
      locality_code: projection.locality_code,
      structure_map_id: projection.structure_map_id || undefined,
      household_number: projection.household_number || undefined,
      baseline_enrollment_status: projection.enrollment_status,
      baseline_completed_date: projection.baseline_date || undefined,
      updated_at: new Date(),
    })
    .where(eq(schema.households.household_id, projection.household_id));

  return { rebuilt: 1, skipped: 0 };
}

export async function rebuildPregnancyProjection(
  pregnancyId: string,
): Promise<ProjectionReplayResult> {
  const events = await getDb()
    .select()
    .from(schema.domainEvents)
    .where(
      and(
        eq(schema.domainEvents.subject_type, "pregnancy"),
        eq(schema.domainEvents.subject_id, pregnancyId),
        eq(schema.domainEvents.event_type, "pregnancy_enrolled"),
      ),
    );

  if (events.length === 0) {
    return { rebuilt: 0, skipped: 1 };
  }

  const [pregnancy] = await getDb()
    .select()
    .from(schema.pregnancies)
    .where(eq(schema.pregnancies.pregnancy_id, pregnancyId))
    .limit(1);
  if (!pregnancy) {
    return { rebuilt: 0, skipped: 1 };
  }

  const envelopes: DomainEventEnvelope[] = [];
  for (const event of events) {
    const envelope = await toStoredPregnancyProjectionEvent(event, pregnancy);
    if (envelope) {
      envelopes.push(envelope);
    }
  }

  const projection = reducePregnancyProjectionEvents(envelopes);
  if (!projection) {
    return { rebuilt: 0, skipped: 1 };
  }

  await getDb()
    .update(schema.pregnancies)
    .set({
      enrollment_date: projection.enrollment_date || undefined,
      pregnancy_status: projection.pregnancy_status,
      source_event_id: projection.source_event_id,
      updated_at: new Date(),
    })
    .where(eq(schema.pregnancies.pregnancy_id, projection.pregnancy_id));

  return { rebuilt: 1, skipped: 0 };
}

export async function rebuildHouseholdProjections(
  householdId: string,
): Promise<ProjectionReplayResult> {
  const householdResult = await rebuildHhqHouseholdProjection(householdId);
  const pregnancies = await getDb()
    .select({ pregnancy_id: schema.pregnancies.pregnancy_id })
    .from(schema.pregnancies)
    .where(eq(schema.pregnancies.household_id, householdId));

  let rebuilt = householdResult.rebuilt;
  let skipped = householdResult.skipped;
  for (const pregnancy of pregnancies) {
    const result = await rebuildPregnancyProjection(pregnancy.pregnancy_id);
    rebuilt += result.rebuilt;
    skipped += result.skipped;
  }

  return { rebuilt, skipped };
}

export async function rebuildAllProjectionRows(): Promise<ProjectionReplayResult> {
  const householdEvents = await getDb()
    .selectDistinct({ household_id: schema.domainEvents.household_id })
    .from(schema.domainEvents)
    .where(eq(schema.domainEvents.event_type, "household_baseline_confirmed"));
  const pregnancyEvents = await getDb()
    .selectDistinct({ pregnancy_id: schema.domainEvents.subject_id })
    .from(schema.domainEvents)
    .where(eq(schema.domainEvents.event_type, "pregnancy_enrolled"));

  let rebuilt = 0;
  let skipped = 0;
  for (const event of householdEvents) {
    if (!event.household_id) {
      skipped++;
      continue;
    }
    const result = await rebuildHhqHouseholdProjection(event.household_id);
    rebuilt += result.rebuilt;
    skipped += result.skipped;
  }

  for (const event of pregnancyEvents) {
    if (!event.pregnancy_id) {
      skipped++;
      continue;
    }
    const result = await rebuildPregnancyProjection(event.pregnancy_id);
    rebuilt += result.rebuilt;
    skipped += result.skipped;
  }

  return { rebuilt, skipped };
}

async function toStoredPregnancyProjectionEvent(
  event: DomainEventRow,
  pregnancy: typeof schema.pregnancies.$inferSelect,
): Promise<DomainEventEnvelope | null> {
  if (!event.form_response_id) {
    return null;
  }

  const [response] = await getDb()
    .select()
    .from(schema.formResponses)
    .where(eq(schema.formResponses.form_response_id, event.form_response_id))
    .limit(1);
  if (!response) {
    return null;
  }

  const promotion = promoteFormSubmission({
    form_code: response.form_code,
    event_id: event.event_id,
    site_id: pregnancy.site_id,
    locality_code: pregnancy.locality_code,
    household_id: pregnancy.household_id,
    subject_id: response.subject_id,
    answers_json: (response.answers_json || {}) as FormAnswers,
    recorded_at: (event.event_datetime ?? event.created_at ?? new Date()).toISOString(),
    task_id: response.task_id,
    form_response_id: response.form_response_id,
    device_id: response.device_id,
    apply_status: (event.apply_status || "applied") as DomainEventEnvelope["apply_status"],
    context: {
      pregnancy_id: pregnancy.pregnancy_id,
      woman_id: pregnancy.woman_id,
      household_member_id: pregnancy.household_member_id,
    },
  });
  return (promotion?.event as DomainEventEnvelope | undefined) ?? null;
}
