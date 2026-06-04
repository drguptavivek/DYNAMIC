import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const adminCorrections = pgTable("admin_corrections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  entity_type: text("entity_type").notNull(), // 'household' | 'member'
  entity_id: text("entity_id").notNull(),
  field: text("field").notNull(),
  old_value: text("old_value"),
  new_value: text("new_value"),
  reason: text("reason"),
  corrected_by: text("corrected_by").notNull(), // user id from JWT
  corrected_at: timestamp("corrected_at", { withTimezone: true }).defaultNow(),
});
