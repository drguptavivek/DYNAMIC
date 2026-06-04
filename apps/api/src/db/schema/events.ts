import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const domainEvents = pgTable("domain_events", {
  event_id: text("event_id").primaryKey(),
  event_type: text("event_type").notNull(),
  site_id: integer("site_id").notNull(),
  locality_code: text("locality_code").notNull(),
  household_id: text("household_id"),
  subject_type: text("subject_type"),
  subject_id: text("subject_id"),
  visit_id: text("visit_id"),
  task_id: text("task_id"),
  form_response_id: text("form_response_id"),
  event_datetime: timestamp("event_datetime", { withTimezone: true }).notNull(),
  created_offline_at: timestamp("created_offline_at", { withTimezone: true }),
  device_id: text("device_id"),
  sync_status: text("sync_status").default("local"),
  apply_status: text("apply_status").default("applied"),
  created_at: timestamp("created_at", { withTimezone: true }),
});
