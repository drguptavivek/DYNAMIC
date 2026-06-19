# DYNAMIC - PreTESTING - Form Field To Event Rules

Status: working policy

| Form | Field name | Field value / condition | Related event | Track start / stop |
| --- | --- | --- | --- | --- |
| HHQ | `hhq_result_interview` | completed | `household_enrolled` | Start `household_round` track |
| HHQ | `member_woman_questionnaire_eligible` | yes | `woman_became_eligible` | Start WQ pathway |
| WQ | `wq_result_interview` | completed | `wq_completed` | - |
| WQ | `wq_eligibility_pregnancy_status_tracking` | eligible | `woman_tracking_entered` | Start `woman_pregnancy_tracking` track |
| WQ | `wq_pregnant` | yes | `pregnancy_detected` | Start PEF pathway |
| WQ | `wq_some_women_undergo_operation_remove_uterus_undergone_such` | yes | `woman_tracking_ineligible` | Stop `woman_pregnancy_tracking` track |
| WQ | `wq_partner_sterilized` | yes | `woman_tracking_status_changed` | May stop `woman_pregnancy_tracking` track if protocol defines as permanent ineligible |
| HRF | `hrf_interview_date` | completed visit | `hrf_completed` | Complete current HRF/WPT scheduled event |
| HRF | `hrf_pregnant` | yes | `pregnancy_detected` | Start PEF pathway |
| HRF | `hrf_potential_person_eligible_pregnancy` | yes | `woman_became_eligible` | Start WQ pathway |
| HRF | `hrf_some_women_undergo_operation` | yes | `woman_tracking_ineligible` | Stop `woman_pregnancy_tracking` track |
| HRF | `hrf_partner_sterilized` | yes | `woman_tracking_status_changed` | May stop `woman_pregnancy_tracking` track if protocol defines as permanent ineligible |
| PEF | `pef_pregnancy_confirmed` | yes | `pregnancy_enrolled` | Start `pregnancy_followup` track |
| PEF | `pef_any_time_during_pregnancy_ultrasound` | yes | `usg_report_available` | Start UF pathway |
| PEF | `pef_first_ultrasound_report` | available | `usg_report_available` | Start UF pathway |
| UF | `uf_form_completed_date` | completed | `ultrasound_recorded` | - |
| PFF | `pff_visit_date` | completed visit | `pff_completed` | Complete current PFF scheduled event |
| PFF | `pff_vital_migration_status_woman` | dead / permanently migrated | `woman_tracking_closed` | Stop active woman/PFF track as applicable |
| PFF | `pff_pregnancy_status` | outcome completed / no longer pregnant | `pregnancy_outcome_reported` | Start POF pathway |
| PFF | `pff_any_time_during_pregnancy_ultrasound_test` | yes | `usg_report_available` | Start UF pathway |
| POF | `pof_pregnancy_outcome_type` | any final outcome | `pregnancy_outcome_recorded` | Stop `pregnancy_followup` track |
| POF | `pof_number_live_born_infants_fill_one_birth_assessment` | > 0 | `birth_outcome_recorded` | Start BAF pathway |
| POF | `pof_number_miscarriages_stillbirths_fill_one_birth_assessment_form` | >= 1 and GA >=20w / 140d | `birth_outcome_recorded` | Start BAF pathway |
| BAF | `baf_child_vital_status` | alive | `live_birth_recorded` | Start `newborn_followup` track |
| BAF | `baf_child_vital_status` | dead | `child_death_recorded` | Start CDF pathway |
| BAF | `baf_clinical_determination_stillbirth_vs_neonatal_death_classification_informati` | stillbirth | `stillbirth_recorded` | Start SBF and VA pathway |
| SBF | `sbf_interview_date` | completed | `stillbirth_detail_recorded` | Start VA scheduled event |
| NFF | `nff_child_vital_status` | alive | `child_alive_confirmed` | Continue `newborn_followup` track |
| NFF | `nff_child_vital_status` | dead | `child_death_detected` | Stop `newborn_followup`; start CDF pathway |
| CDF | `cdf_death_date` | date present | `child_death_recorded` | Start VA scheduled event |
| VA | VA completion date field | completed | `verbal_autopsy_completed` | Complete VA scheduled event |
