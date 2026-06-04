import { pgTable, text, integer, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { pregnancies } from "./pregnancies";

export const pregnancyOutcomes = pgTable("pregnancy_outcomes", {
  pregnancy_outcome_id: text("pregnancy_outcome_id").primaryKey(),
  pregnancy_id: text("pregnancy_id")
    .notNull()
    .references(() => pregnancies.pregnancy_id),
  outcome_date: date("outcome_date").notNull(),
  outcome_type: text("outcome_type").notNull(),
  gestational_age_at_outcome: integer("gestational_age_at_outcome"),
  live_birth_count: integer("live_birth_count").default(0),
  fetal_loss_count: integer("fetal_loss_count").default(0),
  source_form_response_id: text("source_form_response_id"),
  created_at: timestamp("created_at", { withTimezone: true }),
});

export const children = pgTable("children", {
  child_id: text("child_id").primaryKey(),
  birth_id: text("birth_id").notNull(),
  pregnancy_id: text("pregnancy_id")
    .notNull()
    .references(() => pregnancies.pregnancy_id),
  woman_id: text("woman_id").notNull(),
  household_id: text("household_id").notNull(),
  site_id: integer("site_id").notNull(),
  birth_rank: integer("birth_rank").notNull(),
  birth_date: date("birth_date"),
  birth_status: text("birth_status"),
  live_birth_status: boolean("live_birth_status"),
  current_vital_status: text("current_vital_status").default("alive"),
  death_date: date("death_date"),
  gestational_age_at_birth: integer("gestational_age_at_birth"),
  sex: integer("sex"),
  birth_weight_grams: integer("birth_weight_grams"),
  source_event_id: text("source_event_id"),
  sync_status: text("sync_status").default("local"),
  created_at: timestamp("created_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});
