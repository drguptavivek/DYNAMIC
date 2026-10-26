import { GROUPED_CHOICE_TEXT, GROUPED_CHOICE_TEXT_KEYS } from "./groupedChoiceText.js";
import { NATIVE_FORM_POPUP_TEXT } from "./nativeFormPopupText.js";
import { NATIVE_FORM_DIALOG_TEXT } from "./nativeFormDialogText.js";
import { NATIVE_FORM_TEXT_EXTRA, NATIVE_IMAGE_FORM_TEXT, NATIVE_ANC_IMAGE_FORM_TEXT } from "./nativeFormTextExtra.js";

export const LMP_TIMING_FIELDS = {
  WQ: "wq_02_reproduction_when_did_your_last_menstrual_period_start",
  PEF: "pef_lmp_start",
  PSF: "psf_last_menstrual_period",
};
export const LMP_TIMING_TEXT = {
  date: "Date",
  relative: "Relative time",
  days: "Days Ago",
  weeks: "Weeks Ago",
  months: "Months Ago",
  years: "Years Ago",
  day: "DD",
  month: "MM",
  year: "YYYY",
  relative_value: "Two digit relative time",
};
/** Questionnaire content rendered by native widgets outside SurveyJS JSON. */
export const NATIVE_FORM_TEXT = {
  "PEF": {
    ...NATIVE_IMAGE_FORM_TEXT,
    ...NATIVE_ANC_IMAGE_FORM_TEXT,
    "duration_unit": "Duration unit",
    "pregnancy_duration": "Pregnancy duration",
    "weeks": "Weeks",
    "months": "Months",
    "select_weeks_or_months": "Select weeks or months"
  },
  "PFF": { ...NATIVE_IMAGE_FORM_TEXT, ...NATIVE_ANC_IMAGE_FORM_TEXT },
  "WQ": {
    "entry_years": "Years",
    "wq_alcohol_days_entry": "Days",
    "wq_alcohol_drinks_entry": "Drinks",
    "wq_pregnancy_lmp_minimum_days": "When currently pregnant, the last menstrual period must be at least 28 days before the interview date.",
    "wq_pregnancy_lmp_invalid": "Enter a complete valid last menstrual period date or relative time.",
    "transfusion_month": "Month (MM)",
    "transfusion_year": "Year (YYYY)",
    "transfusion_date_invalid": "Enter a valid month and four-digit year, or select Do not remember.",
    "transfusion_date_future": "The last transfusion cannot be later than the interview month.",
    "earlier_summary": "Earlier summary",
    "detailed_history": "Detailed history",
    "total": "Total",
    "highlighted_detailed_totals_do_not_match_the_corresponding_earlier_answer": "Highlighted detailed totals do not match the corresponding earlier answer.",
    "detailed_birth_history_has_less_births_miscarriages_etc_than_what_was_initially_told_maybe_some_preg": "Detailed birth History has less births, miscarriages etc than what was initially told. Maybe some pregnancies/births have been missed in detailed history? Lets Reverify.",
    "go_to_q3": "Go to Q3",
    "go_to_q14": "Go to Q14",
    "option_1_enter_dd_mm_yyyy": "Option 1: Enter DD / MM / YYYY",
    "option_2_enter_mm_yyyy": "Option 2: Enter MM / YYYY",
    "option_3_enter_yyyy": "Option 3: Enter YYYY",
    "don_t_know_dob": "Don't know DOB",
    "don_t_know_mm_yy": "Don't know MM/YY",
    "don_t_know_anything": "Don't know anything",
    "pregnancy_entry": "Pregnancy entry",
    "s_no": "S.No.",
    "born_status": "Born status",
    "name_of_child": "Name of child",
    "sex": "Sex",
    "pregnancy_lasts": "Pregnancy lasts",
    "close_pregnancy_entry": "Close pregnancy entry",
    "comparison_living_left": "Q3a + Q3b\nSons/daughters living with you",
    "comparison_living_right": "Born Alive + Q24 Yes + Q26 Yes",
    "comparison_elsewhere_left": "Q5a + Q5b\nAlive, not living with you",
    "comparison_elsewhere_right": "Born Alive + Q24 Yes + Q26 No",
    "comparison_died_left": "Q7a + Q7b\nBoys/girls died",
    "comparison_died_right": "Born Alive + Q24 No",
    "comparison_losses_left": "Q11\nAbortions/stillbirths/miscarriages",
    "comparison_losses_right": "Born Dead + Miscarriage + Abortion",
    "reproduction_intro": "Now I would like to ask about all the births you have had during your life.",
    "visitor_outcome_message": "This women is Excluded From study",
    "duration_unit": "Duration unit",
    "pregnancy_duration": "Pregnancy duration",
    "weeks": "Weeks",
    "months": "Months",
    "select_weeks_or_months": "Select weeks or months",
    "no_household_members_available_on_this_device": "No household members available on this device.",
    "select_household_member": "Select household member",
    "close": "Close",
    "type_the_husband_s_or_partner_s_name": "Type the husband's or partner's name",
    "select_member": "Select member",
    "were_there_any_other_pregnancies_before_pregnancy_1": "Were there any other pregnancies before Pregnancy 1?",
    "were_there_any_other_pregnancies_between_pregnancy_previousnumber_and_pregnancy_nextnumber": "Were there any other pregnancies between Pregnancy {previousNumber} and Pregnancy {nextNumber}?",
    "pregnancy_pregnancynumber": "Pregnancy {pregnancyNumber}",
    "count_weeks": "{count} weeks",
    "count_months": "{count} months",
    "born_alive": "Born Alive",
    "born_dead": "Born Dead",
    "miscarriage": "Miscarriage",
    "abortion": "Abortion",
    "add_pregnancy_outcome": "Add pregnancy outcome",
    "update_child_childnumber": "Update child {childNumber}",
    "add_child_childnumber": "Add child {childNumber}",
    "move_pregnancy_pregnancynumber_earlier": "Move pregnancy {pregnancyNumber} earlier",
    "move_pregnancy_pregnancynumber_later": "Move pregnancy {pregnancyNumber} later",
    "pregnancy_entry_count": "{pregnancyCount} pregnancies, {outcomeCount} babies/outcomes",
    "pregnancy_pregnancynumber_baby_childnumber_of_childcount": "Pregnancy {pregnancyNumber} - Baby {childNumber} of {childCount}",
    "bwq_locality_duration": "How long have you been living continuously in {localityName}?\nIf less than one year, record 00 years",
    "bwq_dob": "What is your date of birth?",
    "bwq_pregnancy_outcome_review": "PREGNANCY OUTCOME",
    "bwq_baby_birth_date": "On what day, month, and year was {childName} born?",
    "bwq_pregnancy_end_date": "On what day, month, and year did this pregnancy end?",
    "bwq_child_last_birthday": "How old was {childName} at {possessive} last birthday?",
    "bwq_child_death_age": "How old was {childName} when {pronoun} died?",
    "bwq_first_pregnancy_type": "Think back to your first pregnancy. Was that a single pregnancy, twins, or triplets?",
    "bwq_next_pregnancy_type": "Think back to your next pregnancy. Was that a single pregnancy, twins, or triplets?",
    "bwq_singleton_outcome": "Was the baby born alive, born dead, or did you have a miscarriage or abortion?",
    "bwq_first_baby_outcome": "Was the first baby in this pregnancy born alive or born dead?",
    "bwq_next_baby_outcome": "Was the next baby in this pregnancy born alive or born dead?",
    "bwq_husband_occupation_present": "What is your (last) husband's occupation? That is, what kind of work does he mainly do?",
    "bwq_husband_occupation_past": "What was your (last) husband's occupation. That is, what kind of work did he mainly do?",
    "bwq_child_pronoun_male": "he",
    "bwq_child_pronoun_female": "she",
    "bwq_child_possessive_male": "his",
    "bwq_child_possessive_female": "her",
    "bwq_child_fallback": "the child",
    "bwq_child_pronoun_unknown": "they",
    "bwq_child_possessive_unknown": "their"
  },
  "HHQ": {
    "entry_years": "Years",
    ...GROUPED_CHOICE_TEXT,
    "bhq_member_summary_heading": "02B-Household Member Summary",
    "bhq_member_summary_one": "{count} member added. Confirm name, age, and sex before check listing.",
    "bhq_member_summary_many": "{count} members added. Confirm name, age, and sex before check listing.",
    "bhq_summary_count": "Count",
    "bhq_summary_name": "Name",
    "bhq_summary_age": "Age",
    "bhq_summary_sex": "Sex",
    "bhq_check_listing_heading": "CHECK LISTING",
    "bhq_check_listing_intro": "Just to make sure that I have a complete household listing.",
    "bhq_check_listing_a": "A) Are there any other persons such as small children or infants that we have not listed?",
    "bhq_check_listing_b": "B) Are there other people who may not be members of your family such as domestic servants, lodgers or friends who usually live here?",
    "bhq_yes_add_member": "Yes, add member",
    "bhq_no": "No",
    "bhq_no_go_section_3": "No, go to Section 3",
    "bhq_edit_roster": "Edit roster",
    "bhq_confirm_roster_before_section_03": "Confirm the household roster before Section 03.",
    "bhq_roster_confirmed": "Household roster confirmed.",
    "bhq_add_member_required": "Add at least one household member before continuing.",
    "bhq_add_missing_child": "Add the missing small child or infant, then review the listing again.",
    "bhq_add_other_resident": "Add the other usual resident, then review the listing again.",
    "bhq_complete_roster_fields": "Complete the highlighted household roster fields before confirming.",
    "not_captured": "Not captured",
    "capture_gps": "Capture GPS",
    "gps_capturing": "Capturing GPS...",
    "gps_checking_services": "Checking device Location/GPS...",
    "gps_precise_location_required": "Enable Precise location for this app in device Settings > Apps > DYNAMIC Field App > Permissions > Location, then try again.",
    "requesting_location_permission": "Requesting location permission...",
    "location_permission_was_not_granted": "Location permission was not granted.",
    "gps_captured_from_this_device": "GPS captured from this device.",
    "gps_latitude": "Latitude",
    "gps_longitude": "Longitude",
    "gps_waiting_for_accuracy": "Finding your location. Stand outdoors with a clear view of the sky. Internet is not required.",
    "gps_services_disabled": "Turn on device Location/GPS, then try again. Internet is not required.",
    "gps_timeout": "Location could not be captured. Move outdoors and try again. Any saved location has been kept.",
    "gps_capture_failed": "GPS capture failed. Check device Location/GPS and try again. Any saved location has been kept.",
    "gps_capture_cancelled": "GPS capture cancelled. Any saved location has been kept.",
    "gps_cancel_capture": "Cancel GPS capture",
    "gps_open_google_maps": "Open in Google Maps",
    "gps_maps_unavailable": "Could not open Google Maps on this device.",
    "bhq_member": "BHQ member",
    "find_hdss_person": "Find HDSS person",
    "select_one_record_to_link_this_person": "Select one record to link this person.",
    "village_code": "Village code",
    "house_number": "House number",
    "name_of_individual_or_hdss_original_id": "Name of individual or HDSS original ID",
    "village_must_match_exactly_clear_the_house_number_for_name_only_search_comma_separated_names_find_ho": "Village must match exactly. Clear the house number for name-only search. Comma-separated names find households containing all names.",
    "hdss_people": "HDSS people",
    "searching": "Searching…",
    "no_hdss_people_match_these_filters": "No HDSS people match these filters.",
    "search_by_name_instead": "Search by name instead",
    "enter_a_village_code_and_either_a_house_number_or_name": "Enter a village code and either a house number or name.",
    "loading_more": "Loading more…",
    "close_hdss_lookup": "Close HDSS lookup",
    "hdss_village_code": "HDSS village code",
    "required": "Required",
    "hdss_house_number": "HDSS house number",
    "or_search_by_name": "Or search by name",
    "search_hdss_name_or_original_id": "Search HDSS name or original ID",
    "name_or_name_name": "Name, or name,name",
    "linked": "Linked",
    "select": "Select",
    "lookup": "Lookup",
    "replace_linked_hdss_person": "Replace linked HDSS person",
    "unlink_hdss_person": "Unlink HDSS person",
    "household_characteristics_intro": "Now I would like to ask some questions about household environment, household amenities and possessions.",
    "confirm_household_membership": "Confirm household membership",
    "visitor": "VISITOR",
    "member": "MEMBER",
    "confirm_mobile_number": "Confirm mobile number",
    "bhq_visitor_confirmation": "Are you sure this person is a visitor? Confirm and check: is this person a visitor or a member of this household?",
    "mobile_confirmation": "Read this mobile number to the Respondent and confirm whether the number is correct or not.",
  },
  "UF": {
    "choose_file": "Choose file",
    "no_file_selected": "No file selected"
  }
};

