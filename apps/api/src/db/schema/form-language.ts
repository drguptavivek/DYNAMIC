import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const formLanguageTranslations = pgTable(
  "form_language_translations",
  {
    site_id: integer("site_id").notNull(),
    form_code: text("form_code").notNull(),
    language_code: text("language_code").notNull(),
    translations_json: jsonb("translations_json").notNull(),
    updated_by_user_id: text("updated_by_user_id"),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.site_id, t.form_code, t.language_code] }),
  }),
);

export const formLanguagePermissions = pgTable(
  "form_language_permissions",
  {
    site_id: integer("site_id").notNull(),
    user_id: text("user_id").notNull(),
    form_code: text("form_code").notNull(),
    language_code: text("language_code").notNull(),
    can_edit: boolean("can_edit").notNull().default(false),
    updated_by_user_id: text("updated_by_user_id"),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.site_id, t.user_id, t.form_code, t.language_code] }),
  }),
);
