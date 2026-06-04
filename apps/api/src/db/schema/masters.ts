import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";

export const studySites = pgTable("study_sites", {
  site_id: integer("site_id").primaryKey(),
  site_code: text("site_code").notNull(),
  site_name: text("site_name").notNull(),
});

export const studyLocalities = pgTable(
  "study_localities",
  {
    site_id: integer("site_id").notNull(),
    locality_code: text("locality_code").notNull(),
    locality_name: text("locality_name").notNull(),
    locality_type: text("locality_type"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.site_id, t.locality_code] }),
  }),
);

export const mappingFrame = pgTable("mapping_frame", {
  household_id: text("household_id").primaryKey(),
  site_id: integer("site_id").notNull(),
  locality_code: text("locality_code").notNull(),
  structure_map_id: text("structure_map_id").notNull(),
  household_number: text("household_number").notNull(),
  structure_id: text("structure_id").notNull(),
  mapping_status: text("mapping_status").default("listed"),
  baseline_enrollment_status: text("baseline_enrollment_status").default("pending"),
});