export const NATIVE_QUESTION_TITLE_OVERRIDES = {
  "wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously": "How long have you been living continuously in {localityName}?\nIf less than one year, record 00 years",
  "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born": "What is your date of birth?",
  "pregnancy_02_reproduction_check_16_17_and_21_if_16_i_1_or_17_i_1_the": "PREGNANCY OUTCOME",
  "pregnancy_02_reproduction_check_16_and_17_type_of_pregnancy_outcome": "On what day, month, and year was {childName} born?",
  "pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b": "How old was {childName} at {possessive} last birthday?",
  "pregnancy_02_reproduction_if_born_alive_and_now_dead_if_19_i_1_boy_h": "How old was {childName} when {pronoun} died?",
  "pregnancy_02_reproduction_if_i_1_think_back_to_your_first_pregnancy": "Think back to your first pregnancy. Was that a single pregnancy, twins, or triplets?",
  "pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor": "Was the baby born alive, born dead, or did you have a miscarriage or abortion?",
  "wq_04_husband_s_backgroun_if_1_1_currently_married_what_is_your_last": "What is your (last) husband's occupation? That is, what kind of work does he mainly do?"
};

export const NATIVE_QUESTION_TITLE_KEYS = {
  "member_highest_grade_completed": ["entry_years"],
  "wq_01_respondent_s_backgr_what_is_the_highest_grade_you_completed": ["entry_years"],
  "hhq_household_members": [
    "bhq_member_summary_heading", "bhq_member_summary_one", "bhq_member_summary_many",
    "bhq_summary_count", "bhq_summary_name", "bhq_summary_age", "bhq_summary_sex",
    "bhq_check_listing_heading", "bhq_check_listing_intro", "bhq_check_listing_a", "bhq_check_listing_b",
    "bhq_yes_add_member", "bhq_no", "bhq_no_go_section_3", "bhq_edit_roster",
  ],
  "wq_03_other_health_issues_during_the_last_one_month_on_how_many_days": ["wq_alcohol_days_entry"],
  "wq_03_other_health_issues_we_count_one_drink_of_alcohol_as_one_can_o": ["wq_alcohol_drinks_entry"],
  ...GROUPED_CHOICE_TEXT_KEYS,
  ...Object.fromEntries(Object.values(LMP_TIMING_FIELDS).map(name =>
    [name, Object.keys(LMP_TIMING_TEXT).map(key => `${name}_${key}`)])),
  [LMP_TIMING_FIELDS.WQ]: [
    ...Object.keys(LMP_TIMING_TEXT).map(key => `${LMP_TIMING_FIELDS.WQ}_${key}`),
    "wq_pregnancy_lmp_minimum_days",
    "wq_pregnancy_lmp_invalid",
  ],
  "wq_01_respondent_s_backgr_how_long_have_you_been_living_continuously": [
    "bwq_locality_duration"
  ],
  "wq_01_respondent_s_backgr_in_what_month_and_year_were_you_born": [
    "bwq_dob"
  ],
  "pregnancy_02_reproduction_check_16_17_and_21_if_16_i_1_or_17_i_1_the": [
    "bwq_pregnancy_outcome_review"
  ],
  "pregnancy_02_reproduction_check_16_and_17_type_of_pregnancy_outcome": [
    "bwq_baby_birth_date",
    "bwq_pregnancy_end_date"
  ],
  "pregnancy_02_reproduction_if_born_alive_and_still_living_if_18_i_1_b": [
    "bwq_child_last_birthday"
  ],
  "pregnancy_02_reproduction_if_born_alive_and_now_dead_if_19_i_1_boy_h": [
    "bwq_child_death_age"
  ],
  "pregnancy_02_reproduction_if_i_1_think_back_to_your_first_pregnancy": [
    "bwq_first_pregnancy_type",
    "bwq_next_pregnancy_type"
  ],
  "pregnancy_02_reproduction_if_15_i_single_was_the_baby_born_alive_bor": [
    "bwq_singleton_outcome",
    "bwq_first_baby_outcome",
    "bwq_next_baby_outcome"
  ],
  "wq_04_husband_s_backgroun_if_1_1_currently_married_what_is_your_last": [
    "bwq_husband_occupation_present",
    "bwq_husband_occupation_past"
  ]
};

