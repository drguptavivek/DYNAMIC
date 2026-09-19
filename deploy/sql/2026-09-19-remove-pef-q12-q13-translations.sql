BEGIN;

-- PEF Q12 and Q13 were retired from the active questionnaire. Remove only
-- their obsolete language metadata; finalized form-response evidence remains
-- immutable in answers_json.
UPDATE form_language_translations
SET
  translations_json = translations_json
    - 'pef_first_ultrasound_facility'
    - 'pef_other_ultrasound_since_first',
  updated_at = NOW()
WHERE form_code = 'PEF'
  AND (
    translations_json ? 'pef_first_ultrasound_facility'
    OR translations_json ? 'pef_other_ultrasound_since_first'
  );

COMMIT;
