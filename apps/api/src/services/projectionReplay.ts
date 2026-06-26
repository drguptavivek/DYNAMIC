import { reduceHouseholdProjectionEvents, type DomainEventEnvelope } from "@dynamic/event-core";
import { and, eq } from "drizzle-orm";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";
import { toHhqProjectionEvent } from "./promotionEventBridge";

export async function rebuildHhqHouseholdProjection(householdId: string): Promise<void> {
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
    return;
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
    return;
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
}
