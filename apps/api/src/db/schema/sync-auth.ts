import { pgTable, text, integer, boolean, date, timestamp, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  user_id: text("user_id").primaryKey(),
  staff_id: text("staff_id").references(() => studyStaffMembers.staff_id),
  username: text("username").notNull().unique(),
  display_name: text("display_name"),
  email: text("email"),
  role: text("role").notNull(),
  site_id: integer("site_id"),
  password_hash: text("password_hash").notNull(),
  active: boolean("active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

export const institutions = pgTable("institutions", {
  institution_id: text("institution_id").primaryKey(),
  institution_name: text("institution_name").notNull(),
  country: text("country").notNull(),
  institution_type: text("institution_type").notNull(),
  active: boolean("active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

export const studyStaffMembers = pgTable("study_staff_members", {
  staff_id: text("staff_id").primaryKey(),
  institution_id: text("institution_id")
    .notNull()
    .references(() => institutions.institution_id),
  full_name: text("full_name").notNull(),
  email: text("email"),
  designation: text("designation").notNull(),
  country: text("country").notNull(),
  active: boolean("active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

export const dataAccessProfiles = pgTable(
  "data_access_profiles",
  {
    profile_id: text("profile_id").primaryKey(),
    staff_id: text("staff_id")
      .notNull()
      .references(() => studyStaffMembers.staff_id),
    can_access_pii: boolean("can_access_pii").default(false),
    can_access_raw_crfs: boolean("can_access_raw_crfs").default(false),
    can_access_deidentified_exports: boolean("can_access_deidentified_exports").default(false),
    can_access_aggregate_dashboards: boolean("can_access_aggregate_dashboards").default(false),
    can_access_admin_audit: boolean("can_access_admin_audit").default(false),
    created_at: timestamp("created_at", { withTimezone: true }),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    staffUnique: unique().on(t.staff_id),
  }),
);

export const devices = pgTable("devices", {
  device_id: text("device_id").primaryKey(),
  device_name: text("device_name"),
  user_id: text("user_id").references(() => users.user_id),
  authorized: boolean("authorized").notNull().default(true),
  deauthorized_at: timestamp("deauthorized_at", { withTimezone: true }),
  deauthorized_by_user_id: text("deauthorized_by_user_id").references(() => users.user_id),
  last_sync_at: timestamp("last_sync_at", { withTimezone: true }),
  registered_at: timestamp("registered_at", { withTimezone: true }),
});

export const refreshTokenSessions = pgTable("refresh_token_sessions", {
  session_id: text("session_id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.user_id),
  token_hash: text("token_hash").notNull(),
  issued_at: timestamp("issued_at", { withTimezone: true }).notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  replaced_by_session_id: text("replaced_by_session_id"),
  created_at: timestamp("created_at", { withTimezone: true }),
});

export const userAreaAssignments = pgTable("user_area_assignments", {
  assignment_id: text("assignment_id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.user_id),
  site_id: integer("site_id").notNull(),
  locality_code: text("locality_code").notNull(),
  role: text("role").notNull(),
  active_from: date("active_from"),
  active_to: date("active_to"),
  created_at: timestamp("created_at", { withTimezone: true }),
});

export const syncLogs = pgTable("sync_logs", {
  sync_log_id: text("sync_log_id").primaryKey(),
  device_id: text("device_id").notNull(),
  user_id: text("user_id").notNull(),
  direction: text("direction").notNull(),
  records_sent: integer("records_sent"),
  records_received: integer("records_received"),
  conflicts_detected: integer("conflicts_detected").default(0),
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  status: text("status").default("in_progress"),
  error_detail: text("error_detail"),
});

export const adminCorrectionEvents = pgTable("admin_correction_events", {
  correction_event_id: text("correction_event_id").primaryKey(),
  site_id: integer("site_id").notNull(),
  subject_type: text("subject_type").notNull(),
  subject_id: text("subject_id").notNull(),
  field_name: text("field_name").notNull(),
  old_value: text("old_value"),
  new_value: text("new_value"),
  old_precision: text("old_precision"),
  new_precision: text("new_precision"),
  reason_code: text("reason_code").notNull(),
  reason_text: text("reason_text"),
  source_reference: text("source_reference"),
  corrected_by_user_id: text("corrected_by_user_id").notNull(),
  corrected_at: timestamp("corrected_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }),
});

export const dataQualityFlags = pgTable("data_quality_flags", {
  flag_id: text("flag_id").primaryKey(),
  site_id: integer("site_id").notNull(),
  flag_type: text("flag_type").notNull(),
  subject_type: text("subject_type"),
  subject_id: text("subject_id"),
  task_id: text("task_id"),
  primary_response_id: text("primary_response_id"),
  duplicate_response_id: text("duplicate_response_id"),
  severity: text("severity").default("warning"),
  status: text("status").default("open"),
  created_at: timestamp("created_at", { withTimezone: true }),
  reviewed_by_user_id: text("reviewed_by_user_id"),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  review_note: text("review_note"),
});

export const personAttributeHistory = pgTable("person_attribute_history", {
  history_id: text("history_id").primaryKey(),
  person_id: text("person_id").notNull(),
  field_name: text("field_name").notNull(),
  old_value: text("old_value"),
  old_precision: text("old_precision"),
  new_value: text("new_value"),
  new_precision: text("new_precision"),
  source_form_response_id: text("source_form_response_id"),
  source_event_id: text("source_event_id"),
  changed_at: timestamp("changed_at", { withTimezone: true }).notNull(),
  changed_by_user_id: text("changed_by_user_id"),
  device_id: text("device_id"),
});
