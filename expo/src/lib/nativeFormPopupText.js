/** Native alert content; keys are shared with the questionnaire translation inventory. */
const common = {
  popup_draft_saved: "Form saved as draft.",
  popup_ok: "OK",
};
const finalSubmission = {
  popup_final_submission: "Final submission",
  popup_final_submission_confirmation: "Are you sure you want to final submit this form?",
  popup_form_submitted: "Form is submitted",
  popup_yes: "Yes",
  popup_no: "No",
};
const questionnaireSubmission = {
  popup_unable_to_save: "Unable to save form",
  popup_finalization_failed: "The form could not be finalized.",
};

// Saved per-form translations override these defaults, including English edits.
export const FINAL_SUBMISSION_POPUP_TRANSLATIONS = {
  hi: {
    popup_final_submission: "अंतिम सबमिशन",
    popup_final_submission_confirmation: "क्या आप वाकई इस फॉर्म को अंतिम रूप से जमा करना चाहते हैं?",
    popup_form_submitted: "फॉर्म जमा हो गया है।",
    popup_yes: "हाँ", popup_no: "नहीं", popup_ok: "ठीक है",
  },
  kn: {
    popup_final_submission: "ಅಂತಿಮ ಸಲ್ಲಿಕೆ",
    popup_final_submission_confirmation: "ನೀವು ಈ ಫಾರ್ಮ್ ಅನ್ನು ಅಂತಿಮವಾಗಿ ಸಲ್ಲಿಸಲು ಖಚಿತವಾಗಿದ್ದೀರಾ?",
    popup_form_submitted: "ಫಾರ್ಮ್ ಸಲ್ಲಿಸಲಾಗಿದೆ.",
    popup_yes: "ಹೌದು", popup_no: "ಇಲ್ಲ", popup_ok: "ಸರಿ",
  },
  mr: {
    popup_final_submission: "अंतिम सादरीकरण",
    popup_final_submission_confirmation: "तुम्हाला हा फॉर्म अंतिम स्वरूपात सादर करायचा आहे याची खात्री आहे का?",
    popup_form_submitted: "फॉर्म सादर झाला आहे.",
    popup_yes: "होय", popup_no: "नाही", popup_ok: "ठीक आहे",
  },
  ta: {
    popup_final_submission: "இறுதிச் சமர்ப்பிப்பு",
    popup_final_submission_confirmation: "இந்தப் படிவத்தை இறுதியாகச் சமர்ப்பிக்க விரும்புகிறீர்களா?",
    popup_form_submitted: "படிவம் சமர்ப்பிக்கப்பட்டது.",
    popup_yes: "ஆம்", popup_no: "இல்லை", popup_ok: "சரி",
  },
  te: {
    popup_final_submission: "తుది సమర్పణ",
    popup_final_submission_confirmation: "మీరు ఈ ఫారమ్‌ను తుదిగా సమర్పించాలనుకుంటున్నారా?",
    popup_form_submitted: "ఫారమ్ సమర్పించబడింది.",
    popup_yes: "అవును", popup_no: "కాదు", popup_ok: "సరే",
  },
};
const womanCorrection = {
  popup_correction_period_ended: "Correction period ended",
  popup_correction_draft_failed: "The correction draft could not be saved.",
  popup_yes: "Yes",
  popup_no: "No",
};
const household = {
  popup_revisit_needed: "Revisit Needed-fill the form again",
  popup_household_excluded: "This household is excluded from the study",
  confirm_household_membership: "Confirm household membership",
  bhq_visitor_confirmation: "Are you sure this person is a visitor? Confirm and check: is this person a visitor or a member of this household?",
  visitor: "VISITOR",
  member: "MEMBER",
};
const mobile = {
  confirm_mobile_number: "Confirm mobile number",
  mobile_confirmation: "Read this mobile number to the Respondent and confirm whether the number is correct or not.",
};
const woman = {
  popup_visitor_title: "Are you Really a Visitor ?",
  popup_visitor_message: "If yes you will be excluded from this study.",
  popup_history_totals_title: "Reproductive history totals do not match",
  popup_history_totals_message: "The detailed-history total is lower than the earlier-summary total. Reverify Q3 or Q14 before continuing.",
  popup_children_incomplete_title: "Born Alive child details incomplete",
  popup_children_incomplete_message: "Add and save Q24_i-Q28_i for every child shown as Born Alive before continuing.",
  popup_woman_excluded: "This women is excluded from the study",
  popup_rescheduled: "Reschedule has been setup",
  confirm_child_age: "Confirm child age",
  if_the_child_celebrated_fifth_birthday: "If the child celebrated fifth birthday?",
  if_the_child_celebrated_first_birthday: "If the child celebrated first birthday?",
  delete_child_details: "Delete child details?",
  clear_the_saved_q24_i_q28_i_details_for_name: "Clear the saved Q24_i-Q28_i details for {name}?",
};
export const NATIVE_FORM_POPUP_TEXT = Object.fromEntries(
  ["HHQ", "WQ", "HRF", "PEF", "UF", "PFF", "POF", "BAF", "SBF", "NFF", "CDF", "PSF"]
    .map((code) => [code, { ...common, ...finalSubmission }]),
);
for (const code of Object.keys(NATIVE_FORM_POPUP_TEXT).filter(code => code !== "HHQ")) {
  Object.assign(NATIVE_FORM_POPUP_TEXT[code], questionnaireSubmission);
}
Object.assign(NATIVE_FORM_POPUP_TEXT.HHQ, household, mobile, {
  popup_answer_fields_saved: "{count} answer fields saved on this device.",
});
Object.assign(NATIVE_FORM_POPUP_TEXT.WQ, womanCorrection, woman, mobile, {
  popup_partner_mobile_confirmation: "Please read the mobile number to Respondent and confirm that the number is correct or not.",
});
Object.assign(NATIVE_FORM_POPUP_TEXT.PEF, {
  popup_database_search_title: "Database search required",
  popup_database_search_message: "Conduct search procedure in the database to locate women in the database.",
});
Object.assign(NATIVE_FORM_POPUP_TEXT.PFF, { popup_fill_pof: "Fill pregnancy outcome form." });
Object.assign(NATIVE_FORM_POPUP_TEXT.PSF, {
  popup_woman_exited: "Thank you. This woman has exited from the study.",
  popup_pef_generated: "PEF form generated for this woman.",
  popup_psf_rescheduled: "PSF rescheduled.",
});
