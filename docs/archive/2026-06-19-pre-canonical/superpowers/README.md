# DYNAMIC - PreTESTING - Superpowers Documentation Index

This folder contains the working architecture, data-model, schedule, audit, and reporting rules for the DYNAMIC PreTESTING system.

Use this file as the anchor document before changing backend schema, schedule generation, Expo worklists, admin correction workflows, or analysis datasets.

## How To Read These Documents

Start with the current architecture and data-model rules, then use the narrower policy files for specific implementation decisions.

| Document | Use |
| --- | --- |
| `specs/2026-06-03-dynamic-fullstack-offline-architecture-design.md` | Main architecture source of truth for backend, Expo offline sync, admin app, SurveyJS use, normalized domain state, task generation, corrections, and sync. |
| `specs/2026-06-07-form-drafts-autosave-design.md` | Approved design for local `form_drafts`, 30-second Expo autosave, Save Draft, Preview anytime, required Preview before final save, and finalize-only upload. |
| `specs/2026-06-07-surveyjs-left-section-navigation-design.md` | Approved SurveyJS UX design for Side Navigation / Table of Contents, progress bar, mobile fallback, section labels, draft resume, and validation markers. |
| `DataModelConcepts.md` | Plain-language explanation of the core entities: household, member, eligible woman, pregnancy, birth outcome, child, form response, tasks, sync, corrections, and data-quality flags. |
| `schedules-and-survival-data-model.md` | Minimal model for schedule rules, schedule tracks, scheduled events, observed events, and wide survival-analysis risk-period tables. |
| `Follow-up-windows.md` | Follow-up timing rules: anchor date, window start, on-time window, target date, deadline, missed rules, HRF/PFF/NFF/VA windows, and open protocol decisions. |
| `form-field-event-rules.md` | Compact mapping from form field plus value to typed observed event and track start/stop effect. |
| `audit_log_policy.md` | Field-level submitted-form edit audit policy: one row captures edited, approved, or rejected lifecycle for a proposed field edit. |
| `Edit-Escalations.md` | Fields whose edits affect identity, eligibility, outcomes, or downstream schedules and therefore require higher review/approval. |
| `Indicators.md` | Monitoring and reporting indicators, including denominators, filters, and submission review list fields. |
| `2026-06-05-discussions.md` | Site-investigator discussion notes. These are working inputs until promoted into the architecture or policy documents above. |
| `progress.md` | Implementation progress tracker and current status notes. |

## Rule Stack

Follow this rule order when documents overlap:

1. Current source questionnaire PDFs and the forms summary table in `Refs/pretesing forms/`.
2. `Refs/FLOW.md` and `Refs/Unique_Ids.md` for canonical flow and identity rules.
3. Main architecture spec in `docs/superpowers/specs/`.
4. Specific policy files in this folder.
5. Discussion notes, only after promotion into a policy/spec document.

## Core Rules

- SurveyJS JSON is only the rendering layer and raw submitted evidence.
- Form drafts are mutable working records stored separately from immutable submitted form responses.
- Drafts stay local on the field device; only finalized forms are uploaded.
- SurveyJS form screens use Side Navigation / Table of Contents derived from pages or section metadata, not from individual question labels, plus a progress bar.
- Do not use `answers_json` / JSONB for transactional analysis, scheduling, reporting, or survival analysis.
- Promote workflow-driving form fields into typed domain tables or `observed_events`.
- Forms open from scheduled events; do not add a global open-any-form workflow.
- Scheduled events store concrete dates and link to the form submission that completed them.
- Observed events record what actually happened to a household, woman, pregnancy, birth outcome, or child.
- Rule changes can update future uncompleted scheduled events, not completed history.
- Approved corrections update typed state and may recalculate future schedules, while original form submissions remain immutable.
- Survival analysis uses derived wide `analysis_risk_periods`, built from typed domain records and observed events.

## Current Minimal Model

```text
Subjects
  households
  household_members
  eligible_women
  pregnancies
  birth_outcomes
  children

Evidence and operations
  form_submissions
  schedule_rules
  schedule_tracks
  scheduled_events
  observed_events

Review and analysis
  form_submission_field_audit_log
  analysis_risk_periods
```

## Promotion Rule

Discussion notes become implementation rules only when they are added to one of the policy/spec documents above.
