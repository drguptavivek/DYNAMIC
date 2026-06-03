# Form-by-Form SurveyJS Verification

This report checks each maintained SurveyJS questionnaire against the preserved PDF-derived `rawText` in the JSON and reports Hindi translation coverage. `PDF anchor = yes` means the question still carries the source PDF text used for verification.

Hindi translations currently come from a mixed cache: common manual translations plus machine translation. They need field-team language review before production.

## HHQ - Baseline Household Questionnaire (9 MAY 2026)

Summary: 69/91 question titles have Hindi; 245/340 choices have Hindi; 1 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | 01-IDENTIFICATION | 1 | `hhq_site_id` | radiogroup | yes | missing | 4/4 |  |
| 2 | 01-IDENTIFICATION | 2 | `hhq_residence_area_type` | radiogroup | yes | yes | 2/2 |  |
| 3 | 01-IDENTIFICATION | 3 | `hhq_locality_code` | radiogroup | yes | missing | 2/4 |  |
| 4 | 01-IDENTIFICATION | 4 | `hhq_structure_map_id` | radiogroup | yes | missing | 0/1 |  |
| 5 | 01-IDENTIFICATION | 6 | `hhq_household_number` | text | yes | yes | 0/0 |  |
| 6 | 01-IDENTIFICATION | 7 | `hhq_household_head_name` | text | yes | yes | 0/0 |  |
| 7 | 01-IDENTIFICATION | 8 | `hhq_household_address` | text | yes | yes | 0/0 |  |
| 8 | 01-IDENTIFICATION | 9 | `hhq_interview_date` | text | yes | yes | 0/0 |  |
| 9 | 01-IDENTIFICATION | 10 | `hhq_consent_study_provide_pis_explain_study_adult_member` | radiogroup | yes | yes | 1/2 |  |
| 10 | 01-IDENTIFICATION | 11 | `hhq_result_interview` | radiogroup | yes | missing | 8/9 |  |
| 11 | 01-IDENTIFICATION | 12 | `hhq_language_questionnaire` | radiogroup | yes | yes | 4/7 |  |
| 12 | 01-IDENTIFICATION | 13 | `hhq_contact_mobile` | text | yes | yes | 0/0 |  |
| 13 | 01-IDENTIFICATION | 14 | `hhq_total_household_members` | text | yes | missing | 0/0 |  |
| 14 | 01-IDENTIFICATION | 15 | `hhq_total_eligible_women` | radiogroup | yes | missing | 0/1 |  |
| 15 | 02-HOUSEHOLD SCHEDULE |  | `hhq_household_members` | paneldynamic | panel | yes | 0/0 |  |
| 15 | 02-HOUSEHOLD SCHEDULE | 1_i | `member_line_number` | radiogroup | yes | yes | 1/1 | panel: hhq_household_members |
| 16 | 02-HOUSEHOLD SCHEDULE | 2_i | `member_name` | text | yes | yes | 0/0 | panel: hhq_household_members |
| 17 | 02-HOUSEHOLD SCHEDULE | 3_i | `member_relationship_to_head` | radiogroup | yes | missing | 12/15 | panel: hhq_household_members |
| 18 | 02-HOUSEHOLD SCHEDULE | 4_i | `member_sex` | radiogroup | yes | yes | 0/3 | panel: hhq_household_members |
| 19 | 02-HOUSEHOLD SCHEDULE | 5_i | `member_last_residence_place` | radiogroup | yes | missing | 0/4 | panel: hhq_household_members |
| 20 | 02-HOUSEHOLD SCHEDULE | 6_i | `member_residence_duration` | radiogroup | yes | missing | 0/2 | panel: hhq_household_members |
| 21 | 02-HOUSEHOLD SCHEDULE | 7_i | `member_age_years` | radiogroup | yes | yes | 2/3 | panel: hhq_household_members |
| 22 | 02-HOUSEHOLD SCHEDULE | CHECK LISTING | `hhq_just_make_sure_that` | radiogroup | yes | yes | 2/3 | panel: hhq_household_members |
| 23 | 02-HOUSEHOLD SCHEDULE | 8_i | `member_marital_status` | radiogroup | yes | missing | 7/10 | visibleIf: `{member_age_years} >= 13`; panel: hhq_household_members |
| 24 | 02-HOUSEHOLD SCHEDULE | 9_i | `member_woman_questionnaire_eligible` | radiogroup | yes | yes | 0/2 | panel: hhq_household_members |
| 25 | 02-HOUSEHOLD SCHEDULE | 9_i | `member_woman_questionnaire_eligible_2` | radiogroup | yes | yes | 0/2 | panel: hhq_household_members |
| 26 | 02-HOUSEHOLD SCHEDULE | 10_i | `member_birth_registration_status` | radiogroup | yes | yes | 3/4 | visibleIf: `{member_age_years} <= 4`; panel: hhq_household_members |
| 27 | 02-HOUSEHOLD SCHEDULE | 11A_i | `member_ever_attended_school` | radiogroup | yes | missing | 2/6 | visibleIf: `{member_age_years} >= 5`; panel: hhq_household_members |
| 28 | 02-HOUSEHOLD SCHEDULE | 11B_i | `member_highest_grade_completed` | radiogroup | yes | missing | 5/6 | visibleIf: `{member_ever_attended_school} = 1`; panel: hhq_household_members |
| 29 | 02-HOUSEHOLD SCHEDULE | 12_i | `member_pregnancy_tracking_eligible` | radiogroup | yes | yes | 1/3 | panel: hhq_household_members |
| 16 | 03-HOUSEHOLD CHARACTERISTICS | 1 | `hhq_often_anyone_smoke_inside_house_say_daily_weekly` | radiogroup | yes | yes | 4/5 |  |
| 17 | 03-HOUSEHOLD CHARACTERISTICS | 2A | `hhq_main_source_drinking_water_members_household_piped_water` | radiogroup | yes | missing | 8/16 |  |
| 18 | 03-HOUSEHOLD CHARACTERISTICS | 2B | `hhq_water_source_located` | radiogroup | yes | missing | 3/3 |  |
| 19 | 03-HOUSEHOLD CHARACTERISTICS | 2C | `hhq_household_usually_make_water_safe_drink_anything_else` | checkbox | yes | missing | 5/10 |  |
| 20 | 03-HOUSEHOLD CHARACTERISTICS | 3A | `hhq_family_members_toilet_facility_that_can_use` | radiogroup | yes | missing | 1/4 |  |
| 21 | 03-HOUSEHOLD CHARACTERISTICS | 3B | `hhq_kind_toilet_facility_members_household_usually_use_flush` | radiogroup | yes | missing | 7/12 | visibleIf: `{hhq_family_members_toilet_facility_that_can_use} != 4` |
| 22 | 03-HOUSEHOLD CHARACTERISTICS | 3C | `hhq_toilet_facility_located` | radiogroup | yes | missing | 3/3 | visibleIf: `{hhq_family_members_toilet_facility_that_can_use} != 4 and {hhq_kind_toilet_facility_members_household_usually_use_flush} != 51` |
| 23 | 03-HOUSEHOLD CHARACTERISTICS | 4 | `hhq_type_drainage_facility_household` | radiogroup | yes | missing | 4/4 |  |
| 24 | 03-HOUSEHOLD CHARACTERISTICS | 5 | `hhq_religion_head_household` | radiogroup | yes | missing | 9/10 |  |
| 25 | 03-HOUSEHOLD CHARACTERISTICS | 6 | `hhq_head_household_belong_schedule_cast_scheduled_tribe_other` | radiogroup | yes | yes | 3/5 |  |
| 26 | 03-HOUSEHOLD CHARACTERISTICS | 7A | `hhq_household_electricity` | radiogroup | yes | yes | 2/2 |  |
| 27 | 03-HOUSEHOLD CHARACTERISTICS | 7B | `hhq_household_mattress` | radiogroup | yes | yes | 2/2 |  |
| 28 | 03-HOUSEHOLD CHARACTERISTICS | 7C | `hhq_household_pressure_cooker` | radiogroup | yes | yes | 2/2 |  |
| 29 | 03-HOUSEHOLD CHARACTERISTICS | 7D | `hhq_household_chair` | radiogroup | yes | yes | 2/2 |  |
| 30 | 03-HOUSEHOLD CHARACTERISTICS | 7E | `hhq_household_cot_bed` | radiogroup | yes | yes | 2/2 |  |
| 31 | 03-HOUSEHOLD CHARACTERISTICS | 7F | `hhq_household_table` | radiogroup | yes | yes | 2/2 |  |
| 32 | 03-HOUSEHOLD CHARACTERISTICS | 7G | `hhq_household_electric_fan` | radiogroup | yes | yes | 2/2 |  |
| 33 | 03-HOUSEHOLD CHARACTERISTICS | 7H | `hhq_household_television` | radiogroup | yes | yes | 2/2 |  |
| 34 | 03-HOUSEHOLD CHARACTERISTICS | 7I | `hhq_household_sewing_machine` | radiogroup | yes | yes | 2/2 |  |
| 35 | 03-HOUSEHOLD CHARACTERISTICS | 7J | `hhq_household_landline_telephone` | radiogroup | yes | yes | 2/2 |  |
| 36 | 03-HOUSEHOLD CHARACTERISTICS | 7K | `hhq_household_access_internet` | radiogroup | yes | yes | 2/2 |  |
| 37 | 03-HOUSEHOLD CHARACTERISTICS | 7L | `hhq_household_computer_laptop` | radiogroup | yes | yes | 2/2 |  |
| 38 | 03-HOUSEHOLD CHARACTERISTICS | 7M | `hhq_household_refrigerator` | radiogroup | yes | yes | 2/2 |  |
| 39 | 03-HOUSEHOLD CHARACTERISTICS | 7N | `hhq_household_ar_conditioner_cooler` | radiogroup | yes | yes | 2/2 |  |
| 40 | 03-HOUSEHOLD CHARACTERISTICS | 7O | `hhq_household_washing_machine` | radiogroup | yes | yes | 2/2 |  |
| 41 | 03-HOUSEHOLD CHARACTERISTICS | 7P | `hhq_household_water_pump` | radiogroup | yes | yes | 2/2 |  |
| 42 | 03-HOUSEHOLD CHARACTERISTICS | 7Q | `hhq_household_thresher` | radiogroup | yes | yes | 2/2 |  |
| 43 | 03-HOUSEHOLD CHARACTERISTICS | 7R | `hhq_household_tractor` | radiogroup | yes | yes | 2/2 |  |
| 44 | 03-HOUSEHOLD CHARACTERISTICS | 7S | `hhq_household_kitchen_garden` | radiogroup | yes | yes | 2/2 |  |
| 45 | 03-HOUSEHOLD CHARACTERISTICS | 7T | `hhq_any_member_household_own_radio_transistor` | radiogroup | yes | yes | 2/2 |  |
| 46 | 03-HOUSEHOLD CHARACTERISTICS | 7U | `hhq_any_member_household_own_mobile_telephone_tablet` | radiogroup | yes | yes | 2/2 |  |
| 47 | 03-HOUSEHOLD CHARACTERISTICS | 7V | `hhq_any_member_household_own_watch_clock` | radiogroup | yes | yes | 2/2 |  |
| 48 | 03-HOUSEHOLD CHARACTERISTICS | 7W | `hhq_any_member_household_own_bicycle` | radiogroup | yes | yes | 2/2 |  |
| 49 | 03-HOUSEHOLD CHARACTERISTICS | 7X | `hhq_any_member_household_own_motorcycle_scooter` | radiogroup | yes | yes | 2/2 |  |
| 50 | 03-HOUSEHOLD CHARACTERISTICS | 7Y | `hhq_any_member_household_own_animal_drawn_cart` | radiogroup | yes | yes | 2/2 |  |
| 51 | 03-HOUSEHOLD CHARACTERISTICS | 7Z | `hhq_any_member_household_own_car` | radiogroup | yes | yes | 2/2 |  |
| 52 | 03-HOUSEHOLD CHARACTERISTICS | 7Za | `hhq_any_member_household_own_truck` | radiogroup | yes | yes | 2/2 |  |
| 53 | 03-HOUSEHOLD CHARACTERISTICS | 7Zb | `hhq_any_member_household_own_boat_motor` | radiogroup | yes | yes | 2/2 |  |
| 54 | 03-HOUSEHOLD CHARACTERISTICS | 7Zc | `hhq_any_member_household_own_boat_without_motor` | radiogroup | yes | yes | 2/2 |  |
| 55 | 03-HOUSEHOLD CHARACTERISTICS | 8A | `hhq_type_fuel_household_mainly_use_cooking` | radiogroup | yes | missing | 14/19 | manual: Cooking-stove sub-branch 8B1/8B2 was merged in PDF extraction; verify before enforcing. |
| 56 | 03-HOUSEHOLD CHARACTERISTICS | 8C | `hhq_place_used_cooking_exhaust_fan` | radiogroup | yes | yes | 3/3 |  |
| 57 | 03-HOUSEHOLD CHARACTERISTICS | 8D | `hhq_cooking_usually_done_house_separate_building_outdoors` | radiogroup | yes | yes | 4/4 |  |
| 58 | 03-HOUSEHOLD CHARACTERISTICS | 9 | `hhq_separate_room_used_kitchen` | radiogroup | yes | yes | 2/2 |  |
| 59 | 03-HOUSEHOLD CHARACTERISTICS | 10 | `hhq_main_material_floor_natural_floor` | radiogroup | yes | yes | 10/14 |  |
| 60 | 03-HOUSEHOLD CHARACTERISTICS | 11 | `hhq_main_material_roof_natural_roofing` | radiogroup | yes | yes | 10/20 |  |
| 61 | 03-HOUSEHOLD CHARACTERISTICS | 12 | `hhq_main_material_external_walls_natural_walls` | radiogroup | yes | yes | 12/17 |  |
| 62 | 03-HOUSEHOLD CHARACTERISTICS | 13 | `hhq_contact_mobile_2` | text | yes | yes | 0/0 |  |
| 63 | 03-HOUSEHOLD CHARACTERISTICS | 14 | `hhq_total_household_members_2` | radiogroup | yes | yes | 2/2 |  |
| 64 | 03-HOUSEHOLD CHARACTERISTICS | 15 | `hhq_total_eligible_women_2` | radiogroup | yes | yes | 2/2 |  |
| 65 | 03-HOUSEHOLD CHARACTERISTICS | 16A | `hhq_household_own_any_cows_bulls_buffaloes_yaks` | radiogroup | yes | yes | 2/2 |  |
| 66 | 03-HOUSEHOLD CHARACTERISTICS | 16B | `hhq_household_own_any_camels` | radiogroup | yes | yes | 2/2 |  |
| 67 | 03-HOUSEHOLD CHARACTERISTICS | 16C | `hhq_household_own_any_horses_donkeys_mules` | radiogroup | yes | yes | 2/2 |  |
| 68 | 03-HOUSEHOLD CHARACTERISTICS | 16D | `hhq_household_own_any_goats_sheep` | radiogroup | yes | yes | 2/2 |  |
| 69 | 03-HOUSEHOLD CHARACTERISTICS | 16E | `hhq_household_own_any_pigs` | radiogroup | yes | yes | 2/2 |  |
| 70 | 03-HOUSEHOLD CHARACTERISTICS | 16F | `hhq_household_own_any_gchickens_ducks` | radiogroup | yes | yes | 2/2 |  |
| 71 | 03-HOUSEHOLD CHARACTERISTICS | 17 | `hhq_any_usual_member_household_bank_account_post_office` | radiogroup | yes | yes | 2/3 |  |
| 72 | 03-HOUSEHOLD CHARACTERISTICS | 18 | `hhq_household_bpl_any_equivalent_card` | radiogroup | yes | yes | 3/3 |  |
| 73 | 03-HOUSEHOLD CHARACTERISTICS | 19 | `hhq_household_domestic_staff_automatically_generated_household` | radiogroup | yes | yes | 2/3 |  |
| 74 | 03-HOUSEHOLD CHARACTERISTICS | 20 | `hhq_we_like_learn_about_places_that_households_use` | radiogroup | yes | missing | 4/7 |  |
| 75 | 03-HOUSEHOLD CHARACTERISTICS | 21 | `hhq_observation_only_observe_presence_water_place_handwashing` | radiogroup | yes | yes | 0/2 |  |
| 76 | 03-HOUSEHOLD CHARACTERISTICS | 22 | `hhq_observation_only` | checkbox | yes | yes | 2/3 |  |

