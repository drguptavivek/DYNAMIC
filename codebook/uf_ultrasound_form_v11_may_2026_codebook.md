# UF Codebook: Ultrasound Form

- Version: 11 MAY 2026
- Source PDF: Refs/pretsing forms/ultrasound_form_v2026.05.11.pdf
- Generated from: `outputs/pretsing-form-json/ultrasound_form_v2026.05.11.json`
- CSV: `uf_ultrasound_form_v11_may_2026_codebook.csv`
- Variables/rows: 23

Notes: repeated roster/panel fields are listed with `panel_path` and `repeat_context`. Labels, instructions, choices, relevance, validation, and appearance are kept in separate columns.

## Main form

| Order | Code | Source code | Label | Type | Options | Relevance | Validation | Appearance |
|---:|---|---|---|---|---|---|---|---|
| 1 | uf_woman_name | 1 | Name of woman<br><small>Hindi: महिला का नाम</small> | text |  |  |  | {"render_as":"input"} |
| 2 | uf_husband_name | 2 | Name of husband<br><small>Hindi: पति का नाम</small> | text |  |  |  | {"render_as":"input"} |
| 3 | uf_pregnancy_id | 3 | Pregnancy ID<br><small>Hindi: गर्भावस्था आईडी</small> | text |  |  |  | {"render_as":"input"} |
| 4 | uf_form_completed_date | 4 | Date form was completed dd/mm/yyyy<br><small>Hindi: दिनांक फॉर्म पूरा हो गया dd/mm/yyyy</small> | text |  |  | ["dd/mm/yyyy"] | {"render_as":"date_picker"} \| inputType=date |
| 5 | uf_ultrasound_report_access_location | 5 | Where was the ultrasound report accessed?<br><small>Hindi: Where was the ultrasound report accessed?</small> | radiogroup | 1: At the woman's home; 2: At health facility; 3: Other (specify) |  | ["single coded option"] | {"render_as":"radio"} |
| 5.1 | uf_ultrasound_report_access_location_other_specify | 5_3_specify | Specify other response<br><small>Instruction: Complete only if Other (specify) is selected.</small><br><small>Hindi: अन्य उत्तर निर्दिष्ट करें</small> | text |  | {uf_ultrasound_report_access_location} = 3 | [{"type":"text","minLength":1,"maxLength":120,"text":{"default":"Specify the other response.","hi":"अन्य उत्तर निर्दिष्ट करें।","kn":"","mr":"","ta":"","te":"","ur":""}}] | {"render_as":"input"} |
| 6 | uf_ultrasound_facility | 6 | Where was the ultrasound performed? ____________ Please fill name and address of facility<br><small>Hindi: Where was the ultrasound performed? ____________ Please fill name and address of facility</small> | text |  |  |  | {"render_as":"input"} |
| 7 | uf_ultrasound_date | 7 | Date ultrasound was performed dd/mm/yyyy<br><small>Hindi: अल्ट्रासाउंड दिनांक dd/mm/yyyy किया गया</small> | text |  |  | ["dd/mm/yyyy"] | {"render_as":"date_picker"} \| inputType=date |
| 8 | uf_pregnancy_being_confirmed_ultrasound | 8 | Has this pregnancy being confirmed by this ultrasound?<br><small>Hindi: क्या इस अल्ट्रासाउंड से गर्भावस्था की पुष्टि हो रही है?</small> | radiogroup | 1: Yes; 2: No |  | ["single coded option"] | {"render_as":"radio"} |
| 9 | uf_ultrasound_type | 9 | Type of ultrasound<br><small>Hindi: Type of ultrasound</small> | radiogroup | 1: Transvaginal; 2: Transabdominal; 3: not indicated in report |  | ["single coded option"] | {"render_as":"radio"} |
| 10 | uf_fetus_count_category | 10 | Number of foetuses<br><small>Hindi: भ्रूणों की संख्या</small> | radiogroup | 1: Singleton; 2: Multiple |  | ["single coded option"] | {"render_as":"radio"} |
| 11 | uf_measurement_crown_rump_length_mm | 11 | Measurement: Crown-rump length<br><small>Hindi: माप: क्राउन-रंप लंबाई</small> | text |  |  | [{"type":"numeric"}] | {"render_as":"fixed_width_numeric_boxes"} \| inputType=number |
| 12 | uf_measurement_bi_parietal_diameter_mm | 12 | Measurement: Biparietal diameter<br><small>Hindi: माप: द्विपार्श्विक व्यास</small> | text |  |  | [{"type":"numeric"}] | {"render_as":"fixed_width_numeric_boxes"} \| inputType=number |
| 13 | uf_measurement_nuchal_translucency_mm | 13 | Measurement: Nuchal translucency<br><small>Hindi: माप: न्यूकल ट्रांसलूसेंसी</small> | text |  |  | [{"type":"numeric"}] | {"render_as":"fixed_width_numeric_boxes"} \| inputType=number |
| 14 | uf_gestational_age_indicated_ultrasound_report | 14 | Gestational age as indicated in ultrasound report<br><small>Instruction: Gestational age as indicated in ultrasound report.</small><br><small>Hindi: गर्भकालीन आयु जैसा कि अल्ट्रासाउंड रिपोर्ट में दर्शाया गया है</small> | multipletext |  |  | ["Gestational age as indicated in ultrasound report."] | {"render_as":"numeric_textboxes"} |
| 15 | uf_edd_by_ultrasound | 15 | Expected date of delivery (EDD) by ultrasound dd/mm/yyyy<br><small>Hindi: अल्ट्रासाउंड dd/mm/yyyy द्वारा डिलीवरी की अपेक्षित तिथि (EDD)।</small> | text |  |  | ["dd/mm/yyyy"] | {"render_as":"date_picker"} \| inputType=date |
| 16 | uf_organ_status_head_brain | 16 | Organ status: Head and Brain<br><small>Hindi: अंग की स्थिति: सिर और मस्तिष्क</small> | radiogroup | 1: Normal; 2: Abnormal; 3: not indicated in report |  | ["single coded option"] | {"render_as":"radio"} |
| 17 | uf_organ_status_heart | 17 | Organ status: Heart<br><small>Hindi: अंग स्थिति: हृदय</small> | radiogroup | 1: Normal; 2: Abnormal; 3: not indicated in report |  | ["single coded option"] | {"render_as":"radio"} |
| 18 | uf_organ_status_abdomen | 18 | Organ status: Abdomen<br><small>Hindi: अंग की स्थिति: पेट</small> | radiogroup | 1: Normal; 2: Abnormal |  | ["single coded option"] | {"render_as":"radio"} |
| 19 | uf_organ_status_abdomen_2 | 18 | Organ status: Abdomen<br><small>Hindi: अंग की स्थिति: पेट</small> | radiogroup | 3: not indicated in report |  | ["single coded option"] | {"render_as":"radio"} |
| 20 | uf_organ_status_extremities | 19 | Organ status: Extremities<br><small>Hindi: अंग की स्थिति: चरम सीमाएँ</small> | radiogroup | 1: Normal; 2: Abnormal; 3: not indicated in report |  | ["single coded option"] | {"render_as":"radio"} |
| 21 | uf_organ_status_placenta | 20 | Organ status: Placenta<br><small>Hindi: अंग की स्थिति: प्लेसेंटा</small> | radiogroup | 1: Normal; 2: Abnormal; 3: not indicated in report |  | ["single coded option"] | {"render_as":"radio"} |
| 22 | uf_upload_photo_pdf_usg_report_ancy | 21 | Upload Photo / PDF of the USG report<br><small>Instruction: Upload the scanned/photo/PDF copy of the ultrasound report.</small><br><small>Hindi: Upload Photo / PDF of the USG report</small> | file |  |  |  | {"render_as":"file_upload"} |

