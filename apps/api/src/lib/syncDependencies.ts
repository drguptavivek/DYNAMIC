import { and, eq } from "drizzle-orm";
import { schema } from "../db";
import { getDb } from "./dbContext";

export const MISSING_HHQ_SYNC_ERROR =
  "BWQ is waiting for its household baseline to sync; sync the BHQ first and retry";

export async function requireSyncedHouseholdBaseline(householdId: string): Promise<void> {
  const responses = await getDb()
    .select({ response_status: schema.formResponses.response_status })
    .from(schema.formResponses)
    .where(and(
      eq(schema.formResponses.household_id, householdId),
      eq(schema.formResponses.form_code, "HHQ"),
    ));
  if (!responses.some((response) => ["primary", "accepted"].includes(response.response_status || "primary"))) {
    // A failed parent push must not permanently reject its offline child evidence.
    throw new Error(MISSING_HHQ_SYNC_ERROR);
  }
}