## WQ - Baseline Woman's Questionnaire (9 MAY 2026)

Summary: 114/138 question titles have Hindi; 168/378 choices have Hindi; 16 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | 01-Respondent's Background | 1 | `wq_site_id` | radiogroup | yes | missing | 4/4 |  |
| 2 | 01-Respondent's Background | 2 | `wq_residence_area_type` | radiogroup | yes | yes | 2/2 |  |
| 3 | 01-Respondent's Background | 3 | `wq_locality_code` | radiogroup | yes | missing | 2/4 |  |
| 4 | 01-Respondent's Background | 4 | `wq_interview_date` | text | yes | yes | 0/0 |  |
| 5 | 01-Respondent's Background | 5 | `wq_consent_study_provide_pis_explain_study_adult` | radiogroup | yes | yes | 1/2 | visibleIf: `{wq_currently_smoke_bidis_every_day_some_days_not} = 1` |
| 6 | 01-Respondent's Background | 6 | `wq_result_interview` | radiogroup | yes | missing | 8/9 |  |
| 7 | 01-Respondent's Background | 7 | `wq_language_questionnaire` | radiogroup | yes | yes | 4/7 | visibleIf: `{wq_currently_smoke_use_any_other_type_tobacco_every} anyof [1,2]` |
| 8 | 01-Respondent's Background | 8 | `wq_enter_structure_id_woman` | text | yes | yes | 0/0 |  |
| 9 | 01-Respondent's Background | 9 | `wq_name_woman` | text | yes | yes | 0/0 | visibleIf: `{wq_ever_consumed_alcohol} = 1` |
| 10 | 01-Respondent's Background | 10 | `wq_name_husband` | text | yes | yes | 0/0 | visibleIf: `{wq_during_last_one_month_many_days_least_one} > 0` |
| 11 | 01-Respondent's Background | 11 | `wq_husband_permanent_id` | text | yes | yes | 0/0 |  |
| 12 | 01-Respondent's Background | 12 | `wq_mobile_phone_woman` | text | yes | yes | 0/0 |  |
| 13 | 01-Respondent's Background | 15 | `wq_mobile_phone_husband` | text | yes | yes | 0/0 |  |
| 14 | 01-Respondent's Background | 16 | `wq_state_born` | radiogroup | yes | missing | 27/37 |  |
| 15 | 01-Respondent's Background | 17 | `wq_locality_code_2` | radiogroup | yes | yes | 0/3 |  |
| 16 | 01-Respondent's Background | 18 | `wq_month_year_born_month` | radiogroup | yes | yes | 1/1 |  |
| 17 | 01-Respondent's Background | 19 | `wq_old_last_birthday_age_completed_years_compare_correct` | radiogroup | yes | yes | 2/2 |  |
| 18 | 01-Respondent's Background | 20 | `wq_general_say_health_very` | radiogroup | yes | yes | 3/5 |  |
| 19 | 01-Respondent's Background | 21 | `wq_ever_attended_school` | radiogroup | yes | yes | 0/2 |  |
| 20 | 01-Respondent's Background | 22 | `wq_highest_grade_completed` | radiogroup | yes | missing | 5/6 | visibleIf: `{wq_ever_attended_school} = 1` |
| 21 | 01-Respondent's Background | 23 | `wq_religion` | radiogroup | yes | missing | 1/1 |  |
| 22 | 01-Respondent's Background | 23 | `wq_religion_2` | radiogroup | yes | missing | 8/9 |  |
| 23 | 01-Respondent's Background | 24 | `wq_belong_scheduled_caste` | radiogroup | yes | yes | 2/4 |  |
| 24 | 01-Respondent's Background | 25 | `wq_current_marital_status` | radiogroup | yes | missing | 0/8 |  |
| 25 | 02-Reproduction | 1 | `wq` | radiogroup | yes | yes | 0/3 |  |
| 26 | 02-Reproduction | 2 | `wq_any_sons_daughters_whom_given_birth_living` | radiogroup | yes | yes | 0/2 |  |
| 27 | 02-Reproduction | 3a | `wq_many_sons_live_sons_home` | radiogroup | yes | yes | 0/1 |  |
| 28 | 02-Reproduction | 3b | `wq_many_daugthers_live_daughters_home` | radiogroup | yes | yes | 0/1 |  |
| 29 | 02-Reproduction | 4 | `wq_any_sons_daughters_whom_given_birth_alive_but` | radiogroup | yes | yes | 0/2 |  |
| 30 | 02-Reproduction | 5a | `wq_many_sons_alive_but_not_live_sons_elsewhere` | radiogroup | yes | yes | 0/1 |  |
| 31 | 02-Reproduction | 5b | `wq_many_daugthers_alive_but_not_live_daughters_elsewhere` | radiogroup | yes | yes | 0/1 |  |
| 32 | 02-Reproduction | 6 | `wq_ever_given_birth_boy_girl_born_alive_but` | radiogroup | yes | yes | 0/2 |  |
| 33 | 02-Reproduction | 7a | `wq_many_boys_died_boys_dead` | text | yes | yes | 0/0 |  |
| 34 | 02-Reproduction | 7b | `wq_many_girls_died_gilrs_dead` | text | yes | yes | 0/0 |  |
| 35 | 02-Reproduction | 8 | `wq_sum_answers` | radiogroup | yes | missing | 1/3 |  |
| 36 | 02-Reproduction | 9 | `wq_check` | radiogroup | yes | yes | 0/3 | visibleIf: `{wq_ever_consumed_alcohol} = 1` |
| 37 | 02-Reproduction | 10 | `wq_women_sometimes_pregnancy_that_not_result_live_birth` | radiogroup | yes | missing | 0/2 | visibleIf: `{wq_during_last_one_month_many_days_least_one} > 0`; manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design. |
| 38 | 02-Reproduction | 11 | `wq_many_miscarriages_abortions_stillbirths_pregnancy_losses` | text | yes | yes | 0/0 |  |
| 39 | 02-Reproduction | 12 | `wq_sum_answers_2` | radiogroup | yes | missing | 2/4 |  |
| 40 | 02-Reproduction | 13 | `wq_check_2` | radiogroup | yes | yes | 2/2 | manual: CHECK skip to current pregnancy depends on prior reproductive history totals; needs explicit derived variable before strict SurveyJS enforcement. |
| 41 | 02-Reproduction | 14 | `wq_2` | radiogroup | yes | yes | 0/4 |  |
| 42 | 02-Reproduction | 22a | `wq_any_pregnancies_that_ended_since_last_pregnancy` | radiogroup | yes | yes | 0/2 |  |
| 43 | 02-Reproduction | 22b | `wq_read_list_pregnancy_outcomes_order_respondent_ask_they` | text | yes | missing | 0/0 |  |
| 44 | 02-Reproduction | 29 | `wq_compare` | radiogroup | yes | yes | 4/5 |  |
| 45 | 02-Reproduction | 30 | `wq_ever_experience_delivery_caesarean_that_they_cut_belly` | radiogroup | yes | yes | 0/3 |  |
| 46 | 02-Reproduction | 31a | `wq_ever_delivery_that_complications` | radiogroup | yes | yes | 0/3 |  |
| 47 | 02-Reproduction | 31b | `wq_complications_mark_all_that_apply_excessive_bleeding_b` | text | yes | missing | 0/0 |  |
| 48 | 02-Reproduction | 32 | `wq_pregnant` | radiogroup | yes | yes | 0/3 |  |
| 49 | 02-Reproduction | 33a | `wq_last_menstrual_period_start_date_given` | radiogroup | yes | missing | 1/7 |  |
| 50 | 02-Reproduction | 33b | `wq_check_33a_last_menstrual_period` | radiogroup | yes | yes | 1/3 |  |
| 51 | 02-Reproduction | 33c | `wq_check_33c` | radiogroup | yes | yes | 1/3 |  |
| 52 | 02-Reproduction | 34 | `wq_some_women_undergo_operation_remove_uterus_undergone_such` | radiogroup | yes | missing | 0/3 |  |
| 53 | 02-Reproduction | 35 | `wq_old_first_monthly_period_age_completed_years` | text | yes | yes | 0/0 |  |
| 54 | 02-Reproduction | 36 | `wq_partner_currently_doing_something_using_any_method_delay` | radiogroup | yes | yes | 0/2 |  |
| 55 | 02-Reproduction | 37 | `wq_partner_sterilized` | radiogroup | yes | yes | 1/4 |  |
| 56 | 02-Reproduction | 38 | `wq_eligibility_pregnancy_status_tracking` | radiogroup | yes | yes | 5/6 |  |
| 57 | 02-Reproduction |  | `wq_pregnancy_history` | paneldynamic | panel | yes | 0/0 |  |
| 42 | 02-Reproduction | 15_i | `wq_i_think_back_first_pregnancy_that_single_pregnancy` | radiogroup | yes | yes | 0/5 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 43 | 02-Reproduction | 16_i | `wq_i_single_baby_born_alive_born_dead_miscarriage` | radiogroup | yes | yes | 4/4 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 44 | 02-Reproduction | 17_i | `wq_baby_cry_move_breathe` | radiogroup | yes | yes | 0/2 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 45 | 02-Reproduction | 18_i | `wq_name_given_baby_name` | text | yes | missing | 0/0 | panel: wq_pregnancy_history |
| 46 | 02-Reproduction | 19_i | `wq_boy_girl` | radiogroup | yes | yes | 0/1 | panel: wq_pregnancy_history |
| 47 | 02-Reproduction | 19_i | `wq_boy_girl_i` | radiogroup | yes | yes | 0/1 | panel: wq_pregnancy_history |
| 48 | 02-Reproduction | 20_i | `wq_check_i` | radiogroup | yes | yes | 0/1 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 49 | 02-Reproduction | 21_i | `wq_long_pregnancy_last_weeks_months_completed_weeks_months` | text | yes | yes | 0/0 | panel: wq_pregnancy_history |
| 50 | 02-Reproduction | 22_i | `wq_row_i_there_any_other_pregnancies_before_pregnancy` | radiogroup | yes | yes | 1/3 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 53 | 02-Reproduction | 23_i | `wq_check_i_i` | radiogroup | yes | yes | 7/9 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 54 | 02-Reproduction | 24_i | `wq_still_alive` | radiogroup | yes | yes | 0/2 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 55 | 02-Reproduction | 25_i | `wq_born_alive_still_living_i_boy_old_his` | text | yes | yes | 0/0 | panel: wq_pregnancy_history |
| 56 | 02-Reproduction | 26_i | `wq_born_alive_still_living` | radiogroup | yes | yes | 0/2 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 57 | 02-Reproduction | 27_i | `wq_household_member_line_number` | radiogroup | yes | yes | 0/1 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: wq_pregnancy_history |
| 58 | 02-Reproduction | 28_i | `wq_born_alive_dead_i_boy_old_he_died` | radiogroup | yes | yes | 2/6 | panel: wq_pregnancy_history |
| 58 | 03-Other Health Issues | 1a | `wq_ever_blood_transfusion` | radiogroup | yes | yes | 0/2 |  |
| 59 | 03-Other Health Issues | 1b | `wq_month_year_last_blood_transfusion_month_year` | radiogroup | yes | yes | 0/1 | visibleIf: `{wq_ever_blood_transfusion} = 1` |
| 60 | 03-Other Health Issues | 2 | `wq_currently_smoke_cigarettes` | radiogroup | yes | yes | 2/4 |  |
| 61 | 03-Other Health Issues | 3 | `wq_average_many_cigarettes_currently_smoke_each_day_number` | text | yes | yes | 0/0 | visibleIf: `{wq_currently_smoke_cigarettes} = 1` |
| 62 | 03-Other Health Issues | 4 | `wq_currently_smoke_bidis_every_day_some_days_not` | radiogroup | yes | yes | 2/3 |  |
| 63 | 03-Other Health Issues | 5 | `wq_average_many_bidis_currently_smoke_each_day_number` | text | yes | yes | 0/0 | visibleIf: `{wq_currently_smoke_bidis_every_day_some_days_not} = 1` |
| 64 | 03-Other Health Issues | 6 | `wq_currently_smoke_use_any_other_type_tobacco_every` | radiogroup | yes | yes | 2/3 |  |
| 65 | 03-Other Health Issues | 7 | `wq_other_type_tobacco_currently_smoke_use_all_mentioned` | text | yes | missing | 0/0 | visibleIf: `{wq_currently_smoke_use_any_other_type_tobacco_every} anyof [1,2]` |
| 66 | 03-Other Health Issues | 8 | `wq_ever_consumed_alcohol` | radiogroup | yes | yes | 0/3 |  |
| 67 | 03-Other Health Issues | 9 | `wq_during_last_one_month_many_days_least_one` | radiogroup | yes | yes | 2/2 | visibleIf: `{wq_ever_consumed_alcohol} = 1` |
| 68 | 03-Other Health Issues | 10 | `wq_we_count_one_drink_alcohol_one_can_bottle` | radiogroup | yes | missing | 1/1 | visibleIf: `{wq_during_last_one_month_many_days_least_one} > 0` |
| 69 | 03-Other Health Issues | 10 | `wq_we_count_one_drink_alcohol_one_can_bottle_2` | text | yes | missing | 0/0 | visibleIf: `{wq_during_last_one_month_many_days_least_one} > 0` |
| 70 | 03-Other Health Issues | 11 | `wq_5` | radiogroup | yes | yes | 0/1 |  |
| 71 | 03-Other Health Issues | 11a | `wq_currently_diabetes` | radiogroup | yes | yes | 0/3 |  |
| 72 | 03-Other Health Issues | 11b | `wq_sought_treatment_problem_diabetes` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_diabetes} = 1` |
| 73 | 03-Other Health Issues | 12a | `wq_currently_hypertension` | radiogroup | yes | yes | 0/3 |  |
| 74 | 03-Other Health Issues | 12b | `wq_sought_treatment_problem_hypertension` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_hypertension} = 1` |
| 75 | 03-Other Health Issues | 13a | `wq_currently_chronic_respiratory_disease_including_asthma` | radiogroup | yes | yes | 0/3 |  |
| 76 | 03-Other Health Issues | 13b | `wq_sought_treatment_problem_chronic_respiratory_disease_including` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_chronic_respiratory_disease_including_asthma} = 1` |
| 77 | 03-Other Health Issues | 14a | `wq_currently_goitre_any_other_thyroid_disorder` | radiogroup | yes | yes | 0/3 |  |
| 78 | 03-Other Health Issues | 14b | `wq_sought_treatment_problem_goitre_any_other_thyroid_disorder` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_goitre_any_other_thyroid_disorder} = 1` |
| 79 | 03-Other Health Issues | 15a | `wq_currently_any_heart_disease` | radiogroup | yes | yes | 0/3 |  |
| 80 | 03-Other Health Issues | 15b | `wq_sought_treatment_problem_any_heart_disease` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_any_heart_disease} = 1` |
| 81 | 03-Other Health Issues | 16a | `wq_currently_cancer` | radiogroup | yes | yes | 0/3 |  |
| 82 | 03-Other Health Issues | 16b | `wq_sought_treatment_problem_cancer` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_cancer} = 1` |
| 83 | 03-Other Health Issues | 17a | `wq_currently_any_chronic_kidney_disorder` | radiogroup | yes | yes | 0/3 |  |
| 84 | 03-Other Health Issues | 17b | `wq_sought_treatment_problem_any_chronic_kidney_disorder` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_any_chronic_kidney_disorder} = 1` |
| 85 | 03-Other Health Issues | 18a | `wq_currently_anemia` | radiogroup | yes | yes | 0/2 |  |
| 86 | 03-Other Health Issues | 18a | `wq_currently_anemia_18a` | radiogroup | yes | yes | 0/1 |  |
| 87 | 03-Other Health Issues | 18b | `wq_sought_treatment_problem_anemia` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_anemia_18a} = 1` |
| 88 | 04-Husband's background and Woman's work | 1 | `wq_check_answer_marital_status` | radiogroup | yes | yes | 4/4 | manual: Husband/work module skip sequence needs final field grouping; PDF row text is merged across questions. |
| 89 | 04-Husband's background and Woman's work | 2 | `wq_old_husband_his_last_birthday_age_completed_years` | text | yes | yes | 0/0 |  |
| 90 | 04-Husband's background and Woman's work | 3 | `wq_husband_ever_attend_school` | radiogroup | yes | yes | 0/2 |  |
| 91 | 04-Husband's background and Woman's work | 4 | `wq_highest_grade_he_completed` | radiogroup | yes | missing | 5/6 |  |
| 92 | 04-Husband's background and Woman's work | 5 | `wq_6` | radiogroup | yes | yes | 2/2 | visibleIf: `{wq_currently_smoke_bidis_every_day_some_days_not} = 1` |
| 93 | 04-Husband's background and Woman's work | 6 | `wq_aside_own_housework_done_any_work_last_seven` | radiogroup | yes | yes | 0/2 | manual: Husband/work module skip sequence needs final field grouping; PDF row text is merged across questions. |
| 94 | 04-Husband's background and Woman's work | 7 | `wq_know_some_women_take_up_jobs_they_paid` | radiogroup | yes | yes | 0/2 | visibleIf: `{wq_currently_smoke_use_any_other_type_tobacco_every} anyof [1,2]`; manual: Husband/work module skip sequence needs final field grouping; PDF row text is merged across questions. |
| 95 | 04-Husband's background and Woman's work | 8 | `wq_although_not_work_last_seven_days_any_job` | radiogroup | yes | yes | 0/2 | manual: Husband/work module skip sequence needs final field grouping; PDF row text is merged across questions. |
| 96 | 04-Husband's background and Woman's work | 9 | `wq_done_any_work_last` | radiogroup | yes | yes | 0/3 | visibleIf: `{wq_ever_consumed_alcohol} = 1`; manual: Husband/work module skip sequence needs final field grouping; PDF row text is merged across questions. |
| 97 | 04-Husband's background and Woman's work | 10 | `wq_occupation_that_kind_work_mainly` | text | yes | missing | 0/0 | visibleIf: `{wq_during_last_one_month_many_days_least_one} > 0` |
| 98 | 04-Husband's background and Woman's work | 11 | `wq_paid_cash_kind_work_not_paid_all` | radiogroup | yes | yes | 4/4 |  |
| 99 | 04-Husband's background and Woman's work | 12 | `wq_decides_money_earn_will_used_mainly_mainly_only` | radiogroup | yes | missing | 2/4 |  |
| 100 | 04-Husband's background and Woman's work | 13 | `wq_usually_makes_decisions_about_health_care_yourself_mainly` | radiogroup | yes | missing | 2/5 |  |
| 101 | 04-Husband's background and Woman's work | 14 | `wq_any_money_own_that_alone_can_decide_use` | radiogroup | yes | yes | 0/2 |  |
| 102 | 04-Husband's background and Woman's work | 15a | `wq_usually_allowed_go_market_alone_only_someone_else` | radiogroup | yes | yes | 2/3 |  |
| 103 | 04-Husband's background and Woman's work | 15b | `wq_usually_allowed_go_health_facility_alone_only` | radiogroup | yes | yes | 2/3 |  |
| 104 | 04-Husband's background and Woman's work | 15c | `wq_locality_code_15c` | radiogroup | yes | yes | 2/3 |  |
| 105 | 04-Husband's background and Woman's work | 16 | `wq_own_any_other_house_either_alone_jointly_someone` | radiogroup | yes | yes | 4/4 |  |
| 106 | 04-Husband's background and Woman's work | 17 | `wq_own_any_agricultural_non_agricultural_land_either_alone` | radiogroup | yes | yes | 4/4 |  |
| 107 | 04-Husband's background and Woman's work | 18a | `wq_presence_any_children` | radiogroup | yes | yes | 3/4 |  |
| 108 | 04-Husband's background and Woman's work | 18b | `wq_presence_husband_household_point` | radiogroup | yes | yes | 3/3 |  |
| 109 | 04-Husband's background and Woman's work | 18c | `wq_presence_any_other_males_household_point` | radiogroup | yes | yes | 3/3 |  |
| 110 | 04-Husband's background and Woman's work | 18d | `wq_presence_any_other_females_household_point` | radiogroup | yes | yes | 3/3 |  |
| 111 | 04-Husband's background and Woman's work | 19a | `wq_opinion_husband_justified_hitting_beating_his_wife` | radiogroup | yes | yes | 1/3 |  |
| 112 | 04-Husband's background and Woman's work | 19b | `wq_opinion_husband_justified_hitting_beating_his_wife_19b` | radiogroup | yes | yes | 1/3 |  |
| 113 | 04-Husband's background and Woman's work | 19c | `wq_opinion_husband_justified_hitting_beating_his_wife_19c` | radiogroup | yes | yes | 0/2 |  |
| 114 | 04-Husband's background and Woman's work | 19c | `wq_opinion_husband_justified_hitting_beating_his_wife_following` | radiogroup | yes | yes | 1/1 |  |
| 115 | 04-Husband's background and Woman's work | 19d | `wq_opinion_husband_justified_hitting_beating_his_wife_19d` | radiogroup | yes | yes | 1/3 |  |
| 116 | 04-Husband's background and Woman's work | 19e | `wq_opinion_husband_justified_hitting_beating_his_wife_19e` | radiogroup | yes | yes | 1/3 |  |
| 117 | 04-Husband's background and Woman's work | 19f | `wq_opinion_about_husband_beating_hitting_vi` | radiogroup | yes | yes | 1/3 |  |
| 118 | 04-Husband's background and Woman's work | 19g | `wq_opinion_husband_justified_hitting_beating_his_wife_19g` | radiogroup | yes | yes | 1/3 |  |
| 119 | 04-Husband's background and Woman's work | 20 | `wq_wife_knows_her_husband_sexually_transmitted_disease_she` | radiogroup | yes | yes | 1/3 |  |
| 120 | 04-Husband's background and Woman's work | 21 | `wq_wife_knows_her_husband_sex_other_woman_she` | radiogroup | yes | yes | 1/3 |  |
| 121 | 04-Husband's background and Woman's work | 22 | `wq_can_say_no_husband_not_want_sexual` | radiogroup | yes | yes | 1/3 | visibleIf: `{wq_ever_attended_school} = 1` |
| 122 | 05-Biomarkers | 1 | `wq_height_measured_site_cm` | text | yes | yes | 0/0 |  |
| 123 | 05-Biomarkers | 2 | `wq_weight_measured_site_kg_blood_pressure_measured_site` | radiogroup | yes | missing | 2/2 |  |

