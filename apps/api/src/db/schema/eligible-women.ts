import { pgTable, text, integer, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { householdMembers } from "./members";
import { households } from "./households";

export const eligibleWomen = pgTable("eligible_women", {
  woman_id: text("woman_id").primaryKey(),
  household_member_id: text("household_member_id")
    .notNull()
    .references(() => householdMembers.household_member_id),
  household_id: text("household_id")
    .notNull()
    .references(() => households.household_id),
  site_id: integer("site_id").notNull(),
  locality_code: text("locality_code").notNull(),
  eligibility_start_date: date("eligibility_start_date"),
  eligibility_source_event_id: text("eligibility_source_event_id"),
  wq_status: text("wq_status").default("pending"),
  tracking_status: text("tracking_status").default("not_tracked"),
  current_eligibility_status: text("current_eligibility_status").default("eligible"),
  eligibility_basis: text("eligibility_basis"),
  woman_permanent_id: text("woman_permanent_id"),
  analysis_eligibility_flag: text("analysis_eligibility_flag"),
  sync_status: text("sync_status").default("local"),
  created_at: timestamp("created_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

export const eligibilityAssessments = pgTable("eligibility_assessments", {
  assessment_id: text("assessment_id").primaryKey(),
  person_id: text("person_id").notNull(),
  household_id: text("household_id").notNull(),
  assessment_date: date("assessment_date").notNull(),
  age_years_used: integer("age_years_used"),
  age_source: text("age_source"),
  sex_used: integer("sex_used"),
  marital_status_used: integer("marital_status_used"),
  usual_resident_used: boolean("usual_resident_used"),
  eligible_wq: boolean("eligible_wq"),
  eligible_pregnancy_tracking: boolean("eligible_pregnancy_tracking"),
  created_event_id: text("created_event_id"),
});
