import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { households } from "./households";
import { users } from "./sync-auth";

export const fieldWorkerHouseholdAssignments = pgTable(
  "field_worker_household_assignments",
  {
    assignment_id: text("assignment_id").primaryKey(),
    household_id: text("household_id")
      .notNull()
      .references(() => households.household_id),
    user_id: text("user_id")
      .notNull()
      .references(() => users.user_id),
    assigned_by_user_id: text("assigned_by_user_id")
      .notNull()
      .references(() => users.user_id),
    assigned_at: timestamp("assigned_at", { withTimezone: true }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    householdUserUnique: unique().on(t.household_id, t.user_id),
  }),
);
