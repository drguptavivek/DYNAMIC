# SBF Codebook: Stillbirth Form

- Version: 13 MAY 2026
- Source PDF: Refs/pretsing forms/stillbirth_form_v2026.05.13.pdf
- Generated from: `outputs/pretsing-form-json/stillbirth_form_v2026.05.13.json`
- CSV: `sbf_stillbirth_form_v13_may_2026_codebook.csv`
- Variables/rows: 18

Notes: repeated roster/panel fields are listed with `panel_path` and `repeat_context`. Labels, instructions, choices, relevance, validation, and appearance are kept in separate columns.

## Main form

| Order | Code | Source code | Label | Type | Options | Relevance | Validation | Appearance |
|---:|---|---|---|---|---|---|---|---|
| 1 | sbf_woman_name | 1 | Name of woman Automatically filled from pregnancy outcome form<br><small>Hindi: गर्भावस्था परिणाम फॉर्म से महिला का नाम स्वतः भर जाता है</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 2 | sbf_husband_name | 2 | Name of husband Automatically filled from pregnancy outcome form<br><small>Hindi: गर्भावस्था परिणाम फॉर्म से पति का नाम स्वतः भर जाता है</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 3 | sbf_woman_hh_member_id | 3 | Woman's HH member ID automatically filled<br><small>Hindi: Woman's HH member ID automatically filled</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 4 | sbf_woman_permanent_id | 4 | Woman's permanent ID automatically filled<br><small>Hindi: Woman's permanent ID automatically filled</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 5 | sbf_pregnancy_id | 5 | Pregnancy ID automatically filled<br><small>Hindi: गर्भावस्था आईडी स्वतः भर जाती है</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 6 | sbf_birth_id | 6 | Birth ID Automatically filled from birth assessment form<br><small>Hindi: जन्म मूल्यांकन फॉर्म से जन्म आईडी स्वचालित रूप से भरी जाती है</small> | text |  |  |  | {"render_as":"input","readonly":true} \| readOnly=True |
| 7 | sbf_interview_date | 7 | Date form was completed mm/dd/yyyy Automatically filled from pregnancy outcome form<br><small>Hindi: दिनांक फॉर्म पूरा हो गया mm/dd/yyyy गर्भावस्था परिणाम फॉर्म से स्वचालित रूप से भरा गया</small> | text |  |  | ["mm/dd/yyyy"] | {"render_as":"date_picker","readonly":true} \| inputType=date \| readOnly=True |
| 8 | sbf_interview_take_place | 8 | Where did the interview take place?<br><small>Hindi: Where did the interview take place?</small> | radiogroup | 1: At the woman's home from pregnancy outcome form; 2: At health facility; 3: Telephonic |  | ["single coded option"] | {"render_as":"radio","readonly":true} \| readOnly=True |
| 9 | sbf_interviewer_present_during_delivery | 9 | Was the interviewer present during the delivery?<br><small>Hindi: Was the interviewer present during the delivery?</small> | radiogroup | 1: Yes from pregnancy outcome form; 2: No |  | ["single coded option"] | {"render_as":"radio","readonly":true} \| readOnly=True |
| 10 | sbf_medical_card_birth_available | 10 | Is the medical card for this birth available?<br><small>Hindi: क्या इस जन्म के लिए मेडिकल कार्ड उपलब्ध है?</small> | radiogroup | 1: Yes; 2: No |  | ["single coded option"] | {"render_as":"radio"} |
| 11 | sbf_stillbirth_determined_antepartum_intrapartum_medical_card | 11 | Was the stillbirth determined as antepartum or intrapartum in the medical card?<br><small>Hindi: Was the stillbirth determined as antepartum or intrapartum in the medical card?</small> | radiogroup | 1: Antepartum; 2: Intrapartum; 3: Not indicated on medical card; 4: Medical card indicates neonatal death | {sbf_medical_card_birth_available} = 1 | ["single coded option"] | {"render_as":"radio"} |
| 12 | sbf_information_used_make_determination | 12 | What information was used to make this determination?<br><small>Hindi: What information was used to make this determination?</small> | radiogroup | 1: Absence of fetal heart sounds; 2: Ultrasound confirmation; 3: Signs of maceration at time of delivery; 4: Not indicated on medical card | {sbf_stillbirth_determined_antepartum_intrapartum_medical_card} = 1 | ["single coded option"] | {"render_as":"radio"} |
| 13 | sbf_there_any_bruises_signs_injury_baby_s_body | 13 | Were there any bruises or signs of injury on the baby's body at the time of<br><small>Hindi: Were there any bruises or signs of injury on the baby's body at the time of</small> | radiogroup | 1: Yes delivery?; 2: No; 9: Don't know |  | ["single coded option"] | {"render_as":"radio"} |
| 14 | sbf_baby_s_skin_pulpy_peeling | 14 | Was the baby's skin pulpy or peeling?<br><small>Hindi: Was the baby's skin pulpy or peeling?</small> | radiogroup | 1: Yes; 2: No; 9: Don't know |  | ["single coded option"] | {"render_as":"radio"} |
| 15 | sbf_baby_foul_smelling | 15 | Was the baby foul smelling?<br><small>Hindi: Was the baby foul smelling?</small> | radiogroup | 1: Yes; 2: No; 9: Don't know |  | ["single coded option"] | {"render_as":"radio"} |
| 16 | sbf_delivery_time | 16 | Was any part of the baby physically abnormal at the time of delivery?<br><small>Hindi: Was any part of the baby physically abnormal at the time of delivery?</small> | radiogroup | 1: Yes; 2: No; 9: Don't know |  | ["single coded option"] | {"render_as":"radio"} |
| 17 | sbf_abnormalities | 17 | What were the abnormalities?<br><small>Hindi: What were the abnormalities?</small> | radiogroup | 1: Head size very small; 2: Head size very large; 3: Mass or lump on back of head or spine; 4: Other, specify______; 9: Don’t Know | {sbf_delivery_time} = 1 | ["single coded option"] | {"render_as":"radio"} |
| 17.1 | sbf_abnormalities_other_specify | 17_4_specify | Specify other response<br><small>Instruction: Complete only if Other, specify______ is selected.</small><br><small>Hindi: अन्य उत्तर निर्दिष्ट करें</small> | text |  | {sbf_abnormalities} = 4 | [{"type":"text","minLength":1,"maxLength":120,"text":{"default":"Specify the other response.","hi":"अन्य उत्तर निर्दिष्ट करें।","kn":"","mr":"","ta":"","te":"","ur":""}}] | {"render_as":"input"} |

