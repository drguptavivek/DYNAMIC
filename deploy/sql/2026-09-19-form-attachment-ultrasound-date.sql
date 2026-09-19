BEGIN;

ALTER TABLE form_attachments
  ADD COLUMN IF NOT EXISTS ultrasound_date date;

ALTER TABLE form_attachments
  ADD COLUMN IF NOT EXISTS image_sequence integer NOT NULL DEFAULT 1;

ALTER TABLE form_attachments
  DROP CONSTRAINT IF EXISTS form_attachments_response_question_sequence_unique;

ALTER TABLE form_attachments
  DROP CONSTRAINT IF EXISTS form_attachments_form_response_id_question_name_report_sequence_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'form_attachments_image_sequence_check'
  ) THEN
    ALTER TABLE form_attachments
      ADD CONSTRAINT form_attachments_image_sequence_check
      CHECK (image_sequence BETWEEN 1 AND 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'form_attachments_response_question_report_image_unique'
  ) THEN
    ALTER TABLE form_attachments
      ADD CONSTRAINT form_attachments_response_question_report_image_unique
      UNIQUE (form_response_id, question_name, report_sequence, image_sequence);
  END IF;
END $$;

COMMIT;
