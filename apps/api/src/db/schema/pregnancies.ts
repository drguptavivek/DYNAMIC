import { pgTable, text, integer, date, timestamp, jsonb } from "drizzle-orm/pg-core";
import { eligibleWomen } from "./eligible-women";

export const pregnancies = pgTable("pregnancies", {
  pregnancy_id: text("pregnancy_id").primaryKey(),
  woman_id: text("woman_id")
    .notNull()
    .references(() => eligibleWomen.woman_id),
  household_member_id: text("household_member_id").notNull(),
  household_id: text("household_id").notNull(),
  site_id: integer("site_id").notNull(),
  locality_code: text("locality_code").notNull(),
  pregnancy_sequence: integer("pregnancy_sequence").notNull(),
  pregnancy_status: text("pregnancy_status").default("active"),
  detected_date: date("detected_date"),
  enrollment_date: date("enrollment_date"),
  detection_source: text("detection_source"),
  lmp_date: date("lmp_date"),
  lmp_precision: text("lmp_precision"),
  edd_date: date("edd_date"),
  outcome_recorded_date: date("outcome_recorded_date"),
  gestational_age_at_enrollment: integer("gestational_age_at_enrollment"),
  current_conditions: jsonb("current_conditions"),
  current_symptoms: jsonb("current_symptoms"),
  anthropometrics: jsonb("anthropometrics"),
  source_event_id: text("source_event_id"),
  sync_status: text("sync_status").default("local"),
  created_at: timestamp("created_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

export const ultrasoundRecords = pgTable("ultrasound_records", {
  ultrasound_id: text("ultrasound_id").primaryKey(),
  pregnancy_id: text("pregnancy_id")
    .notNull()
    .references(() => pregnancies.pregnancy_id),
  woman_id: text("woman_id").notNull(),
  household_id: text("household_id").notNull(),
  site_id: integer("site_id").notNull(),
  report_date: date("report_date"),
  report_sequence: integer("report_sequence").notNull(),
  gestational_age: integer("gestational_age"),
  attachment_reference: text("attachment_reference"),
  source_form_response_id: text("source_form_response_id"),
  created_at: timestamp("created_at", { withTimezone: true }),
});
