# Site and Interviewer Workplan Indicators

Working document for field worklists, site monitoring, and interviewer-level operational indicators.

This document is based on:

- `Refs/pretsing forms/forms_summary table_v2026.05.17.pdf`
- `Refs/FLOW.md`
- `Refs/Unique_Ids.md`
- `Refs/progress_parameters.md`

## Purpose

The app should help site teams and interviewers know:

1. Which households need contact.
2. Why a household needs contact.
3. Which forms are due.
4. Which events in the household need follow-up.
5. Which forms can be combined in one contact.
6. Which pending tasks are overdue or coming due.

The interviewer should not see only a form selector. For field operations, the interviewer needs a household-level worklist and visit dashboard.

## Household Visit Dashboard

Before opening HRF or any other form, the app should show household context.

Minimum household context:

| Domain | Information needed |
| --- | --- |
| Household ID | Site, hamlet/village/colony code, structure map number, household number |
| Household contact | Household head/name, address, mobile number |
| Baseline status | Baseline HH enrollment completed; exclude empty/vacant/not enrolled households |
| Roster summary | Current members, eligible women, pregnancy-tracking women |
| Current tasks | HRF/PFF/NFF/PEF/POF/BAF/SBF/CDF/VA due or overdue |
| Active pregnancies | Woman ID, pregnancy event ID, pregnancy status, PFF due date, USG status |
| Child follow-up | Child/birth IDs, next NFF due, survival status |
| Death/stillbirth follow-up | SBF/CDF completed status, VA due date |
| Notes | Household/individual notes for field context only; not used for analysis |

## Household Contact Worklist

Each worklist row should represent one enrolled household.

Suggested columns:

| Column | Meaning |
| --- | --- |
| `household_id` | Site + locality + structure map + household number |
| `site_id` | Site |
| `locality_code` | Hamlet/village/colony |
| `structure_map_id` | Structure map number |
| `household_number` | Household number in structure |
| `household_head_name` | Display name |
| `mobile_number` | Contact number |
| `last_household_contact_date` | Last completed HRF or accepted combined household contact |
| `next_household_contact_due_date` | Bi-monthly expected contact date |
| `household_contact_status` | Due / overdue / completed / not reachable / postponed |
| `active_pregnancy_count` | Count of active pregnancy events in household |
| `pregnancy_followup_due_count` | PFF due count |
| `newborn_followup_due_count` | NFF due count |
| `outcome_due_count` | POF/BAF/SBF/CDF/VA due count |
| `priority_level` | Routine / due soon / overdue / urgent |

## Form Due Indicators

### HRF Due

| Indicator | Draft rule |
| --- | --- |
| `hrf_due` | Household is enrolled and next bi-monthly household contact is due |
| `hrf_overdue` | HRF/contact due date has passed beyond grace period |
| `hrf_completed_this_window` | HRF or accepted combined household contact completed in current two-month window |

Open: define exact grace period and whether combined PFF/NFF contact counts as HRF contact.

### PEF Due

| Indicator | Draft rule |
| --- | --- |
| `pef_due` | Pregnancy detected but Pregnancy Enrollment not yet completed |
| `pef_direct_allowed` | Pregnancy detected for already identified eligible woman with valid `household_member_id` / `woman_id` |
| `roster_update_required_before_pef` | Pregnancy detected for a woman whose household member/person ID does not yet exist or needs correction |

Operational rule:

```text
If both roster change and pregnancy are detected, update roster first, then open PEF.
If pregnancy is detected for an already-enrolled woman with valid ID, PEF may be opened directly.
```

### UF Due

| Indicator | Draft rule |
| --- | --- |
| `uf_due` | First ultrasound report available but Ultrasound Form not completed |
| `usg_report_upload_due` | UF variable 21 not completed for available report |
| `usg_followup_due` | Ultrasound not done or report unavailable and follow-up is needed |

Upload location:

```text
Ultrasound Form variable 21: Upload Photo / PDF of the USG report.
```

### PFF Due

| Indicator | Draft rule |
| --- | --- |
| `pff_due` | Active pregnancy requires monthly follow-up |
| `pff_overdue` | Monthly follow-up due date has passed beyond grace period |
| `pff_mode` | Face-to-face or telephonic according to schedule/visit plan |

### POF Due

| Indicator | Draft rule |
| --- | --- |
| `pof_due` | Delivery/pregnancy outcome reported but POF not completed |
| `pof_urgent` | Delivery occurred today/yesterday and POF pending |

Timing from summary table:

```text
POF: day of delivery or day after, face-to-face.
```

### BAF Due

| Indicator | Draft rule |
| --- | --- |
| `baf_due` | POF completed and birth/fetal outcome >=20 weeks needs Birth Assessment |
| `baf_count_due` | Number of BAF forms required from POF outcome counts |

Timing:

```text
BAF: same time as POF, face-to-face.
```

### SBF Due

| Indicator | Draft rule |
| --- | --- |
| `sbf_due` | Birth Assessment classifies outcome as stillbirth and SBF not completed |
| `sbf_completed` | Stillbirth form completed |

Timing:

```text
SBF: same time as BAF, face-to-face.
```

### NFF Due

