# DYNAMIC - PreTESTING - Edit Escalations Register

Status: working draft

This file lists proforma fields where edits may change eligibility, follow-up scheduling, outcome classification, or downstream workflow. These fields require Site Investigator or Central Investigator approval before the edit becomes final/effective.

Exact PDF `Variable ID` / SurveyJS `sourceCode` mapping must be completed form by form before implementation.

## Escalation Rule

| Rule | Requirement |
| --- | --- |
| Routine edit window | SiteDataManager may edit submitted FDC forms within 48 hours with full audit log. |
| Post-window correction | After 48 hours, form corrections require central approval. |
| Key outcome/workflow-linked field edit | Requires Site Investigator or Central Investigator approval even if the edit is inside the 48-hour window. |
| Audit trail | Store original value, proposed value, editor, edit timestamp, approving role/user, approval timestamp, reason/comments, and any downstream recalculation performed. |
| Workflow recalculation | If the approved edit changes eligibility, task generation, visit schedule, or outcome state, recalculate affected workflow immediately and record the recalculation in the audit trail. |
| Downstream form deactivation | If a downstream form has already been filled and becomes invalid because of the approved key-field edit, deactivate that downstream form and show the deactivation in the audit trail. |

## Candidate Escalation Fields By Proforma

| Proforma | Field / concept requiring escalation | Why escalation is needed | Approval level | Exact variable IDs / sourceCode |
| --- | --- | --- | --- | --- |
| HHQ - Baseline Household Questionnaire | Household enrollment/consent status | Determines whether the household enters the longitudinal cohort. | Site Investigator or Central Investigator | To map from HHQ PDF/JSON |
| HHQ - Baseline Household Questionnaire | Household ID components: site, locality, structure map ID, household number | Changes household identity and all linked members/tasks/forms. | Site Investigator or Central Investigator | To map from HHQ PDF/JSON |
| HHQ - Baseline Household Questionnaire | Usual-resident status of listed members | Determines household roster and eligibility for later forms. | Site Investigator or Central Investigator | To map from HHQ PDF/JSON |
| HHQ - Baseline Household Questionnaire | Member sex | Affects woman eligibility and downstream pregnancy tracking. | Site Investigator or Central Investigator | To map from HHQ PDF/JSON |
| HHQ - Baseline Household Questionnaire | Member date of birth / age | Affects woman eligibility and child/age-related rules. | Site Investigator or Central Investigator | To map from HHQ PDF/JSON |
| HHQ - Baseline Household Questionnaire | Member number / person linkage fields | Changes permanent person identity and all linked records. | Site Investigator or Central Investigator | To map from HHQ PDF/JSON |
| WQ - Baseline Woman's Questionnaire | Woman currently pregnant Yes/No | Directly determines pregnancy tracking workflow and follow-up generation. | Site Investigator or Central Investigator | To map from WQ PDF/JSON |
| WQ - Baseline Woman's Questionnaire | Pregnancy eligibility / enrollment decision fields | Determines whether EligibleWomanForPregnancyTrackingID and Pregnancy ID are created. | Site Investigator or Central Investigator | To map from WQ PDF/JSON |
| WQ - Baseline Woman's Questionnaire | LMP / pregnancy dating fields used for follow-up scheduling | May affect pregnancy follow-up timing and due windows. | Site Investigator or Central Investigator | To map from WQ PDF/JSON |
| HRF - Household Rounds Form | New usual-resident member addition status | Can change household roster and eligibility. | Site Investigator or Central Investigator | To map from HRF PDF/JSON |
| HRF - Household Rounds Form | Member death / out-migration / inactive status | Changes person status and may affect follow-up availability. | Site Investigator or Central Investigator | To map from HRF PDF/JSON |
| HRF - Household Rounds Form | Pregnancy newly identified Yes/No | May create pregnancy enrollment pathway and follow-up tasks. | Site Investigator or Central Investigator | To map from HRF PDF/JSON |
| PEF - Pregnancy Enrollment Form | Pregnancy confirmation/enrollment status | Creates or changes active pregnancy episode. | Site Investigator or Central Investigator | To map from PEF PDF/JSON |
| PEF - Pregnancy Enrollment Form | Pregnancy ID linkage / eligible woman linkage | Changes episode identity and linked follow-up tasks. | Site Investigator or Central Investigator | To map from PEF PDF/JSON |
| PEF - Pregnancy Enrollment Form | LMP / gestational age / expected delivery dating fields | Changes PFF schedule and pregnancy timeline. | Site Investigator or Central Investigator | To map from PEF PDF/JSON |
| UF - Ultrasound Form | Ultrasound done Yes/No | Affects ultrasound completion indicator and pregnancy data quality. | Site Investigator or Central Investigator | To map from UF PDF/JSON |
| UF - Ultrasound Form | Ultrasound date / gestational age estimate | May affect pregnancy dating and quality indicators. | Site Investigator or Central Investigator | To map from UF PDF/JSON |
| PFF - Pregnancy Follow-Up Form | Pregnancy still ongoing Yes/No | Controls whether pregnancy follow-up continues or outcome workflow begins. | Site Investigator or Central Investigator | To map from PFF PDF/JSON |
| PFF - Pregnancy Follow-Up Form | Pregnancy outcome suspected/reported | May trigger Pregnancy Outcome Form or related workflow. | Site Investigator or Central Investigator | To map from PFF PDF/JSON |
| POF - Pregnancy Outcome Form | Pregnancy outcome type | Determines live birth, stillbirth, miscarriage, abortion, or other outcome classification. | Site Investigator or Central Investigator | To map from POF PDF/JSON |
| POF - Pregnancy Outcome Form | Outcome date/time | Determines downstream BAF/SBF/NFF/CDF/VA timing. | Site Investigator or Central Investigator | To map from POF PDF/JSON |
| POF - Pregnancy Outcome Form | Number of outcomes / plurality | Determines number of Birth IDs created. | Site Investigator or Central Investigator | To map from POF PDF/JSON |
| POF - Pregnancy Outcome Form | Birth ID / outcome sequence linkage | Changes permanent birth outcome identity. | Site Investigator or Central Investigator | To map from POF PDF/JSON |
| BAF - Birth Assessment Form | Live-born child status | Determines child/newborn follow-up workflow. | Site Investigator or Central Investigator | To map from BAF PDF/JSON |
| BAF - Birth Assessment Form | Birth weight | Key outcome/quality variable and may affect clinical/data-quality review. | Site Investigator or Central Investigator | To map from BAF PDF/JSON |
| SBF - Stillbirth Form | Stillbirth confirmation/classification | Determines stillbirth outcome and VA timing. | Site Investigator or Central Investigator | To map from SBF PDF/JSON |
| SBF - Stillbirth Form | Stillbirth weight | Data-quality indicator: percent of stillbirths with weight recorded. | Site Investigator or Central Investigator | To map from SBF PDF/JSON |
| NFF - Newborn Follow-Up Form | Child alive Yes/No | Determines continuation of NFF or child death workflow. | Site Investigator or Central Investigator | To map from NFF PDF/JSON |
| NFF - Newborn Follow-Up Form | Date of child death if reported | Determines CDF/VA timing and child follow-up closure. | Site Investigator or Central Investigator | To map from NFF PDF/JSON |
| CDF - Child Death Form | Child death confirmation | Determines child death outcome and VA task generation. | Site Investigator or Central Investigator | To map from CDF PDF/JSON |
| CDF - Child Death Form | Date of child death | Determines VA due date 30 days after death. | Site Investigator or Central Investigator | To map from CDF PDF/JSON |
| VA - Verbal Autopsy | Death/stillbirth linkage fields | Changes which death or stillbirth event the VA belongs to. | Site Investigator or Central Investigator | To map when VA JSON/PDF is available |
| VA - Verbal Autopsy | VA completion/classification fields | May affect mortality review outputs. | Site Investigator or Central Investigator | To map when VA JSON/PDF is available |

## Approval Workflow States

| State | Meaning |
| --- | --- |
| No escalation needed | Edit is routine and can be saved by authorized role within normal rules. |
| Escalation required | Edited field is workflow-linked and cannot become final without approval. |
| Pending Site Investigator approval | Site-level approval requested. |
| Pending Central Investigator approval | Central approval requested or required. |
| Approved | Edit is accepted and downstream recalculation can run if needed. |
| Rejected | Edit is not accepted; original effective value remains active. |

## Implementation Notes

- Store proposed edits separately from effective submitted-form values until approval is complete.
- Submitted form preview should show whether a field has pending, approved, or rejected escalated edits.
- Editing history should show both routine edits and escalated edits.
- Approved escalated edits should immediately recalculate downstream eligibility and task state.
- Downstream forms already filled from a now-invalid workflow path should be deactivated, not silently deleted.
- The audit trail should show the approved edit, recalculation performed, tasks created/closed/deactivated, eligibility changes, and any downstream form deactivation.
- Issue flags (Minor issue / Major issue) are separate from edit escalation. A Major issue does not automatically trigger a fixed action; SD/SI/Central team advises case by case.
