import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const formAttachments = pgTable(
  "form_attachments",
  {
    attachment_id: text("attachment_id").primaryKey(),
    form_response_id: text("form_response_id").notNull(),
    form_code: text("form_code").notNull(),
    question_name: text("question_name").notNull(),
    household_id: text("household_id").notNull(),
    woman_id: text("woman_id").notNull(),
    report_sequence: integer("report_sequence").notNull(),
    display_name: text("display_name").notNull(),
    original_file_name: text("original_file_name"),
    stored_file_name: text("stored_file_name").notNull(),
    relative_path: text("relative_path").notNull(),
    mime_type: text("mime_type").notNull(),
    file_size: integer("file_size").notNull(),
    sha256: text("sha256").notNull(),
    uploaded_by_user_id: text("uploaded_by_user_id").notNull(),
    device_id: text("device_id").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    responseQuestionSequenceUnique: unique().on(
      table.form_response_id,
      table.question_name,
      table.report_sequence,
    ),
  }),
);