| Indicator | Draft rule |
| --- | --- |
| `nff_due` | Live child has scheduled newborn/child follow-up due |
| `nff_overdue` | Scheduled NFF visit overdue beyond grace period |
| `nff_mode` | Face-to-face or telephonic based on visit age |

NFF schedule from forms summary table:

| Visit age | Mode |
| --- | --- |
| 7d | Face-to-face |
| 28d | Face-to-face |
| 2m | Face-to-face |
| 3m | Face-to-face |
| 4.5m | Telephonic |
| 6m | Face-to-face |
| 7.5m | Telephonic |
| 9m | Face-to-face |
| 10.5m | Telephonic |
| 12m | Face-to-face |
| 14m, 16m, later until end of study | Telephonic unless protocol specifies otherwise |

### CDF Due

| Indicator | Draft rule |
| --- | --- |
| `cdf_due` | Child death reported after live birth and CDF not completed |
| `cdf_completed` | Child Death Form completed |

Timing:

```text
CDF: same time as BAF or NFF, face-to-face.
```

### VA Due

| Indicator | Draft rule |
| --- | --- |
| `va_due` | Stillbirth or child death occurred and 30 days have elapsed |
| `va_not_yet_due` | Death/stillbirth event recorded but 30 days not yet elapsed |
| `va_overdue` | VA due date passed beyond grace period |
| `va_completed` | VA completed |

Timing:

```text
VA: 30 days after stillbirth or child death, face-to-face.
```

## Combined Contact Indicators

The forms summary table permits some combined visits.

| Combination | Draft rule |
| --- | --- |
| `hrf_pff_combined_possible` | Household contact due and active pregnancy PFF due |
| `hrf_nff_combined_possible` | Household contact due and child NFF due |
| `pff_nff_combined_possible` | Pregnancy follow-up and child follow-up due in same household |
| `combined_visit_recommended` | More than one due task can be completed in same contact |

Forms that may be combined:

| Form | May combine with |
| --- | --- |
| HRF | PFF and/or NFF |
| PFF | HRF and/or NFF |
| NFF | HRF and/or PFF |

## Site-Level Indicators

### Household Contact

| Indicator | Draft definition |
| --- | --- |
| `% households contacted in two-month window` | Enrolled households contacted / enrolled households expected for contact |
| `% households overdue for contact` | Households overdue / households expected for contact |
| `% households not reachable` | Households marked not reachable / households attempted |

### Pregnancy Surveillance

| Indicator | Draft definition |
| --- | --- |
| `new_pregnancies_detected` | Count of pregnancy detection events |
| `pregnancy_enrollments_completed` | Count of completed PEF |
| `pregnancy_enrollments_pending` | Detected pregnancies without completed PEF |
| `active_pregnancies` | Pregnancies enrolled without outcome recorded |
| `% active pregnancies followed monthly` | Active pregnancies with current PFF / active pregnancies due |

### Ultrasound

| Indicator | Draft definition |
| --- | --- |
| `usg_reports_available` | Pregnancies where report availability is yes |
| `usg_forms_completed` | Completed UF |
| `usg_upload_pending` | UF required but report upload pending |

### Outcomes and Births

| Indicator | Draft definition |
| --- | --- |
| `pregnancy_outcomes_due` | Deliveries/outcomes reported but POF pending |
| `birth_assessments_due` | Required BAF not completed |
| `stillbirth_forms_due` | Stillbirths needing SBF |
| `child_death_forms_due` | Child deaths needing CDF |
| `verbal_autopsies_due` | VA due after 30 days |

### Child Follow-Up

| Indicator | Draft definition |
| --- | --- |
| `children_under_followup` | Live children with ongoing follow-up |
| `nff_due` | NFF visits due |
| `nff_overdue` | NFF visits overdue |
| `% scheduled child followups completed` | Completed NFF visits / due NFF visits |

## Interviewer-Level Indicators

| Indicator | Draft definition |
| --- | --- |
| `households_assigned` | Enrolled households assigned to interviewer |
| `households_contacted_current_window` | Assigned households contacted in current two-month window |
| `households_overdue` | Assigned households overdue |
| `forms_completed_by_type` | Completed forms grouped by HHQ/WQ/HRF/PEF/UF/PFF/POF/BAF/SBF/NFF/CDF/VA |
| `pending_tasks` | Due/overdue tasks assigned |
| `combined_visits_completed` | Contacts completing more than one due form |

## Priority Rules

Draft household priority assignment:

| Priority | Condition |
| --- | --- |
| Urgent | POF due, BAF due, CDF due, VA overdue |
| High | PFF overdue, NFF overdue, USG upload pending, PEF pending |
| Routine due | HRF due, PFF due, NFF due |
| Not due | No currently due task |

Open: finalize exact overdue grace periods.

## Open Decisions

1. Define exact two-month household contact windows.
2. Define grace periods for HRF, PFF, NFF, POF, BAF, CDF, and VA.
3. Define whether combined PFF/NFF contact counts as household contact for HRF coverage.
4. Define what counts as successful household contact: completed HRF only, or any completed due form with roster/pregnancy check.
5. Define site and interviewer dashboard display order.
6. Define escalation rules for overdue VA, overdue POF, and missed NFF.