## BAF - Birth Assessment Form (13 MAY 2026)

Summary: 58/79 question titles have Hindi; 131/161 choices have Hindi; 0 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Birth assessment | 1 | `baf_woman_name` | text | yes | yes | 0/0 |  |
| 2 | Birth assessment | 2 | `baf_husband_name` | text | yes | yes | 0/0 |  |
| 3 | Birth assessment | 3 | `baf_woman_hh_member_id` | text | yes | missing | 0/0 |  |
| 4 | Birth assessment | 4 | `baf_woman_permanent_id` | text | yes | missing | 0/0 |  |
| 5 | Birth assessment | 5 | `baf_pregnancy_id` | text | yes | yes | 0/0 |  |
| 6 | Birth assessment | 6 | `baf_total_live_births_miscarriages_stillbirths_weeks` | text | yes | missing | 0/0 |  |
| 7 | Birth assessment | 7 | `baf_birth_rank` | text | yes | yes | 0/0 |  |
| 8 | Birth assessment | 8 | `baf_birth_id` | text | yes | yes | 0/0 |  |
| 9 | Birth assessment | 9 | `baf_interview_date` | text | yes | yes | 0/0 |  |
| 10 | Birth assessment | 10 | `baf_interview_take_place` | radiogroup | yes | missing | 3/3 |  |
| 11 | Birth assessment | 11 | `baf_interviewer_present_during_delivery` | radiogroup | yes | missing | 1/2 |  |
| 12 | Birth assessment | 12 | `baf_birth_date` | text | yes | yes | 0/0 |  |
| 13 | Birth assessment | 13 | `baf_birth_time` | text | yes | missing | 0/0 |  |
| 14 | Birth assessment | 14 | `baf_child_sex` | radiogroup | yes | missing | 3/3 |  |
| 15 | Birth assessment | 15 | `baf_child_vital_status` | radiogroup | yes | missing | 2/2 | workflow: open_stillbirth_or_child_death_by_signs_of_life |
| 16 | Birth assessment | 16 | `baf_vital_status_infant_birth` | radiogroup | yes | missing | 2/2 |  |
| 17 | Birth assessment | 17 | `baf_baby_ever_cry_after_being_delivered` | radiogroup | yes | yes | 2/3 |  |
| 18 | Birth assessment | 18 | `baf_baby_ever_move_after_being_delivered` | radiogroup | yes | yes | 2/3 |  |
| 19 | Birth assessment | 19 | `baf_baby_ever_breathe_after_being_delivered` | radiogroup | yes | yes | 2/3 |  |
| 20 | Birth assessment | 20 | `baf_baby_show_any_other_signs_life_such_beating` | radiogroup | yes | yes | 2/3 |  |
| 21 | Birth assessment | 21 | `baf_clinical_determination_stillbirth_vs_neonatal_death_classification_informati` | radiogroup | yes | yes | 1/2 |  |
| 22 | Birth assessment | 22 | `baf_large_baby_birth` | radiogroup | yes | yes | 0/2 |  |
| 23 | Birth assessment | 22 | `baf_large_baby_birth_2` | radiogroup | yes | yes | 1/4 |  |
| 24 | Birth assessment | 23 | `baf_baby_weighted_birth` | radiogroup | yes | missing | 3/3 |  |
| 25 | Birth assessment | 24 | `baf_weight_birth_grams` | text | yes | missing | 0/0 |  |
| 26 | Birth assessment | 25 | `baf_length_birth_cm` | text | yes | yes | 0/0 |  |
| 27 | Birth assessment | 26 | `baf_head_circumference_cm` | text | yes | missing | 0/0 |  |
| 28 | Birth assessment | 27 | `baf_source_information_anthropometrics` | radiogroup | yes | missing | 2/2 |  |
| 29 | Birth assessment | 28 | `baf_date_anthropometrics_measured_dd_mm_yyyy` | text | yes | yes | 0/0 |  |
| 30 | Birth assessment | 29 | `baf_time_anthropometrics_measured_hh_mm_remaining_questions_live` | text | yes | missing | 0/0 |  |
| 31 | Birth assessment | 30 | `baf_after_birth_baby_put_chest` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 32 | Birth assessment | 31 | `baf_baby_s_bare_skin_touching_bare_skin` | radiogroup | yes | missing | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 33 | Birth assessment | 32 | `baf_long_after_birth_baby_put_bare_skin_chest` | radiogroup | yes | yes | 4/4 | visibleIf: `{baf_child_vital_status} = 1` |
| 34 | Birth assessment | 33 | `baf_delivery_time` | radiogroup | yes | yes | 2/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 35 | Birth assessment | 34 | `baf_delivery_time_2` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 36 | Birth assessment | 35 | `baf_ever_breastfeed_baby` | radiogroup | yes | yes | 2/2 | visibleIf: `{baf_child_vital_status} = 1` |
| 37 | Birth assessment | 36 | `baf_long_after_birth_start_breastfeeding_baby` | radiogroup | yes | yes | 4/4 | visibleIf: `{baf_ever_breastfeed_baby} = 1` |
| 38 | Birth assessment | 37 | `baf_baby_receive_colostrum` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 39 | Birth assessment | 38 | `baf_baby_been_given_anything_other_than_breast_milk` | radiogroup | yes | yes | 1/2 | visibleIf: `{baf_child_vital_status} = 1` |
| 40 | Birth assessment | 39 | `baf_baby_given_drink_anytyhing_else` | radiogroup | yes | missing | 4/9 | visibleIf: `{baf_child_vital_status} = 1` |
| 41 | Birth assessment | 39 | `baf_baby_given_drink_anytyhing_else_all_liquids_mentioned` | radiogroup | yes | missing | 4/5 | visibleIf: `{baf_child_vital_status} = 1` |
| 42 | Birth assessment | 40 | `baf_apgar_score` | radiogroup | yes | yes | 0/1 | visibleIf: `{baf_child_vital_status} = 1` |
| 43 | Birth assessment | 41 | `baf` | radiogroup | yes | yes | 0/2 | visibleIf: `{baf_child_vital_status} = 1` |
| 44 | Birth assessment | 42 | `baf_infant_show_any_signs_injury_birth` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 45 | Birth assessment | 43 | `baf_signs` | radiogroup | yes | missing | 4/5 | visibleIf: `{baf_infant_show_any_signs_injury_birth} = 1` |
| 46 | Birth assessment | 44 | `baf_long_after_birth_baby_begin_crying_breathing_minutes` | text | yes | yes | 0/0 | visibleIf: `{baf_child_vital_status} = 1` |
| 47 | Birth assessment | 45 | `baf_any_measures_taken_start_baby_crying_breathing` | radiogroup | yes | missing | 3/3 | visibleIf: `{baf_long_after_birth_baby_begin_crying_breathing_minutes} = 1` |
| 48 | Birth assessment | 46 | `baf_done_answer_up_three` | radiogroup | yes | missing | 8/12 | visibleIf: `{baf_child_vital_status} = 1` |
| 49 | Birth assessment | 47 | `baf_infant_crying_right_after_birth` | radiogroup | yes | yes | 4/4 | visibleIf: `{baf_done_answer_up_three} = 1` |
| 50 | Birth assessment | 48 | `baf_infant_move_its_limbs_right_after_birth` | radiogroup | yes | yes | 4/4 | visibleIf: `{baf_child_vital_status} = 1` |
| 51 | Birth assessment | 49 | `baf_color_baby_right_after_birth` | radiogroup | yes | missing | 1/4 | visibleIf: `{baf_infant_move_its_limbs_right_after_birth} = 1` |
| 52 | Birth assessment | 50 | `baf_baby_any_stiffening_back_convulsions_right_after_birth` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 53 | Birth assessment | 51 | `baf_baby_become_unconscious_since_birth` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_baby_any_stiffening_back_convulsions_right_after_birth} = 1` |
| 54 | Birth assessment | 52 | `baf_head_shape_size` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 55 | Birth assessment | 53 | `baf_yes_describe_free_answer` | text | yes | yes | 0/0 | visibleIf: `{baf_head_shape_size} = 1` |
| 56 | Birth assessment | 54 | `baf_eyes` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 57 | Birth assessment | 55 | `baf_yes_describe_free_answer_2` | text | yes | yes | 0/0 | visibleIf: `{baf_eyes} = 1` |
| 58 | Birth assessment | 56 | `baf_ears` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 59 | Birth assessment | 57 | `baf_yes_describe_free_answer_3` | text | yes | yes | 0/0 | visibleIf: `{baf_ears} = 1` |
| 60 | Birth assessment | 58 | `baf_nose` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 61 | Birth assessment | 59 | `baf_yes_describe_free_answer_4` | text | yes | yes | 0/0 | visibleIf: `{baf_nose} = 1` |
| 62 | Birth assessment | 60 | `baf_mouth_lips` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 63 | Birth assessment | 61 | `baf_yes_describe_free_answer_5` | text | yes | yes | 0/0 | visibleIf: `{baf_mouth_lips} = 1` |
| 64 | Birth assessment | 62 | `baf_jaw` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 65 | Birth assessment | 63 | `baf_yes_describe_free_answer_6` | text | yes | yes | 0/0 | visibleIf: `{baf_jaw} = 1` |
| 66 | Birth assessment | 64 | `baf_arms` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 67 | Birth assessment | 65 | `baf_yes_describe_free_answer_7` | text | yes | yes | 0/0 | visibleIf: `{baf_arms} = 1` |
| 68 | Birth assessment | 66 | `baf_hands_fingers` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 69 | Birth assessment | 67 | `baf_yes_describe_free_answer_8` | text | yes | yes | 0/0 | visibleIf: `{baf_hands_fingers} = 1` |
| 70 | Birth assessment | 68 | `baf_back` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 71 | Birth assessment | 69 | `baf_yes_describe_free_answer_9` | text | yes | yes | 0/0 | visibleIf: `{baf_back} = 1` |
| 72 | Birth assessment | 70 | `baf_genitalia` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 73 | Birth assessment | 71 | `baf_yes_describe_free_answer_10` | text | yes | yes | 0/0 | visibleIf: `{baf_genitalia} = 1` |
| 74 | Birth assessment | 72 | `baf_legs` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 75 | Birth assessment | 73 | `baf_yes_describe_free_answer_11` | text | yes | yes | 0/0 | visibleIf: `{baf_legs} = 1` |
| 76 | Birth assessment | 74 | `baf_feet_toes` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 77 | Birth assessment | 75 | `baf_yes_describe_free_answer_12` | text | yes | yes | 0/0 | visibleIf: `{baf_feet_toes} = 1` |
| 78 | Birth assessment | 76 | `baf_other` | radiogroup | yes | yes | 3/3 | visibleIf: `{baf_child_vital_status} = 1` |
| 79 | Birth assessment | 77 | `baf_yes_describe_free_answer_end_interview` | text | yes | yes | 0/0 | visibleIf: `{baf_child_vital_status} = 1` |

## CDF - Child Death Form (13 MAY 2026)

Summary: 12/22 question titles have Hindi; 18/28 choices have Hindi; 0 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Main form | 1 | `cdf_woman_name` | text | yes | yes | 0/0 |  |
| 2 | Main form | 2 | `cdf_husband_name` | text | yes | yes | 0/0 |  |
| 3 | Main form | 3 | `cdf_woman_hh_member_id` | text | yes | missing | 0/0 |  |
| 4 | Main form | 4 | `cdf_woman_permanent_id` | text | yes | missing | 0/0 |  |
| 5 | Main form | 5 | `cdf_pregnancy_id` | text | yes | yes | 0/0 |  |
| 6 | Main form | 6 | `cdf_birth_id` | text | yes | yes | 0/0 |  |
| 7 | Main form | 7 | `cdf_through_project_tool_death_detected` | radiogroup | yes | missing | 4/4 |  |
| 8 | Main form | 8 | `cdf_interview_take_place` | radiogroup | yes | missing | 1/2 |  |
| 9 | Main form | 9 | `cdf_interview_date` | text | yes | yes | 0/0 |  |
| 10 | Main form | 10 | `cdf_respondent` | radiogroup | yes | missing | 0/3 |  |
| 11 | Main form | 11 | `cdf_death_date` | text | yes | yes | 0/0 |  |
| 12 | Main form | 12 | `cdf_death_time` | text | yes | missing | 0/0 |  |
| 13 | Main form | 13 | `cdf_child_die` | radiogroup | yes | missing | 1/4 |  |
| 14 | Main form | 14 | `cdf_facility_he_she_die_free_answer` | text | yes | yes | 0/0 | visibleIf: `{cdf_child_die} = 2` |
| 15 | Main form | 15 | `cdf_death_registered_civil_registration_system` | radiogroup | yes | missing | 3/3 |  |
| 16 | Main form | 16 | `cdf_only_q13_q15` | radiogroup | yes | yes | 2/3 | visibleIf: `{cdf_child_die} = 1 or {cdf_death_registered_civil_registration_system} = 1` |
| 17 | Main form | 17 | `cdf_underlying_cause_death_indicated_certificate_free_answer_write` | text | yes | missing | 0/0 | visibleIf: `{cdf_only_q13_q15} = 1` |
| 18 | Main form | 18 | `cdf_contributing_cause_death_free_answer` | text | yes | missing | 0/0 | visibleIf: `{cdf_only_q13_q15} = 1` |
| 19 | Main form | 19 | `cdf_only_respondent_not_mother_q10` | radiogroup | yes | yes | 3/3 | visibleIf: `{cdf_respondent} != 1` |
| 20 | Main form | 20 | `cdf_mother_die_during_after_delivery` | radiogroup | yes | yes | 3/3 |  |
| 21 | Main form | 21 | `cdf_long_after_delivery_mother_die_days_end_interview` | text | yes | yes | 0/0 | visibleIf: `{cdf_mother_die_during_after_delivery} = 2` |
| 22 | Main form | 21 | `cdf_long_after_delivery_mother_die` | radiogroup | yes | yes | 1/3 |  |

## HRF - Household Rounds Form (14 MAY 2026)

Summary: 14/28 question titles have Hindi; 31/79 choices have Hindi; 3 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Main form | 1 | `hrf_household_id` | text | yes | yes | 0/0 |  |
| 2 | Main form | 2 | `hrf_household_head_name` | text | yes | yes | 0/0 |  |
| 3 | Main form | 3 | `hrf_household_head_id` | text | yes | yes | 0/0 |  |
| 4 | Main form | 4 | `hrf_interview_date` | text | yes | yes | 0/0 |  |
| 5 | Main form | 5 | `hrf_round_type` | radiogroup | yes | missing | 2/2 |  |
| 6 | Main form | 6 | `hrf_eligible_woman_name` | text | yes | yes | 0/0 |  |
| 7 | Main form | 7 | `hrf_husband_name` | text | yes | yes | 0/0 |  |
| 8 | Main form | 8 | `hrf_woman_hh_member_id` | text | yes | missing | 0/0 |  |
| 9 | Main form | 9 | `hrf_woman_permanent_id` | text | yes | missing | 0/0 |  |
| 10 | Main form | 10 | `hrf_current_marital_status` | radiogroup | yes | missing | 0/8 |  |
| 11 | Main form | 11 | `hrf_partner_sterilized` | radiogroup | yes | yes | 1/4 |  |
| 12 | Main form | 12 | `hrf_some_women_undergo_operation` | radiogroup | yes | missing | 0/3 |  |
| 13 | Main form | 13 | `hrf_pregnant` | radiogroup | yes | yes | 0/3 |  |
| 14 | Main form | 14 | `hrf_last_menstrual_period_date_given_start_days_ago` | radiogroup | yes | missing | 2/8 |  |
| 15 | Main form | 15 | `hrf_since_last_interaction_any_new` | radiogroup | yes | missing | 1/2 |  |
| 16 | Main form | 16 | `hrf_many_women_enter_number_new_women` | text | yes | yes | 0/0 |  |
| 17 | Main form |  | `hrf_new_eligible_women` | paneldynamic | panel | yes | 0/0 | visibleIf: `{hrf_how_many_women} > 0` |
| 17 | Main form | 17 | `hrf_household_member_line_number` | text | yes | yes | 0/0 | panel: hrf_new_eligible_women |
| 18 | Main form | 18 | `hrf_give_name_woman_these_women_starting_one_arrived` | text | yes | yes | 0/0 | panel: hrf_new_eligible_women |
| 19 | Main form | 19_i | `hrf_relationship_head_household` | radiogroup | yes | missing | 9/14 | panel: hrf_new_eligible_women |
| 20 | Main form | 20_i | `hrf_place_last_residence` | radiogroup | yes | missing | 0/4 | panel: hrf_new_eligible_women |
| 21 | Main form | 21_i | `hrf_since_long_continuously_months_living_here_years_less` | radiogroup | yes | missing | 0/2 | panel: hrf_new_eligible_women |
| 22 | Main form | 22_i | `hrf_old_years_digits_completed_years_date_last_birth` | radiogroup | yes | yes | 2/3 | panel: hrf_new_eligible_women |
| 23 | Main form | 23_i | `hrf_s_current_marital_status` | radiogroup | yes | missing | 1/2 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: hrf_new_eligible_women |
| 24 | Main form | 23_i | `hrf_s_current_marital_status_ask_only_individual_age` | radiogroup | yes | missing | 6/9 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: hrf_new_eligible_women |
| 25 | Main form | 24A_i | `hrf_age` | radiogroup | yes | missing | 2/6 | manual: Repeated-row logic needs final paneldynamic rules after confirming row model and birth/pregnancy history design.; panel: hrf_new_eligible_women |
| 26 | Main form | 24B_i | `hrf_highest_grade_ever` | radiogroup | yes | missing | 5/6 | panel: hrf_new_eligible_women |
| 27 | Main form | 25_i | `hrf_potential_person_eligible_pregnancy` | radiogroup | yes | yes | 0/3 | panel: hrf_new_eligible_women |

## NFF - Newborn Follow-Up Form (13 MAY 2026)

Summary: 47/67 question titles have Hindi; 74/105 choices have Hindi; 0 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Newborn follow-up | 1 | `nff_woman_name` | text | yes | yes | 0/0 |  |
| 2 | Newborn follow-up | 2 | `nff_husband_name` | text | yes | yes | 0/0 |  |
| 3 | Newborn follow-up | 3 | `nff_woman_hh_member_id` | text | yes | missing | 0/0 |  |
| 4 | Newborn follow-up | 4 | `nff_woman_permanent_id` | text | yes | missing | 0/0 |  |
| 5 | Newborn follow-up | 5 | `nff_pregnancy_id` | text | yes | yes | 0/0 |  |
| 6 | Newborn follow-up | 6 | `nff_birth_id` | text | yes | yes | 0/0 |  |
| 7 | Newborn follow-up | 7 | `nff_child_name` | text | yes | yes | 0/0 |  |
| 8 | Newborn follow-up | 8 | `nff_interview_date` | text | yes | yes | 0/0 |  |
| 9 | Newborn follow-up | 9 | `nff_visit_type` | radiogroup | yes | missing | 2/2 |  |
| 10 | Newborn follow-up | 10 | `nff_round_visit` | radiogroup | yes | missing | 6/7 |  |
| 11 | Newborn follow-up | 11 | `nff_staying` | radiogroup | yes | missing | 0/3 |  |
| 12 | Newborn follow-up | 12 | `nff_child_vital_status` | radiogroup | yes | missing | 2/2 | workflow: open_child_death_form |
| 13 | Newborn follow-up | 13 | `nff_person` | radiogroup | yes | yes | 1/2 | visibleIf: `{nff_visit_type} = 1` |
| 14 | Newborn follow-up | 14 | `nff_since_my_last_call_visit_baby_been_fed` | radiogroup | yes | missing | 2/3 |  |
| 15 | Newborn follow-up | 15 | `nff_baby_been_fed_breastmilk_another_mother` | radiogroup | yes | yes | 3/3 |  |
| 16 | Newborn follow-up | 16 | `nff_baby_been_fed_cow_goat_milk` | radiogroup | yes | yes | 3/3 |  |
| 17 | Newborn follow-up | 17 | `nff_baby_been_fed_weaning_food_i_e_solid` | radiogroup | yes | yes | 3/3 |  |
| 18 | Newborn follow-up | 18 | `nff_baby_difficulty_sucking` | radiogroup | yes | yes | 2/3 |  |
| 19 | Newborn follow-up | 19 | `nff_baby_difficulty_breathing` | radiogroup | yes | yes | 2/3 |  |
| 20 | Newborn follow-up | 20 | `nff_baby_convulsions` | radiogroup | yes | yes | 2/3 |  |
| 21 | Newborn follow-up | 21 | `nff_baby_stiffness_back` | radiogroup | yes | yes | 2/3 |  |
| 22 | Newborn follow-up | 22 | `nff_baby_been_hot_touch` | radiogroup | yes | yes | 3/3 |  |
| 23 | Newborn follow-up | 23 | `nff_baby_been_cold_touch` | radiogroup | yes | yes | 3/3 |  |
| 24 | Newborn follow-up | 24 | `nff_baby_vomiting` | radiogroup | yes | yes | 3/3 |  |
| 25 | Newborn follow-up | 25 | `nff_baby_been_very_lethargic_unconscious` | radiogroup | yes | yes | 2/3 |  |
| 26 | Newborn follow-up | 26 | `nff_baby_s_body_soles_palms_eyes_become_yellow` | radiogroup | yes | yes | 2/3 |  |
| 27 | Newborn follow-up | 27 | `nff_baby_any_skin_infection_other_skin_problem` | radiogroup | yes | yes | 3/3 |  |
| 28 | Newborn follow-up | 28 | `nff_baby_been_placed_skin_skin_mother_keep` | radiogroup | yes | yes | 2/3 |  |
| 29 | Newborn follow-up | 29 | `nff_baby_worn_hat_other_covering_his_her_head` | radiogroup | yes | yes | 3/3 |  |
| 30 | Newborn follow-up | 30 | `nff_baby_been_given_bath` | radiogroup | yes | yes | 3/3 |  |
| 31 | Newborn follow-up | 31 | `nff_baby_received_any_health_care_home_outside_home` | radiogroup | yes | yes | 3/3 |  |
| 32 | Newborn follow-up | 32 | `nff_baby_get_care` | radiogroup | yes | missing | 5/6 | visibleIf: `{nff_baby_received_any_health_care_home_outside_home} = 1` |
| 33 | Newborn follow-up | 35 | `nff_care_take_place` | radiogroup | yes | missing | 4/4 | visibleIf: `{nff_baby_received_any_health_care_home_outside_home} = 1` |
| 34 | Newborn follow-up | 36 | `nff_name_address_health_facility_free_answer` | text | yes | missing | 0/0 | visibleIf: `{nff_baby_received_any_health_care_home_outside_home} = 1` |
| 35 | Newborn follow-up | 37 | `nff_any_drug_medication_given_child` | radiogroup | yes | missing | 1/1 | visibleIf: `{nff_baby_received_any_health_care_home_outside_home} = 1` |
| 36 | Newborn follow-up | 37 | `nff_any_drug_medication_given_child_2` | radiogroup | yes | missing | 2/2 |  |
| 37 | Newborn follow-up | 38 | `nff_specify_free_answer_end_telephonic_interview_person_visits` | text | yes | yes | 0/0 | visibleIf: `{nff_any_drug_medication_given_child_2} = 1` |
| 38 | Newborn follow-up | 39 | `nff_card_other_document_child_s_vaccinations` | radiogroup | yes | yes | 1/4 | visibleIf: `{nff_visit_type} = 1` |
| 39 | Newborn follow-up | 40 | `nff_bcg_dd_mm_yyyy_copy_vaccination_date_each` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 40 | Newborn follow-up | 41 | `nff_polio` | radiogroup | yes | yes | 1/1 | visibleIf: `{nff_visit_type} = 1` |
| 41 | Newborn follow-up | 42 | `nff_polio_2` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 42 | Newborn follow-up | 43 | `nff_polio_3` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 43 | Newborn follow-up | 44 | `nff_polio_4` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 44 | Newborn follow-up | 45 | `nff_fipv` | radiogroup | yes | missing | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 45 | Newborn follow-up | 46 | `nff_fipv_2` | radiogroup | yes | missing | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 46 | Newborn follow-up | 47 | `nff_hepatitis` | radiogroup | yes | yes | 1/1 | visibleIf: `{nff_visit_type} = 1` |
| 47 | Newborn follow-up | 48 | `nff_pentavalent` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 48 | Newborn follow-up | 49 | `nff_pentavalent_2` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 49 | Newborn follow-up | 50 | `nff_pentavalent_3` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 50 | Newborn follow-up | 51 | `nff_rotavirus` | radiogroup | yes | missing | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 51 | Newborn follow-up | 52 | `nff_rotavirus_2` | radiogroup | yes | missing | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 52 | Newborn follow-up | 53 | `nff_rotavirus_3` | radiogroup | yes | missing | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 53 | Newborn follow-up | 54 | `nff_je` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 54 | Newborn follow-up | 55 | `nff_je_2` | radiogroup | yes | yes | 0/1 | visibleIf: `{nff_visit_type} = 1` |
| 55 | Newborn follow-up | 56 | `nff_mcv_mmr_mr_dd_mm_yyyy` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 56 | Newborn follow-up | 57 | `nff_mcv_mmr_mr_dd_mm_yyyy_2` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 57 | Newborn follow-up | 58 | `nff_dpt_booster_dd_mm_yyyy` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 58 | Newborn follow-up | 59 | `nff_vitamin` | radiogroup | yes | missing | 1/1 | visibleIf: `{nff_visit_type} = 1` |
| 59 | Newborn follow-up | 60 | `nff_vitamin_2` | radiogroup | yes | missing | 1/1 | visibleIf: `{nff_visit_type} = 1` |
| 60 | Newborn follow-up | 61 | `nff_pcv1_dd_mm_yyyy` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 61 | Newborn follow-up | 62 | `nff_pcv2_dd_mm_yyyy` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 62 | Newborn follow-up | 63 | `nff_pcv_booster_dd_mm_yyyy` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 63 | Newborn follow-up | 64 | `nff_opv_booster_dd_mm_yyyy` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 64 | Newborn follow-up | 65 | `nff_weight_gr_measured_site` | text | yes | missing | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 65 | Newborn follow-up | 66 | `nff_length_cm_measured_site` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 66 | Newborn follow-up | 67 | `nff_head_circumference_cm_measured_site` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |
| 67 | Newborn follow-up | 68 | `nff_mid_arm_circumference_cm_measured_site` | text | yes | yes | 0/0 | visibleIf: `{nff_visit_type} = 1` |

## PEF - Pregnancy Enrollment Form (11 MAY 2026)

Summary: 60/81 question titles have Hindi; 45/215 choices have Hindi; 0 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Main form | 1 | `pef_pregnancy_information_source` | radiogroup | yes | missing | 3/4 |  |
| 2 | Main form | 2 | `pef_woman_name` | text | yes | yes | 0/0 |  |
| 3 | Main form | 3 | `pef_husband_name` | text | yes | yes | 0/0 |  |
| 4 | Main form | 4 | `pef_woman_hh_member_id` | text | yes | missing | 0/0 |  |
| 5 | Main form | 5 | `pef_woman_permanent_id` | text | yes | missing | 0/0 |  |
| 6 | Main form | 6 | `pef_enrollment_date` | text | yes | yes | 0/0 |  |
| 7 | Main form | 7 | `pef_pregnancy_confirmed` | radiogroup | yes | yes | 2/2 | workflow: perform_upt_or_continue_to_lmp_by_site |
| 8 | Main form | 8 | `pef_spot_upt_result` | radiogroup | yes | yes | 2/3 | visibleIf: `{pef_pregnancy_confirmed} = 2`; workflow: stop_pregnancy_enrollment |
| 9 | Main form | 9 | `pef_pregnancy_confirmed_upt` | radiogroup | yes | missing | 2/2 |  |
| 10 | Main form | 10 | `pef_pregnancy_rank_since_baseline` | radiogroup | yes | yes | 3/3 |  |
| 11 | Main form | 11 | `pef_pregnancy_id` | text | yes | yes | 0/0 |  |
| 12 | Main form | 12 | `pef_any_time_during_pregnancy_ultrasound` | radiogroup | yes | yes | 1/2 |  |
| 13 | Main form | 13 | `pef_many_ultrasound_tests_number_ultrasounds` | text | yes | yes | 0/0 | visibleIf: `{pef_any_time_during_pregnancy_ultrasound} = 1` |
| 14 | Main form | 14 | `pef_first_ultrasound_report` | radiogroup | yes | yes | 2/2 | visibleIf: `{pef_any_time_during_pregnancy_ultrasound} = 1` |
| 15 | Main form | 15 | `pef_ultrasound_facility` | text | yes | missing | 0/0 | visibleIf: `{pef_first_ultrasound_report} = 1` |
| 16 | Main form | 16 | `pef_reports_second_third_ultrasound` | radiogroup | yes | yes | 2/2 | visibleIf: `{pef_many_ultrasound_tests_had_number_ultrasounds} > 1` |
| 17 | Main form | 17 | `pef_many_weeks_months_pregnant` | radiogroup | yes | yes | 1/4 | visibleIf: `{pef_pregnancy_information_source} anyof [2,3,4]` |
| 18 | Main form | 18 | `pef_last_menstrual_period_start_answer_only` | radiogroup | yes | missing | 3/13 | visibleIf: `{pef_pregnancy_information_source} anyof [3,4]` |
| 19 | Main form | 19 | `pef_past` | radiogroup | yes | yes | 1/3 |  |
| 20 | Main form | 20 | `pef_yes_go_care` | radiogroup | yes | yes | 0/7 | visibleIf: `{pef_past} = 1` |
| 21 | Main form | 21 | `pef_no_plans_go_antenatal_care` | radiogroup | yes | yes | 2/2 | visibleIf: `{pef_past} = 2` |
| 22 | Main form | 22 | `pef_planning_go_antenatal_care` | radiogroup | yes | missing | 0/8 | visibleIf: `{pef_no_plans_go_antenatal_care} = 1` |
| 23 | Main form | 23a | `pef_currently_diabetes` | radiogroup | yes | yes | 0/3 |  |
| 24 | Main form | 23b | `pef_sought_treatment_problem_diabetes` | radiogroup | yes | yes | 0/2 | visibleIf: `{pef_currently_diabetes} = 1` |
| 25 | Main form | 24a | `pef_currently_hypertension` | radiogroup | yes | yes | 0/3 |  |
| 26 | Main form | 24b | `pef_sought_treatment_problem_hypertension` | radiogroup | yes | yes | 0/2 | visibleIf: `{pef_currently_hypertension} = 1` |
| 27 | Main form | 25a | `pef_currently_chronic_respiratory_disease_including` | radiogroup | yes | yes | 0/3 |  |
| 28 | Main form | 25b | `pef_sought_treatment_problem_chronic` | radiogroup | yes | yes | 0/2 | visibleIf: `{pef_currently_chronic_respiratory_disease_including} = 1` |
| 29 | Main form | 26a | `pef_currently_goitre_any_other_thyroid_disorder` | radiogroup | yes | yes | 0/3 |  |
| 30 | Main form | 26b | `pef_sought_treatment_problem_goitre_any` | radiogroup | yes | yes | 0/2 | visibleIf: `{pef_currently_goitre_any_other_thyroid_disorder} = 1` |
| 31 | Main form | 27a | `pef_currently_any_heart_disease` | radiogroup | yes | yes | 0/3 |  |
| 32 | Main form | 27b | `pef_sought_treatment_problem_any_heart` | radiogroup | yes | yes | 0/1 | visibleIf: `{pef_currently_any_heart_disease} = 1` |
| 33 | Main form | 27b | `pef_sought_treatment_problem_any_heart_disease` | radiogroup | yes | yes | 0/1 | visibleIf: `{pef_currently_any_heart_disease} = 1` |
| 34 | Main form | 28a | `pef_currently_cancer` | radiogroup | yes | yes | 0/3 |  |
| 35 | Main form | 28b | `pef_sought_treatment_problem_cancer` | radiogroup | yes | yes | 0/2 | visibleIf: `{pef_currently_cancer} = 1` |
| 36 | Main form | 29a | `pef_currently_any_chronic_kidney_disorder` | radiogroup | yes | yes | 0/3 |  |
| 37 | Main form | 29b | `pef_sought_treatment_problem_any_chronic` | radiogroup | yes | yes | 0/2 | visibleIf: `{pef_currently_any_chronic_kidney_disorder} = 1` |
| 38 | Main form | 30a | `pef_currently_anemia` | radiogroup | yes | yes | 0/3 |  |
| 39 | Main form | 30b | `pef_sought_treatment_problem_anemia` | radiogroup | yes | yes | 0/5 | visibleIf: `{pef_currently_anemia} = 1` |
| 40 | Main form | 31 | `pef_persistent_cough` | radiogroup | yes | yes | 0/3 |  |
| 41 | Main form | 32 | `pef_difficult_rapid_breathing` | radiogroup | yes | yes | 0/3 |  |
| 42 | Main form | 33 | `pef_wheezing_grunting` | radiogroup | yes | missing | 0/3 |  |
| 43 | Main form | 34 | `pef_shortness_breath` | radiogroup | yes | missing | 0/3 |  |
| 44 | Main form | 35 | `pef_blood_sputum` | radiogroup | yes | yes | 0/3 |  |
| 45 | Main form | 36 | `pef_poor_appetite` | radiogroup | yes | yes | 0/3 |  |
| 46 | Main form | 37 | `pef_nausea` | radiogroup | yes | yes | 0/3 |  |
| 47 | Main form | 38 | `pef_vomiting` | radiogroup | yes | missing | 0/3 |  |
| 48 | Main form | 39 | `pef_convulsions` | radiogroup | yes | yes | 0/3 |  |
| 49 | Main form | 40 | `pef_swelling_hands` | radiogroup | yes | missing | 0/3 |  |
| 50 | Main form | 41 | `pef_swelling_face` | radiogroup | yes | missing | 0/3 |  |
| 51 | Main form | 42 | `pef_severe_headache` | radiogroup | yes | missing | 0/3 |  |
| 52 | Main form | 43 | `pef_high_fever` | radiogroup | yes | yes | 0/3 |  |
| 53 | Main form | 44 | `pef_watery_stool` | radiogroup | yes | missing | 0/3 |  |
| 54 | Main form | 45 | `pef_blood_white_mucus_stool` | radiogroup | yes | yes | 0/3 |  |
| 55 | Main form | 46 | `pef_painful_burning_urination` | radiogroup | yes | yes | 0/3 |  |
| 56 | Main form | 47 | `pef_foul_smelling_vaginal_discharge` | radiogroup | yes | yes | 0/3 |  |
| 57 | Main form | 48 | `pef_spots_blood_vagina` | radiogroup | yes | missing | 0/3 |  |
| 58 | Main form | 49 | `pef_vaginal_bleeding` | radiogroup | yes | missing | 0/3 |  |
| 59 | Main form | 50 | `pef_night_blindness` | radiogroup | yes | yes | 0/3 |  |
| 60 | Main form | 51 | `pef_jaundice` | radiogroup | yes | yes | 0/3 |  |
| 61 | Main form | 52 | `pef_continuously_dripping_urine` | radiogroup | yes | yes | 0/3 |  |
| 62 | Main form | 53 | `pef_feces_passing_through_birth_canal` | radiogroup | yes | yes | 0/3 |  |
| 63 | Main form | 54 | `pef_baby_moving_less_than_normal` | radiogroup | yes | yes | 0/3 |  |
| 64 | Main form | 55 | `pef_severe_lower_abdominal_pain` | radiogroup | yes | missing | 0/1 |  |
| 65 | Main form | 55 | `pef_severe_lower_abdominal_pain_2` | radiogroup | yes | missing | 0/2 |  |
| 66 | Main form | 56 | `pef_blurred_vision` | radiogroup | yes | yes | 0/3 |  |
| 67 | Main form | 57 | `pef_eye_redness_irritation` | radiogroup | yes | yes | 0/3 |  |
| 68 | Main form | 58 | `pef_currently_smoke_cigarettes` | radiogroup | yes | yes | 2/4 |  |
| 69 | Main form | 59 | `pef_average_many_cigarettes_smoke_each_day_number_cigarettes` | text | yes | yes | 0/0 | visibleIf: `{pef_currently_smoke_cigarettes} = 1` |
| 70 | Main form | 60 | `pef_currently_smoke_bidis_every_day_some_days_not` | radiogroup | yes | yes | 2/3 |  |
| 71 | Main form | 61 | `pef_average_many_bidis_smoke_each_day_number_cigarettes` | text | yes | yes | 0/0 | visibleIf: `{pef_currently_smoke_bidis_every_day_some_days_not} = 1` |
| 72 | Main form | 62 | `pef_currently_smoke_use_any_other_type_tobacco_every` | radiogroup | yes | yes | 2/3 |  |
| 73 | Main form | 63 | `pef_other_type_tobacco_currently_smoke_use` | checkbox | yes | missing | 7/9 | visibleIf: `{pef_currently_smoke_use_any_other_type_tobacco_every} anyof [1,2]` |
| 74 | Main form | 64 | `pef_ever_consumed_alcohol` | radiogroup | yes | yes | 1/3 |  |
| 75 | Main form | 65 | `pef_during_last_month_many_days` | radiogroup | yes | yes | 2/2 | visibleIf: `{pef_ever_consumed_alcohol} = 1` |
| 76 | Main form | 66 | `pef_we_count_one_drink_alcohol_one_can_bottle` | radiogroup | yes | missing | 1/1 | visibleIf: `{pef_during_last_month_many_days} > 0` |
| 77 | Main form | 67 | `pef_weight_kg_measured_site` | text | yes | missing | 0/0 |  |
| 78 | Main form | 68 | `pef_height_cm_automatically_filled_woman_s_questionnaire` | text | yes | yes | 0/0 |  |
| 79 | Main form | 69 | `pef_blood_pressure_measured_site` | text | yes | yes | 0/0 |  |
| 80 | Main form | 70 | `pef_haemoglobin_g_dl_check_health_report` | radiogroup | yes | yes | 1/1 |  |
| 81 | Main form | 71 | `pef_eligibility_ultrasound_form` | radiogroup | yes | yes | 3/8 |  |

## PFF - Pregnancy Follow-Up Form (11 MAY 2026)

Summary: 59/79 question titles have Hindi; 39/199 choices have Hindi; 2 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Pregnancy follow-up | 1 | `pff_woman_name` | text | yes | yes | 0/0 |  |
| 2 | Pregnancy follow-up | 2 | `pff_husband_name` | text | yes | yes | 0/0 |  |
| 3 | Pregnancy follow-up | 3 | `pff_woman_hh_member_id` | text | yes | missing | 0/0 |  |
| 4 | Pregnancy follow-up | 4 | `pff_woman_permanent_id` | text | yes | missing | 0/0 |  |
| 5 | Pregnancy follow-up | 5 | `pff_pregnancy_id` | text | yes | yes | 0/0 |  |
| 6 | Pregnancy follow-up | 6 | `pff_visit_date` | text | yes | yes | 0/0 |  |
| 7 | Pregnancy follow-up | 7 | `pff_visit_type` | radiogroup | yes | missing | 1/2 |  |
| 8 | Pregnancy follow-up | 8 | `pff_vital_migration_status_woman` | radiogroup | yes | missing | 3/3 | workflow: stop_pregnancy_followup_for_death_or_permanent_move |
| 9 | Pregnancy follow-up | 9 | `pff_staying_moment` | radiogroup | yes | missing | 3/3 |  |
| 10 | Pregnancy follow-up | 10 | `pff_pregnancy_status` | radiogroup | yes | yes | 1/2 |  |
| 11 | Pregnancy follow-up | 11 | `pff_ultrasound_form_already_been_filled` | radiogroup | yes | yes | 1/2 |  |
| 12 | Pregnancy follow-up | 12 | `pff_any_time_during_pregnancy_ultrasound_test` | radiogroup | yes | yes | 2/2 | visibleIf: `{pff_ultrasound_form_already_been_filled} = 2` |
| 13 | Pregnancy follow-up | 13 | `pff_many_ultrasound_tests_number_ultrasounds` | text | yes | yes | 0/0 | visibleIf: `{pff_ultrasound_form_already_been_filled} = 2 and {pff_any_time_during_pregnancy_ultrasound_test} = 1` |
| 14 | Pregnancy follow-up | 14 | `pff_first_ultrasound_report` | radiogroup | yes | yes | 2/2 | visibleIf: `{pff_ultrasound_form_already_been_filled} = 2 and {pff_any_time_during_pregnancy_ultrasound_test} = 1` |
| 15 | Pregnancy follow-up | 15 | `pff_ultrasound_facility` | text | yes | missing | 0/0 | visibleIf: `{pff_ultrasound_form_already_been_filled} = 2 and {pff_any_time_during_pregnancy_ultrasound_test} = 1 and {pff_first_ultrasound_report} = 1` |
| 16 | Pregnancy follow-up | 16 | `pff_reports_second_third_ultrasound_tests` | radiogroup | yes | yes | 2/3 | visibleIf: `{pff_ultrasound_form_already_been_filled} = 2 and {pff_how_many_ultrasound_tests_had_number_ultrasounds} > 1` |
| 17 | Pregnancy follow-up | 17 | `pff_past` | radiogroup | yes | yes | 1/3 |  |
| 18 | Pregnancy follow-up | 18 | `pff_yes_go_care` | radiogroup | yes | yes | 0/7 | visibleIf: `{pff_past} = 1` |
| 19 | Pregnancy follow-up | 19 | `pff_no_plans_go_antenatal_care` | radiogroup | yes | yes | 2/3 | visibleIf: `{pff_past} = 2` |
| 20 | Pregnancy follow-up | 20 | `pff_planning_go_antenatal_care` | radiogroup | yes | missing | 0/8 | visibleIf: `{pff_no_plans_go_antenatal_care} = 1` |
| 21 | Pregnancy follow-up | 21a | `pff_currently_diabetes` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 22 | Pregnancy follow-up | 21b | `pff_sought_treatment_problem_diabetes` | radiogroup | yes | yes | 0/2 | visibleIf: `{pff_currently_diabetes} = 1` |
| 23 | Pregnancy follow-up | 22a | `pff_currently_hypertension` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 24 | Pregnancy follow-up | 22b | `pff_sought_treatment_problem_hypertension` | radiogroup | yes | yes | 0/2 | visibleIf: `{pff_currently_hypertension} = 1` |
| 25 | Pregnancy follow-up | 23a | `pff_currently_chronic_respiratory_disease_including_asthma` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 26 | Pregnancy follow-up | 23b | `pff_sought_treatment_problem_chronic_respiratory_disease_including` | radiogroup | yes | yes | 0/2 | visibleIf: `{pff_currently_chronic_respiratory_disease_including_asthma} = 1` |
| 27 | Pregnancy follow-up | 24a | `pff_currently_goitre_any_other_thyroid_disorder` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 28 | Pregnancy follow-up | 24b | `pff_sought_treatment_problem_goitre_any_other_thyroid` | radiogroup | yes | yes | 0/2 | visibleIf: `{pff_currently_goitre_any_other_thyroid_disorder} = 1` |
| 29 | Pregnancy follow-up | 25a | `pff_currently_any_heart_disease` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 30 | Pregnancy follow-up | 25b | `pff_sought_treatment_problem_any_heart_disease` | radiogroup | yes | yes | 0/2 | visibleIf: `{pff_currently_any_heart_disease} = 1` |
| 31 | Pregnancy follow-up | 26a | `pff_currently_cancer` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 32 | Pregnancy follow-up | 26b | `pff_sought_treatment_problem_cancer` | radiogroup | yes | yes | 0/2 | visibleIf: `{pff_currently_cancer} = 1` |
| 33 | Pregnancy follow-up | 27a | `pff_currently_any_chronic_kidney_disorder` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 34 | Pregnancy follow-up | 28b | `pff_sought_treatment_problem_any_chronic_kidney_disorder` | radiogroup | yes | yes | 0/2 | visibleIf: `{pff_currently_any_chronic_kidney_disorder} = 1` |
| 35 | Pregnancy follow-up | 29a | `pff_currently_anemia` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 36 | Pregnancy follow-up | 29b | `pff_sought_treatment_problem_anemia` | radiogroup | yes | yes | 0/5 | visibleIf: `{pff_currently_anemia} = 1` |
| 37 | Pregnancy follow-up | 30 | `pff_persistent_cough` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 38 | Pregnancy follow-up | 31 | `pff_difficult_rapid_breathing` | radiogroup | yes | yes | 0/2 | visibleIf: `{pff_visit_type} = 2` |
| 39 | Pregnancy follow-up | 31 | `pff_difficult_rapid_breathing_2` | radiogroup | yes | yes | 0/1 |  |
| 40 | Pregnancy follow-up | 32 | `pff_wheezing_grunting` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 41 | Pregnancy follow-up | 33 | `pff_shortness_breath` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 42 | Pregnancy follow-up | 34 | `pff_blood_sputum` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 43 | Pregnancy follow-up | 35 | `pff_poor_appetite` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 44 | Pregnancy follow-up | 36 | `pff_nausea` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 45 | Pregnancy follow-up | 37 | `pff_vomiting` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 46 | Pregnancy follow-up | 38 | `pff_convulsions` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 47 | Pregnancy follow-up | 39 | `pff_swelling_hands` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 48 | Pregnancy follow-up | 40 | `pff_swelling_face` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 49 | Pregnancy follow-up | 41 | `pff_severe_headache` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 50 | Pregnancy follow-up | 42 | `pff_high_fever` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 51 | Pregnancy follow-up | 43 | `pff_watery_stool` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 52 | Pregnancy follow-up | 44 | `pff_blood_white_mucus_stool` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 53 | Pregnancy follow-up | 45 | `pff_painful_burning_urination` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 54 | Pregnancy follow-up | 46 | `pff_foul_smelling_vaginal_discharge` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 55 | Pregnancy follow-up | 47 | `pff_spots_blood_vagina` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 56 | Pregnancy follow-up | 48 | `pff_vaginal_bleeding` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 57 | Pregnancy follow-up | 49 | `pff_night_blindness` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 58 | Pregnancy follow-up | 50 | `pff_jaundice` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 59 | Pregnancy follow-up | 51 | `pff_continuously_dripping_urine` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 60 | Pregnancy follow-up | 52 | `pff_feces_passing_through_birth_canal` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 61 | Pregnancy follow-up | 53 | `pff_baby_moving_less_than_normal` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 62 | Pregnancy follow-up | 54 | `pff_severe_lower_abdominal_pain` | radiogroup | yes | missing | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 63 | Pregnancy follow-up | 55 | `pff_blurred_vision` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 64 | Pregnancy follow-up | 56 | `pff_eye_redness_irritation` | radiogroup | yes | yes | 0/3 | visibleIf: `{pff_visit_type} = 2` |
| 65 | Pregnancy follow-up | 57 | `pff_currently_smoke_cigarettes` | radiogroup | yes | yes | 2/4 |  |
| 66 | Pregnancy follow-up | 58 | `pff_average_many_cigarettes_smoke_each_day_number_cigarettes` | text | yes | yes | 0/0 | visibleIf: `{pff_currently_smoke_cigarettes} = 1` |
| 67 | Pregnancy follow-up | 59 | `pff_currently_smoke_bidis_every_day_some_days_not` | radiogroup | yes | yes | 2/3 | visibleIf: `{pff_visit_type} = 2` |
| 68 | Pregnancy follow-up | 60 | `pff_average_many_bidis_smoke_each_day_number_cigarettes` | text | yes | yes | 0/0 | visibleIf: `{pff_currently_smoke_bidis_every_day_some_days_not} = 1` |
| 69 | Pregnancy follow-up | 61 | `pff_currently_smoke_use_any_other_type_tobacco_every` | radiogroup | yes | yes | 2/3 | visibleIf: `{pff_visit_type} = 2` |
| 70 | Pregnancy follow-up | 62 | `pff_other_type_tobacco_currently_smoke_use` | checkbox | yes | missing | 7/9 | visibleIf: `{pff_currently_smoke_use_any_other_type_tobacco_every} anyof [1,2]` |
| 71 | Pregnancy follow-up | 63 | `pff_ever_consumed_alcohol` | radiogroup | yes | yes | 0/2 | manual: Alcohol module text merged with examples; verify values and branch before strict enforcement. |
| 72 | Pregnancy follow-up | 63 | `pff_alcohol_standard_drinks_prompt` | radiogroup | yes | yes | 1/2 | manual: Alcohol module text merged with examples; verify values and branch before strict enforcement. |
| 73 | Pregnancy follow-up | 64 | `pff_during_last_month_many_days_least_one_drink` | radiogroup | yes | yes | 2/2 | visibleIf: `{pff_ever_consumed_alcohol} = 1` |
| 74 | Pregnancy follow-up | 65 | `pff_we_count_one_drink_alcohol_one_can_bottle` | radiogroup | yes | missing | 1/1 | visibleIf: `{pff_during_last_month_many_days_least_one_drink} > 0` |
| 75 | Pregnancy follow-up | 66 | `pff_weight_kg_measured_site` | text | yes | missing | 0/0 |  |
| 76 | Pregnancy follow-up | 67 | `pff_height_cm_automatically_filled_woman_s_questionnaire` | text | yes | yes | 0/0 | visibleIf: `{pff_visit_type} = 2` |
| 77 | Pregnancy follow-up | 68 | `pff_blood_pressure_measured_site` | text | yes | yes | 0/0 |  |
| 78 | Pregnancy follow-up | 69 | `pff_haemoglobin_g_dl_check_health_report` | radiogroup | yes | yes | 1/1 |  |
| 79 | Pregnancy follow-up | 70 | `pff_eligibility_ultrasound_form` | radiogroup | yes | yes | 3/8 |  |

## POF - Pregnancy Outcome Form (13 MAY 2026)

Summary: 37/72 question titles have Hindi; 167/231 choices have Hindi; 6 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Pregnancy outcome | 1 | `pof_woman_name` | text | yes | yes | 0/0 |  |
| 2 | Pregnancy outcome | 2 | `pof_husband_name` | text | yes | yes | 0/0 |  |
| 3 | Pregnancy outcome | 3 | `pof_woman_hh_member_id` | text | yes | missing | 0/0 |  |
| 4 | Pregnancy outcome | 4 | `pof_woman_permanent_id` | text | yes | missing | 0/0 |  |
| 5 | Pregnancy outcome | 5 | `pof_pregnancy_id` | text | yes | yes | 0/0 |  |
| 6 | Pregnancy outcome | 6 | `pof_interview_date` | text | yes | yes | 0/0 |  |
| 7 | Pregnancy outcome | 7 | `pof_delivery_date` | text | yes | yes | 0/0 |  |
| 8 | Pregnancy outcome | 8 | `pof_delivery_time` | text | yes | missing | 0/0 |  |
| 9 | Pregnancy outcome | 9 | `pof_gestational_age_per_lmp_days_automatically_filled_lmp` | text | yes | yes | 0/0 |  |
| 10 | Pregnancy outcome | 10 | `pof_gestational_age_per_1st_ultrasound_days` | text | yes | yes | 0/0 |  |
| 11 | Pregnancy outcome | 11 | `pof_interview_take_place` | radiogroup | yes | missing | 2/3 |  |
| 12 | Pregnancy outcome | 12 | `pof_interviewer_present_during_delivery` | radiogroup | yes | missing | 2/2 |  |
| 13 | Pregnancy outcome | 13 | `pof_pregnancy_outcome_type` | radiogroup | yes | missing | 3/4 | workflow: stop_pregnancy_outcome_after_induced_abortion |
| 14 | Pregnancy outcome | 14 | `pof_number_live_born_infants_fill_one_birth_assessment` | text | yes | yes | 0/0 |  |
| 15 | Pregnancy outcome | 15 | `pof_number_miscarriages_stillbirths_fill_one_birth_assessment_form` | text | yes | yes | 0/0 |  |
| 16 | Pregnancy outcome | 16 | `pof_during_final` | radiogroup | yes | yes | 3/4 |  |
| 17 | Pregnancy outcome | 17 | `pof_many_days_bleed_days` | radiogroup | yes | yes | 0/1 |  |
| 18 | Pregnancy outcome | 18 | `pof_bleeding_accompanied_lower_abdominal_pain` | radiogroup | yes | missing | 3/3 |  |
| 19 | Pregnancy outcome | 19 | `pof_about_vaginal_bleeding_during_final_days_pregnancy` | radiogroup | yes | yes | 3/3 |  |
| 20 | Pregnancy outcome | 20 | `pof_many_days_bleed_days_2` | radiogroup | yes | yes | 0/1 |  |
| 21 | Pregnancy outcome | 21 | `pof_bleeding_accompanied_lower_abdominal_pain_2` | radiogroup | yes | missing | 3/3 |  |
| 22 | Pregnancy outcome | 22 | `pof_convulsions_during_final` | radiogroup | yes | yes | 3/4 |  |
| 23 | Pregnancy outcome | 23 | `pof_about_convulsions_during_final_days_pregnancy` | radiogroup | yes | yes | 1/1 |  |
| 24 | Pregnancy outcome | 23 | `pof_about_convulsions_during_final_days_pregnancy_2` | radiogroup | yes | yes | 2/2 |  |
| 25 | Pregnancy outcome | 24 | `pof_high_fever_during_final` | radiogroup | yes | yes | 3/4 |  |
| 26 | Pregnancy outcome | 25 | `pof_about_high_fever_during_final_days_pregnancy` | radiogroup | yes | yes | 3/3 |  |
| 27 | Pregnancy outcome | 26 | `pof_swelling_hands_face_during_final` | radiogroup | yes | yes | 2/4 |  |
| 28 | Pregnancy outcome | 27 | `pof_about_swelling_hands_face_during_final_days` | radiogroup | yes | yes | 2/3 |  |
| 29 | Pregnancy outcome | 28 | `pof_severe_headache_during_final` | radiogroup | yes | yes | 3/4 |  |
| 30 | Pregnancy outcome | 29 | `pof_about_sever_headache_during_final_days_pregnancy` | radiogroup | yes | yes | 3/3 |  |
| 31 | Pregnancy outcome | 30 | `pof_accident_receive_injury_any_kind_during_final` | radiogroup | yes | yes | 2/4 |  |
| 32 | Pregnancy outcome | 31 | `pof_accident_receive_injury_any_kind_during_final_2` | radiogroup | yes | yes | 2/3 |  |
| 33 | Pregnancy outcome | 32 | `pof_yes_explain_happened_free_answer` | text | yes | yes | 0/0 |  |
| 34 | Pregnancy outcome | 33 | `pof_baby_moving_last_few_days_before_birth` | radiogroup | yes | missing | 3/3 |  |
| 35 | Pregnancy outcome | 34 | `pof_last_feel_baby_move` | radiogroup | yes | missing | 1/4 | workflow: stop_before_birth_assessment_if_less_than_20_weeks |
| 36 | Pregnancy outcome | 35 | `pof_delivery_take_place` | radiogroup | yes | missing | 4/4 |  |
| 37 | Pregnancy outcome | 36 | `pof_whose_home` | radiogroup | yes | missing | 3/3 | visibleIf: `{pof_delivery_take_place} = 2` |
| 38 | Pregnancy outcome | 37 | `pof_give_address_free_answer` | text | yes | yes | 0/0 |  |
| 39 | Pregnancy outcome | 38 | `pof_why_didn_t_deliver_health_facility` | radiogroup | yes | missing | 1/2 | visibleIf: `{pof_delivery_take_place} anyof [2,4]` |
| 40 | Pregnancy outcome | 38 | `pof_why_didn_t_deliver_health_facility_2` | radiogroup | yes | missing | 6/7 | visibleIf: `{pof_delivery_take_place} anyof [2,4]` |
| 41 | Pregnancy outcome | 39 | `pof_facility_go_deliver_give_name_address` | text | yes | missing | 0/0 |  |
| 42 | Pregnancy outcome | 40 | `pof_some_health_personnel_check_fetal_heart_rate_upon` | radiogroup | yes | yes | 2/3 |  |
| 43 | Pregnancy outcome | 41 | `pof_fetal_heart_rate_upon_admission` | radiogroup | yes | missing | 0/5 |  |
| 44 | Pregnancy outcome | 42 | `pof_any_complications_during_delivery` | radiogroup | yes | yes | 3/3 | manual: Home-delivery/multi-response branch needs exact source-table cleanup before strict enforcement. |
| 45 | Pregnancy outcome | 43 | `pof_complication_answer_up` | radiogroup | yes | missing | 7/11 |  |
| 46 | Pregnancy outcome | 44 | `pof_assisted_delivery_anyone_else` | radiogroup | yes | missing | 8/12 |  |
| 47 | Pregnancy outcome | 45 | `pof_many_hours_labor_pains_last` | radiogroup | yes | yes | 1/3 |  |
| 48 | Delivery details | 46 | `pof_many_hours_before_delivery_water_break` | radiogroup | yes | yes | 1/3 |  |
| 49 | Delivery details | 47 | `pof_water_break_before_after_delivery_pain_began` | radiogroup | yes | yes | 2/3 |  |
| 50 | Delivery details | 47 | `pof_water_break_before_after_delivery_pain_began_2` | radiogroup | yes | yes | 1/1 |  |
| 51 | Delivery details | 48 | `pof_color_water` | radiogroup | yes | missing | 4/5 |  |
| 52 | Delivery details | 49 | `pof_water_foul_smelling` | radiogroup | yes | missing | 3/3 |  |
| 53 | Delivery details | 50 | `pof_high_fever_during_labor_delivery` | radiogroup | yes | yes | 3/3 |  |
| 54 | Delivery details | 51 | `pof_long_take_deliver_baby_once_started_pushing_twins` | radiogroup | yes | yes | 1/3 |  |
| 55 | Delivery details | 52 | `pof_any_injections_saline_given_mother_before_during_after` | radiogroup | yes | missing | 3/3 |  |
| 56 | Delivery details | 53 | `pof_type_injection_saline_given` | radiogroup | yes | missing | 5/7 |  |
| 57 | Delivery details | 54 | `pof_anything_done_help_baby_come_out` | radiogroup | yes | missing | 10/13 | manual: Home-delivery/multi-response branch needs exact source-table cleanup before strict enforcement. |
| 58 | Delivery details | 55 | `pof_type_injection_given` | radiogroup | yes | missing | 5/10 |  |
| 59 | Delivery details | 56 | `pof_anything_given_orally_after_all_babies_came_out` | radiogroup | yes | missing | 2/2 | manual: Home-delivery/multi-response branch needs exact source-table cleanup before strict enforcement. |
| 60 | Delivery details | 56 | `pof_anything_given_orally_after_all_babies_came_out_2` | radiogroup | yes | missing | 1/1 | manual: Home-delivery/multi-response branch needs exact source-table cleanup before strict enforcement. |
| 61 | Delivery details | 57 | `pof_given` | radiogroup | yes | missing | 5/8 |  |
| 62 | Delivery details | 58 | `pof_placenta_come_out_its_own` | radiogroup | yes | yes | 3/3 | visibleIf: `{pof_placenta_come_out_its_own} = 2` |
| 63 | Delivery details | 59 | `pof_done_help_placenta_come_out` | radiogroup | yes | missing | 8/12 | manual: Home-delivery/multi-response branch needs exact source-table cleanup before strict enforcement. |
| 64 | Delivery details | 60 | `pof_type_injection_given_2` | radiogroup | yes | missing | 5/10 |  |
| 65 | Delivery details | 61 | `pof_long_take_after_birth_placenta_come_out_hh` | text | yes | yes | 0/0 |  |
| 66 | Delivery details | 62 | `pof_entire_placenta_come_out` | radiogroup | yes | yes | 4/4 | manual: Home-delivery/multi-response branch needs exact source-table cleanup before strict enforcement. |
| 67 | Home delivery details | 63 | `pof_any_part_clean_birthing_kit_used_delivery` | radiogroup | yes | missing | 3/3 |  |
| 68 | Home delivery details | 64 | `pof_soap_used_wash_hands_before_delivery_person_delivered` | radiogroup | yes | missing | 2/3 |  |
| 69 | Home delivery details | 65 | `pof_string_used_tie_cord` | radiogroup | yes | missing | 3/3 |  |
| 70 | Home delivery details | 66 | `pof_blade_used_cut_cord` | radiogroup | yes | missing | 3/3 |  |
| 71 | Home delivery details | 67 | `pof_plastic_disc_used_cutting_cord` | radiogroup | yes | missing | 3/3 |  |
| 72 | Home delivery details | 68 | `pof_plastic_sheet_kept_under_woman_during_delivery` | radiogroup | yes | missing | 3/3 |  |

## SBF - Stillbirth Form (13 MAY 2026)

Summary: 6/17 question titles have Hindi; 28/32 choices have Hindi; 0 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Main form | 1 | `sbf_woman_name` | text | yes | yes | 0/0 |  |
| 2 | Main form | 2 | `sbf_husband_name` | text | yes | yes | 0/0 |  |
| 3 | Main form | 3 | `sbf_woman_hh_member_id` | text | yes | missing | 0/0 |  |
| 4 | Main form | 4 | `sbf_woman_permanent_id` | text | yes | missing | 0/0 |  |
| 5 | Main form | 5 | `sbf_pregnancy_id` | text | yes | yes | 0/0 |  |
| 6 | Main form | 6 | `sbf_birth_id` | text | yes | yes | 0/0 |  |
| 7 | Main form | 7 | `sbf_interview_date` | text | yes | yes | 0/0 |  |
| 8 | Main form | 8 | `sbf_interview_take_place` | radiogroup | yes | missing | 3/3 |  |
| 9 | Main form | 9 | `sbf_interviewer_present_during_delivery` | radiogroup | yes | missing | 1/2 |  |
| 10 | Main form | 10 | `sbf_medical_card_birth_available` | radiogroup | yes | yes | 2/2 |  |
| 11 | Main form | 11 | `sbf_stillbirth_determined_antepartum_intrapartum_medical_card` | radiogroup | yes | missing | 4/4 | visibleIf: `{sbf_medical_card_birth_available} = 1` |
| 12 | Main form | 12 | `sbf_information_used_make_determination` | radiogroup | yes | missing | 2/4 | visibleIf: `{sbf_stillbirth_determined_antepartum_intrapartum_medical_card} = 1` |
| 13 | Main form | 13 | `sbf_there_any_bruises_signs_injury_baby_s_body` | radiogroup | yes | missing | 2/3 |  |
| 14 | Main form | 14 | `sbf_baby_s_skin_pulpy_peeling` | radiogroup | yes | missing | 3/3 |  |
| 15 | Main form | 15 | `sbf_baby_foul_smelling` | radiogroup | yes | missing | 3/3 |  |
| 16 | Main form | 16 | `sbf_delivery_time` | radiogroup | yes | missing | 3/3 |  |
| 17 | Main form | 17 | `sbf_abnormalities` | radiogroup | yes | missing | 5/5 | visibleIf: `{sbf_delivery_time} = 1` |

## UF - Ultrasound Form (11 MAY 2026)

Summary: 18/22 question titles have Hindi; 16/27 choices have Hindi; 0 items need manual review.

| Order | Page | Source | SurveyJS name | Type | PDF anchor | Hindi | Choices hi | Logic/manual note |
|---:|---|---|---|---|---|---|---:|---|
| 1 | Main form | 1 | `uf_woman_name` | text | yes | yes | 0/0 |  |
| 2 | Main form | 2 | `uf_husband_name` | text | yes | yes | 0/0 |  |
| 3 | Main form | 3 | `uf_pregnancy_id` | text | yes | yes | 0/0 |  |
| 4 | Main form | 4 | `uf_form_completed_date` | text | yes | yes | 0/0 |  |
| 5 | Main form | 5 | `uf_ultrasound_report_access_location` | radiogroup | yes | missing | 3/3 |  |
| 6 | Main form | 6 | `uf_ultrasound_facility` | text | yes | missing | 0/0 |  |
| 7 | Main form | 7 | `uf_ultrasound_date` | text | yes | yes | 0/0 |  |
| 8 | Main form | 8 | `uf_pregnancy_being_confirmed_ultrasound` | radiogroup | yes | yes | 2/2 | workflow: close_pregnancy_record |
| 9 | Main form | 9 | `uf_ultrasound_type` | radiogroup | yes | missing | 0/3 |  |
| 10 | Main form | 10 | `uf_fetus_count_category` | radiogroup | yes | yes | 1/2 |  |
| 11 | Main form | 11 | `uf_measurement_crown_rump_length_mm` | text | yes | yes | 0/0 |  |
| 12 | Main form | 12 | `uf_measurement_bi_parietal_diameter_mm` | text | yes | yes | 0/0 |  |
| 13 | Main form | 13 | `uf_measurement_nuchal_translucency_mm` | text | yes | yes | 0/0 |  |
| 14 | Main form | 14 | `uf_gestational_age_indicated_ultrasound_report` | radiogroup | yes | yes | 0/2 |  |
| 15 | Main form | 15 | `uf_edd_by_ultrasound` | text | yes | yes | 0/0 |  |
| 16 | Main form | 16 | `uf_organ_status_head_brain` | radiogroup | yes | yes | 2/3 |  |
| 17 | Main form | 17 | `uf_organ_status_heart` | radiogroup | yes | yes | 2/3 |  |
| 18 | Main form | 18 | `uf_organ_status_abdomen` | radiogroup | yes | yes | 2/2 |  |
| 19 | Main form | 18 | `uf_organ_status_abdomen_2` | radiogroup | yes | yes | 0/1 |  |
| 20 | Main form | 19 | `uf_organ_status_extremities` | radiogroup | yes | yes | 2/3 |  |
| 21 | Main form | 20 | `uf_organ_status_placenta` | radiogroup | yes | yes | 2/3 |  |
| 22 | Main form | 21 | `uf_upload_photo_pdf_usg_report_ancy` | file | yes | missing | 0/0 |  |
