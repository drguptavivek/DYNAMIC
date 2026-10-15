import { pgTable, text, integer, primaryKey, unique, timestamp, index } from "drizzle-orm/pg-core";

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

// Pre-existing Ballabgarh household/individual master list. Field workers look
// members up from this list during BHQ individual listing; the uid is the
// hidden fixed identity, hh/fam/ind form the interviewer-facing ID.
export const blbRegistryHouseholds = pgTable(
  "blb_registry_households",
  {
    hh_list_no: text("hh_list_no").notNull(),
    family_no: text("family_no").notNull(),
    head_name: text("head_name"),
    address: text("address"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.hh_list_no, t.family_no] }),
  }),
);

export const blbRegistryIndividuals = pgTable(
  "blb_registry_individuals",
  {
    uid: text("uid").primaryKey(),
    village_code: text("village_code"),
    village_name: text("village_name"),
    phc_code: text("phc_code"),
    phc_name: text("phc_name"),
    hh_list_no: text("hh_list_no"),
    family_no: text("family_no"),
    ind_no: text("ind_no"),
    name: text("name"),
    age_years: integer("age_years"),
    sex: text("sex"),
    status: text("status").notNull().default("alive"),
    domicile: text("domicile"),
    curr_status: text("curr_status"),
    death_date: text("death_date"),
    migrated_out_date: text("migrated_out_date"),
    migration_reason: text("migration_reason"),
    source_age_as_of: text("source_age_as_of"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    lookup: index("blb_registry_individuals_village_hh_family_ind_idx").on(
      t.village_code,
      t.hh_list_no,
      t.family_no,
      t.ind_no,
    ),
  }),
);

/** Singleton generation for cursor-safe HDSS registry snapshots. */
export const blbRegistrySnapshot = pgTable("blb_registry_snapshot", {
  snapshot_key: text("snapshot_key").primaryKey(),
  generation: text("generation").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
});
