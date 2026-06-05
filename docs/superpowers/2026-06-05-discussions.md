# DYNAMIC - PreTESTING - Site Investigator Discussion

Date: 2026-06-05

Status: brainstorming / discussion notes

## Context

This file captures findings from discussion with site investigators. Notes here are working observations until they are reviewed and promoted into the relevant protocol, architecture, data-model, questionnaire, or implementation documents.

## Participants

- Site investigators
- DYNAMIC - PreTESTING study and implementation team

## Discussion Notes

### Field Workflow And Site Operations

- A locality may need to be partitioned across multiple Field Data Collectors (FDCs). Assignment should support:
  - FDC -> locality -> household number numeric min-max range.
  - Example: one FDC may cover household numbers 001-150 in a locality, while another FDC covers 151-300.
- The FDC should only be able to view households, members, tasks, and forms for the household number range assigned to them within that locality.
- Supervisors, SDM, SRS, and Site Investigators should be able to view the full locality, not only individual FDC household-number ranges.

### Household, Member, Pregnancy, And Child Tracking

- HHQ should allow recording multiple mobile numbers for the Head of Household (HOH), not just a single contact number.
- HOH mobile numbers should be stored as a comma-separated list of 10-digit mobile numbers. No primary/secondary classification is needed.

### Questionnaire And Form Flow Findings

- HHQ form review should check whether the current contact-number field supports multiple HOH mobile numbers or needs a repeatable/alternate-number structure.
- After a proforma/form is filled on the tablet, the FDC should have a way to preview the entered data before final submission.
- In Preview, the FDC should review the filled data and be able to go back to the form to make corrections before submitting.
- FDCs need a Save Draft option for partially completed or not-yet-finalized forms.
- Draft forms should sync to the server as drafts.
- The draft state should be distinct from submitted state; submitted forms enter the SiteDataManager review/edit workflow, while drafts remain under the FDC's field workflow until submitted.

### Admin, Correction, And Data Quality Workflow

- SiteDataManager role users should be able to view submitted forms for their site.
- SiteDataManager role users should be able to flag a submitted form as having either Minor issues or Major issues.
- The Minor/Major issue flag workflow should include a comments box so that comments by the DM/SiteDataManager user can be documented.
- Issue flags should be stored as data-quality review status on the submitted form, with reviewer, timestamp, issue severity, and DM/SiteDataManager comments.
- A Major issue flag does not automatically trigger a fixed action. SD/SI/Central team will advise the required action case by case.
- Submitted forms from FDCs should have a 48-hour edit window.
- At each site, a user with the SiteDataManager role can edit submitted forms during this 48-hour window.
- After 48 hours, form corrections require central approval.
- Every edit by the SiteDataManager must create a full audit log, including who edited, when edited, what changed, and the reason/context if captured.
- Certain key outcome or workflow-linked fields in each proforma require approval if edited. These edits should be approved by a Site Investigator or Central Investigator before they become final/effective.
- Example: editing whether a woman is pregnant (Yes/No) affects subsequent workflow and follow-up generation, so it should require investigator approval.
- If a key field edit is approved, downstream tasks and eligibility should be recalculated immediately.
- If a downstream form has already been filled and becomes invalid after recalculation, that downstream form should be deactivated.
- The recalculation and any downstream form deactivation should be shown in the audit trail.
- Edit escalation fields are being maintained in `docs/superpowers/Edit-Escalations.md`.
- This is a site-level data-management correction workflow, not a field-worker correction queue.

### Tracking, Monitoring, And Progress Reports

- Progress tracking parameters should support daily, weekly, monthly, and custom date-range based views.
- Progress views should allow tracking work completed over a selected time period, not only cumulative totals.
- Each progress view should include: households mapped, HHQs completed, WQs completed, pregnancies enrolled, follow-ups due/completed/missed, forms submitted, and issue flags.
- Under each progress view, provide a filterable list of forms submitted.
- SDM/SRS users need a period-based submission review list showing submissions received during the selected period.
- The submission review list should include: HH ID, EligibleWomanForPregnancyTrackingID, Pregnancy ID, Birth ID, Form Type, DateTimeSubmitted, review flag status, editing history, and a View Form action.
- Initial data-quality indicators discussed:
  - Submission-level percent missingness.
  - Percent of pregnancies with ultrasound.
  - Percent of stillbirths with weight recorded.
- Indicator definitions are being maintained in `docs/superpowers/Indicators.md`.

### Offline Sync And Android Worklist Implications

- Offline sync and Android worklists must respect the assigned locality plus household-number range. The field app should not download or display households outside the FDC's assigned range.
- The Android app needs local draft storage for forms saved before submission.
- Preview should work offline from the locally saved form data before the FDC submits.
- Draft forms should be included in sync as draft records.

## Decisions Or Tentative Agreements

- Tentative: field assignment scope is not just site/locality. It may need a household-number range within a locality.
- Tentative: SiteDataManager role users can view submitted forms for their site, flag them as having Minor issues or Major issues, and edit submitted FDC forms for 48 hours with full audit logging. After 48 hours, form corrections require central approval.
- Tentative: FDC tablet workflow should include Preview and Save Draft before final form submission, and draft forms should sync to the server as drafts.
- Tentative: edits to key outcome/workflow-linked fields require Site Investigator or Central Investigator approval before the edit is finalized.

## Open Questions

- What are the exact denominators, time windows, and exclusion rules for each data-quality indicator?

## Action Items

- Software should be ready by 2026-07-12.
