BEGIN;

CREATE TABLE IF NOT EXISTS form_attachments (
  attachment_id text PRIMARY KEY,
  form_response_id text NOT NULL,
  form_code text NOT NULL,
  question_name text NOT NULL,
  household_id text NOT NULL,
  woman_id text NOT NULL,
  report_sequence integer NOT NULL CHECK (report_sequence BETWEEN 1 AND 5),
  display_name text NOT NULL,
  original_file_name text,
  stored_file_name text NOT NULL,
  relative_path text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type LIKE 'image/%'),
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 12582912),
  sha256 text NOT NULL,
  uploaded_by_user_id text NOT NULL,
  device_id text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  CONSTRAINT form_attachments_response_question_sequence_unique
    UNIQUE (form_response_id, question_name, report_sequence)
);

CREATE INDEX IF NOT EXISTS form_attachments_household_woman_idx
  ON form_attachments (household_id, woman_id, created_at);

COMMIT;
