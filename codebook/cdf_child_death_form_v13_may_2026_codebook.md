# CDF Codebook: Child Death Form

- Version: 13 MAY 2026
- Source PDF: Refs/pretsing forms/child_death_form_v2026.05.13.pdf
- Generated from: `outputs/pretsing-form-json/child_death_form_v2026.05.13.json`
- CSV: `cdf_child_death_form_v13_may_2026_codebook.csv`
- Variables/rows: 25

Notes: repeated roster/panel fields are listed with `panel_path` and `repeat_context`. Labels, instructions, choices, relevance, validation, and appearance are kept in separate columns.

## Main form

| Order | Code | Source code | Label | Type | Options | Relevance | Validation | Appearance |
|---:|---|---|---|---|---|---|---|---|
| 1 | cdf_woman_name | 1 | Name of woman<br><small>Hindi: महिला का नाम</small> | text |  |  |  | {"render_as":"input"} |
| 2 | cdf_husband_name | 2 | Name of husband<br><small>Hindi: पति का नाम</small> | text |  |  |  | {"render_as":"input"} |
| 3 | cdf_woman_hh_member_id | 3 | Woman's HH member ID automatically filled<br><small>Hindi: Woman's HH member ID automatically filled</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 4 | cdf_woman_permanent_id | 4 | Woman's permanent ID automatically filled<br><small>Hindi: Woman's permanent ID automatically filled</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 5 | cdf_pregnancy_id | 5 | Pregnancy ID automatically filled<br><small>Hindi: गर्भावस्था आईडी स्वतः भर जाती है</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 6 | cdf_birth_id | 6 | Birth ID Automatically filled from birth assessment form<br><small>Hindi: जन्म मूल्यांकन फॉर्म से जन्म आईडी स्वचालित रूप से भरी जाती है</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 7 | cdf_through_project_tool_death_detected | 7 | Through which project tool was the death detected?<br><small>Hindi: Through which project tool was the death detected?</small> | radiogroup | 1: Birth assessement form; 2: Newborn follow-up form, in person; 2: Newborn follow-up form, telephonic; 3: Other, specify_____ |  | ["single coded option"] | {"render_as":"radio","readonly":true} \| readOnly=True |
| 7.1 | cdf_through_project_tool_death_detected_other_specify | 7_3_specify | Specify other response<br><small>Instruction: Complete only if Other, specify_____ is selected.</small><br><small>Hindi: अन्य उत्तर निर्दिष्ट करें</small> | text |  | {cdf_through_project_tool_death_detected} = 3 | [{"type":"text","minLength":1,"maxLength":120,"text":{"default":"Specify the other response.","hi":"अन्य उत्तर निर्दिष्ट करें।","kn":"","mr":"","ta":"","te":"","ur":""}}] | {"render_as":"input"} |
| 8 | cdf_interview_take_place | 8 | Where did the interview take place?<br><small>Hindi: Where did the interview take place?</small> | radiogroup | 1: At the mother's home; 2: Telephonic Only applicable for mothers staying outside catchment area at time of death of child |  | ["single coded option"] | {"render_as":"radio"} |
| 9 | cdf_interview_date | 9 | Date form was completed mm/dd/yyyy<br><small>Hindi: दिनांक फॉर्म पूरा होने की तिथि mm/dd/yyyy है</small> | text |  |  | ["mm/dd/yyyy"] | {"render_as":"date_picker"} \| inputType=date |
| 10 | cdf_respondent | 10 | Who is the respondent?<br><small>Hindi: Who is the respondent?</small> | radiogroup | 1: mother of deceased child; 2: father of deceased child; 3: other, specify___ |  | ["single coded option"] | {"render_as":"radio"} |
| 10.1 | cdf_respondent_other_specify | 10_3_specify | Specify other response<br><small>Instruction: Complete only if other, specify___ is selected.</small><br><small>Hindi: अन्य उत्तर निर्दिष्ट करें</small> | text |  | {cdf_respondent} = 3 | [{"type":"text","minLength":1,"maxLength":120,"text":{"default":"Specify the other response.","hi":"अन्य उत्तर निर्दिष्ट करें।","kn":"","mr":"","ta":"","te":"","ur":""}}] | {"render_as":"input"} |
| 11 | cdf_death_date | 11 | Date of death dd/mm/yyyy<br><small>Hindi: मृत्यु की तारीख dd/mm/yyyy</small> | text |  |  | ["dd/mm/yyyy"] | {"render_as":"date_picker"} \| inputType=date |
| 12 | cdf_death_time | 12 | Time of death HH:MM<br><small>Hindi: Time of death HH:MM</small> | text |  |  | ["HH:MM"] | {"render_as":"time_input"} \| inputType=time |
| 13 | cdf_child_die | 13 | Where did the child die?<br><small>Hindi: Where did the child die?</small> | radiogroup | 1: home; 2: facility; 3: in transit to facility; 4: Other, specify______ |  | ["single coded option"] | {"render_as":"radio"} |
| 13.1 | cdf_child_die_other_specify | 13_4_specify | Specify other response<br><small>Instruction: Complete only if Other, specify______ is selected.</small><br><small>Hindi: अन्य उत्तर निर्दिष्ट करें</small> | text |  | {cdf_child_die} = 4 | [{"type":"text","minLength":1,"maxLength":120,"text":{"default":"Specify the other response.","hi":"अन्य उत्तर निर्दिष्ट करें।","kn":"","mr":"","ta":"","te":"","ur":""}}] | {"render_as":"input"} |
| 14 | cdf_facility_he_she_die_free_answer | 14 | At what facility did he/she die? _______ free answer<br><small>Hindi: उसकी मृत्यु किस सुविधा में हुई? _______ निःशुल्क उत्तर</small> | text |  | {cdf_child_die} = 2 |  | {"render_as":"input"} |
| 15 | cdf_death_registered_civil_registration_system | 15 | Was the death registered with the civil registration system?<br><small>Hindi: Was the death registered with the civil registration system?</small> | radiogroup | 1: Yes; 2: No; 9: Don't know |  | ["single coded option"] | {"render_as":"radio"} |
| 16 | cdf_only_q13_q15 | 16 | ONLY IF Q13=1 OR Q15=1:<br><small>Hindi: केवल यदि Q13=1 या Q15=1:</small> | radiogroup | 1: Yes Ask to show death certificate Is the hospital record or death certificate available?; 2: No; 3: Don't know | {cdf_child_die} = 1 or {cdf_death_registered_civil_registration_system} = 1 | ["single coded option"] | {"render_as":"radio"} |
| 17 | cdf_underlying_cause_death_indicated_certificate_free_answer_write | 17 | What is the underlying cause of death indicated on the certificate? _______ free answer Write "stillbirth" if record indicates stillbirth<br><small>Hindi: What is the underlying cause of death indicated on the certificate? _______ free answer Write "stillbirth" if record indicates stillbirth</small> | text |  | {cdf_only_q13_q15} = 1 |  | {"render_as":"input"} |
| 18 | cdf_contributing_cause_death_free_answer | 18 | What are the contributing cause(s) of death? _______ free answer<br><small>Hindi: What are the contributing cause(s) of death? _______ free answer</small> | text |  | {cdf_only_q13_q15} = 1 |  | {"render_as":"input"} |
| 19 | cdf_only_respondent_not_mother_q10 | 19 | ONLY IF RESPONDENT IS NOT THE MOTHER (Q10=2 or<br><small>Hindi: केवल यदि प्रतिवादी माँ नहीं है (Q10=2 या</small> | radiogroup | 3: 1 Yes Is the mother still alive?; 2: No; 9: Don't know | {cdf_respondent} != 1 | ["single coded option"] | {"render_as":"radio"} |
| 20 | cdf_mother_die_during_after_delivery | 20 | Did the mother die during or after delivery?<br><small>Hindi: क्या माँ की मृत्यु प्रसव के दौरान या उसके बाद हुई?</small> | radiogroup | 1: During delivery; 2: After delivery; 9: Don't know |  | ["single coded option"] | {"render_as":"radio"} |
| 21 | cdf_long_after_delivery_mother_die_days_end_interview | 21 | How long after the delivery did the mother die?<br><small>Hindi: प्रसव के कितने समय बाद माँ की मृत्यु हुई?</small> | text |  | {cdf_mother_die_during_after_delivery} = 2 | [{"type":"numeric"}] \| ["00-90 days"] | {"render_as":"fixed_width_numeric_boxes"} \| inputType=number |
| 22 | cdf_long_after_delivery_mother_die | 21 | How long after the delivery did the mother die?<br><small>Instruction: Record days after delivery. Use 91 for more than 90 days; 99 for don't know.</small><br><small>Hindi: How long after the delivery did the mother die?</small> | text |  |  | [{"type":"numeric","minValue":0,"maxValue":99}] \| ["Record days after delivery. Use 91 for more than 90 days; 99 for don't know."] | {"render_as":"numeric_textbox"} \| inputType=number |

