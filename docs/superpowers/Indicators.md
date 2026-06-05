# DYNAMIC - PreTESTING - Indicators Register

Status: working draft

This file lists tracking, progress, and data-quality indicators discussed for the DYNAMIC - PreTESTING software. Indicator definitions are not final until numerator, denominator, time window, exclusion rules, and role visibility are reviewed and approved.

## Progress And Monitoring Indicators

| Indicator | Display level | Numerator / measure | Denominator | Time window | Exclusion rules | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Households mapped | Site, locality, FDC assignment range | Number of households mapped/listed | To decide | Daily, weekly, monthly, custom date range | To decide | Should support locality and FDC range filtering. |
| HHQs completed | Site, locality, FDC assignment range | Number of Baseline Household Questionnaires submitted | To decide | Daily, weekly, monthly, custom date range | To decide | Should distinguish submitted from draft. |
| WQs completed | Site, locality, FDC assignment range | Number of Baseline Woman's Questionnaires submitted | To decide | Daily, weekly, monthly, custom date range | To decide | Should link back to HH ID/member/person. |
| Pregnancies enrolled | Site, locality, FDC assignment range | Number of pregnancy enrollments created | To decide | Daily, weekly, monthly, custom date range | To decide | Should include EligibleWomanForPregnancyTrackingID and Pregnancy ID where applicable. |
| Follow-ups due | Site, locality, FDC assignment range, form type | Number of scheduled follow-up tasks due | To decide | Daily, weekly, monthly, custom date range | To decide | Should include HRF, PFF, NFF, and other follow-up forms as applicable. |
| Follow-ups completed | Site, locality, FDC assignment range, form type | Number of due follow-up tasks completed | To decide | Daily, weekly, monthly, custom date range | To decide | Should link completed task to submitted form. |
| Follow-ups missed | Site, locality, FDC assignment range, form type | Number of due follow-up tasks missed | To decide | Daily, weekly, monthly, custom date range | To decide | Need protocol rule for missed/deadline definition. |
| Forms submitted | Site, locality, FDC assignment range, form type | Number of forms submitted | To decide | Daily, weekly, monthly, custom date range | To decide | Under each progress view, provide a filterable list of forms submitted. |
| Issue flags | Site, locality, FDC assignment range, form type, severity | Number of submitted forms flagged Minor issue or Major issue | To decide | Daily, weekly, monthly, custom date range | To decide | Should show reviewer, timestamp, severity, and DM/SiteDataManager comments. |

## Submission Review List

| Column | Purpose | Notes |
| --- | --- | --- |
| HH ID | Household linkage | Required for household-level navigation. |
| EligibleWomanForPregnancyTrackingID | Eligible woman linkage | Required where applicable. |
| Pregnancy ID | Pregnancy episode linkage | Required where applicable. |
| Birth ID | Birth outcome / child linkage | Required where applicable. |
| Form Type | Form submitted | HHQ, WQ, HRF, PEF, UF, PFF, POF, BAF, SBF, NFF, CDF, VA, etc. |
| DateTimeSubmitted | Submission timestamp | Used for period filters and 48-hour edit window. |
| Review flag status | Data-quality review state | None, Minor issue, Major issue. |
| Editing history | Audit access | Shows edits, users, timestamps, changed fields, and reasons/context if captured. |
| View Form | Action | Opens submitted form preview/detail. |

## Data-Quality Indicators

| Indicator | Display level | Numerator | Denominator | Time window | Exclusion rules | Status / notes |
| --- | --- | --- | --- | --- | --- | --- |
| Submission-level percent missingness | Site, locality, FDC, form type, submission | To decide | To decide | To decide | To decide | Exact fields counted for missingness need to be defined by proforma/form type. |
| Percent of pregnancies with ultrasound | Site, locality, FDC assignment range | To decide | To decide | To decide | To decide | Need to define whether denominator is all pregnancies enrolled, eligible pregnancies in ultrasound window, or pregnancies reaching a protocol milestone. |
| Percent of stillbirths with weight recorded | Site, locality, FDC assignment range | To decide | To decide | To decide | To decide | Need to define which stillbirth records are eligible and whether unavailable/not measurable weight is excluded or counted missing. |

## Pending Definition Work

| Topic | Decision needed |
| --- | --- |
| Denominators | Define exact denominator for each indicator. |
| Time windows | Define whether indicator windows use submission date, event date, task due date, completion date, or review date. |
| Exclusion rules | Define exclusions per form and outcome, including drafts, duplicate submissions, disabled VA tasks, ineligible records, and not-applicable fields. |
| Role visibility | Define which indicators are visible to FDC, Supervisor, SDM, SRS, Site Investigator, and Central Investigator. |
| Drill-down behavior | Define row-level drill-down for each indicator, especially submitted forms, missing fields, issue flags, and edit history. |