for (const [code, name] of Object.entries(LMP_TIMING_FIELDS)) {
  NATIVE_FORM_TEXT[code] = { ...NATIVE_FORM_TEXT[code],
    ...Object.fromEntries(Object.entries(LMP_TIMING_TEXT).map(([key, text]) => [`${name}_${key}`, text])),
  };
}

// These controls render only in the three questionnaires with generic repeat panels.
const repeatedEntryText = {
  "preview_row": NATIVE_FORM_DIALOG_TEXT.preview_row,
  "close_entry_editor": "Close entry editor",
  "add_entry": "Add entry",
  "update_entry": "Update entry",
  "entry_entrynumber": "Entry {entryNumber}",
  "add_row": "Add row",
  "panel_entry_count": "{entryCount} entries added",
  "new_entry": "New entry",
  "edit_entry_entrynumber": "Edit entry {entryNumber}",
};
for (const code of ["HHQ", "WQ", "HRF"]) {
  NATIVE_FORM_TEXT[code] = { ...NATIVE_FORM_TEXT[code], ...repeatedEntryText };
}

for (const [code, texts] of Object.entries(NATIVE_FORM_TEXT_EXTRA)) {
  NATIVE_FORM_TEXT[code] = { ...NATIVE_FORM_TEXT[code], ...texts };
}

const sectionDialogText = Object.fromEntries(Object.entries(NATIVE_FORM_DIALOG_TEXT).filter(([key]) => key !== "preview_row"));
for (const [code, texts] of Object.entries(NATIVE_FORM_POPUP_TEXT)) {
  NATIVE_FORM_TEXT[code] = { ...sectionDialogText, ...texts, ...NATIVE_FORM_TEXT[code] };
}

export function getNativeFormText(surveyOrForm, key, fallback = "", locale) {
  const source = surveyOrForm?.survey || surveyOrForm;
  const value = source?.nativeText?.[key];
  const activeLocale = locale || source?.locale || "default";
  if (typeof value === "string") return fallback || value;
  if (!value || typeof value !== "object") return fallback;
  if (activeLocale === "default" || activeLocale === "en") {
    return (typeof value.en === "string" && value.en.trim() ? value.en : "") || fallback || value.default || "";
  }
  const translated = value[activeLocale];
  return (typeof translated === "string" && translated.trim() ? translated : "") || fallback || value.default || value.en || "";
}

export function formatNativeFormText(surveyOrForm, key, fallback, values, locale) {
  return getNativeFormText(surveyOrForm, key, fallback, locale).replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,
    (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
}
