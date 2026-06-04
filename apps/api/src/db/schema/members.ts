import { pgTable, text, integer, boolean, date, timestamp, unique } from "drizzle-orm/pg-core";
import { households } from "./households";

export const householdMembers = pgTable(
  "household_members",
  {
    household_member_id: text("household_member_id").primaryKey(),
    household_id: text("household_id")
      .notNull()
      .references(() => households.household_id),
    member_number: integer("member_number").notNull(),
    site_id: integer("site_id").notNull(),
    locality_code: text("locality_code").notNull(),
    name: text("name"),
    relationship_to_head: integer("relationship_to_head"),
    sex: integer("sex"),
    last_residence_place: integer("last_residence_place"),
    residence_months: integer("residence_months"),
    residence_years: integer("residence_years"),
    date_of_birth: date("date_of_birth"),
    date_of_birth_precision: text("date_of_birth_precision").default("inferred_from_age"),
    reported_age_years: integer("reported_age_years"),
    reported_age_as_of_date: date("reported_age_as_of_date"),
    dob_inference_rule_version: text("dob_inference_rule_version"),
    marital_status: integer("marital_status"),
    woman_questionnaire_eligible: boolean("woman_questionnaire_eligible").default(false),
    birth_registration_status: integer("birth_registration_status"),
    ever_attended_school: integer("ever_attended_school"),
    highest_grade_completed: integer("highest_grade_completed"),
    member_status: text("member_status").default("active"),
    usual_resident: boolean("usual_resident").default(true),
    member_source: text("member_source").default("baseline"),
    sync_status: text("sync_status").default("local"),
    created_at: timestamp("created_at", { withTimezone: true }),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: unique().on(t.household_id, t.member_number),
  }),
);
