import formHHQ from './forms/baseline_household_questionnaire_v2026.05.09.json';
import formWQ from './forms/baseline_woman_s_questionnaire_v2026.05.09.json';
import formHRF from './forms/household_rounds_form_v2026.05.14.json';
import formPEF from './forms/pregnancy_enrollment_form_v2026.05.11.json';
import formUF from './forms/ultrasound_form_v2026.05.11.json';
import formPFF from './forms/pregnancy_followup_form_v2026.05.11.json';
import formPOF from './forms/pregnancy_outcome_form_v2026.05.13.json';
import formBAF from './forms/birth_assessment_form_v2026.05.13.json';
import formSBF from './forms/stillbirth_form_v2026.05.13.json';
import formNFF from './forms/newborn_followup_form_v2026.05.13.json';
import formCDF from './forms/child_death_form_v2026.05.13.json';

export const formCatalog = [
  {
    "form_code": "HHQ",
    "title": "Baseline Household Questionnaire",
    "version": "9 MAY 2026",
    "question_count": 107,
    "file_name": "baseline_household_questionnaire_v2026.05.09.json"
  },
  {
    "form_code": "WQ",
    "title": "Baseline Woman's Questionnaire",
    "version": "9 MAY 2026",
    "question_count": 139,
    "file_name": "baseline_woman_s_questionnaire_v2026.05.09.json"
  },
  {
    "form_code": "HRF",
    "title": "Household Rounds Form",
    "version": "04 AUGUST 2026",
    "question_count": 17,
    "file_name": "household_rounds_form_v2026.05.14.json"
  },
  {
    "form_code": "PEF",
    "title": "Pregnancy Enrollment Form",
    "version": "11 MAY 2026",
    "question_count": 82,
    "file_name": "pregnancy_enrollment_form_v2026.05.11.json"
  },
  {
    "form_code": "UF",
    "title": "Ultrasound Form",
    "version": "11 MAY 2026",
    "question_count": 23,
    "file_name": "ultrasound_form_v2026.05.11.json"
  },
  {
    "form_code": "PFF",
    "title": "Pregnancy Follow-Up Form",
    "version": "11 MAY 2026",
    "question_count": 82,
    "file_name": "pregnancy_followup_form_v2026.05.11.json"
  },
  {
    "form_code": "POF",
    "title": "Pregnancy Outcome Form",
    "version": "13 MAY 2026",
    "question_count": 78,
    "file_name": "pregnancy_outcome_form_v2026.05.13.json"
  },
  {
    "form_code": "BAF",
    "title": "Birth Assessment Form",
    "version": "13 MAY 2026",
    "question_count": 80,
    "file_name": "birth_assessment_form_v2026.05.13.json"
  },
  {
    "form_code": "SBF",
    "title": "Stillbirth Form",
    "version": "13 MAY 2026",
    "question_count": 18,
    "file_name": "stillbirth_form_v2026.05.13.json"
  },
  {
    "form_code": "NFF",
    "title": "Newborn Follow-Up Form",
    "version": "13 MAY 2026",
    "question_count": 69,
    "file_name": "newborn_followup_form_v2026.05.13.json"
  },
  {
    "form_code": "CDF",
    "title": "Child Death Form",
    "version": "13 MAY 2026",
    "question_count": 25,
    "file_name": "child_death_form_v2026.05.13.json"
  }
];

export const formsByCode = {
  "HHQ": formHHQ,
  "WQ": formWQ,
  "HRF": formHRF,
  "PEF": formPEF,
  "UF": formUF,
  "PFF": formPFF,
  "POF": formPOF,
  "BAF": formBAF,
  "SBF": formSBF,
  "NFF": formNFF,
  "CDF": formCDF
};
