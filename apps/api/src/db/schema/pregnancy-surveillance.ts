import { date, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { formResponses } from "./visits";

export const pregnancySurveillanceRecords = pgTable("pregnancy_surveillance_records", {
  form_response_id: text("form_response_id")
    .primaryKey()
    .references(() => formResponses.form_response_id),
  woman_id: text("woman_id"),
  household_id: text("household_id"),
  site_id: integer("site_id").notNull(),
  locality_code: text("locality_code").notNull(),
  interview_date: date("interview_date"),
  woman_line_number: text("woman_line_number"),
  woman_name: text("woman_name"),
  husband_name: text("husband_name"),
  displayed_address: text("displayed_address"),
  address_status: integer("address_status"),
  reported_new_address: text("reported_new_address"),
  marital_status: integer("marital_status"),
  sterilization_status: integer("sterilization_status"),
  hysterectomy_status: integer("hysterectomy_status"),
  pregnancy_status: integer("pregnancy_status"),
  lmp_response_json: jsonb("lmp_response_json"),
  tracking_disposition: text("tracking_disposition"),
  stop_reason: text("stop_reason"),
  pregnancy_detected: integer("pregnancy_detected"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
});
