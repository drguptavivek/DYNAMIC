import { eq } from "drizzle-orm";
import { schema } from "../db";
import { getDb } from "../lib/dbContext";

type FormResponseRow = typeof schema.formResponses.$inferSelect;

export async function holdUnsupportedFormForReview(
  response: FormResponseRow,
  formCode: string,
): Promise<void> {
  const now = new Date();

  await getDb()
    .update(schema.formResponses)
    .set({ response_status: "held_for_review" })
    .where(eq(schema.formResponses.form_response_id, response.form_response_id));

  await getDb().insert(schema.dataQualityFlags).values({
    flag_id: `unsupported_form:${response.form_response_id}`,
    site_id: response.site_id,
    flag_type: "unsupported_form_promotion",
    subject_type: response.subject_type,
    subject_id: response.subject_id,
    task_id: response.task_id,
    duplicate_response_id: response.form_response_id,
    severity: "warning",
    status: "open",
    created_at: now,
    review_note: `${formCode} evidence is stored but typed promotion is not implemented.`,
  });
}
