BEGIN;

ALTER TABLE form_responses
  ADD COLUMN IF NOT EXISTS submitted_by_user_id text;

CREATE INDEX IF NOT EXISTS form_responses_submitted_by_user_id_idx
  ON form_responses (submitted_by_user_id);

COMMIT;
