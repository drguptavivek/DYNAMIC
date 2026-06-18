# DYNAMIC Architecture

This document is the working system-design overview for agents. Keep durable design constraints here; keep one-off session history in `session-log-archive.md`.

## System Shape

- Turborepo monorepo with TypeScript/Node API, Vite React admin, Expo Android/web field app, shared packages, Postgres, Redis, and Nginx edge.
- Field app is offline-first. It stores local tasks, form responses, provisional domain events, and provisional projections in SQLite/local storage.
- Backend is authoritative. It ingests immutable evidence, applies event rules, rebuilds projections, handles admin corrections, flags data-quality issues, and serves canonical pull state.
- SurveyJS is the questionnaire rendering layer only. It must not become the core longitudinal data model.

## Core Packages And Apps

- `packages/event-core`: shared event envelopes, household reducers, task lifecycle rules, and workflow orchestration. Backend and Expo must use compatible event semantics.
- `apps/api`: authoritative sync API, form-response ingest, event persistence, replay/rebuild, task generation, admin corrections, data-quality flags, auth, and pull endpoints.
- `apps/admin`: Vite React admin workflows, including review/corrections and data-quality surfaces.
- `expo-prototype`: field app prototype for offline worklists, SurveyJS forms, local persistence, provisional events/projections, and sync.
- `packages/shared-workflow` and related shared packages: common task/workflow logic that should not be forked separately in API and Expo.

## Data Model Principles

- Immutable evidence: form responses and domain events are retained even when duplicate or later rejected operationally.
- Operational projections: households, members, eligible women, pregnancies, children, and tasks are rebuildable from evidence/events plus current rules.
- Duplicate offline task completions are accepted as evidence. The first valid completion closes operational state; later completions are marked duplicate and produce data-quality flags.
- Admin corrections are audited events and must trigger immediate rule/projection recalculation.
- Notes are field context only. Do not use notes for analysis, routing, eligibility, skip logic, or cohort definition.

## Sync Model

- Pull is area scoped by assigned village/colony/locality, not by individual household assignment.
- Push accepts field-originated form responses, attempts, task updates, and domain-event evidence.
- Field app may create deterministic local tasks and provisional events offline, but forms open only from scheduled tasks or valid contextual trigger buttons.
- Backend returns canonical state; Expo reconciles local provisional state during sync.

## HHQ Event/Replay Baseline

- HHQ baseline confirmation creates immutable evidence and a `household_baseline_confirmed` event.
- Backend first valid HHQ completion applies household/member/eligible-woman/task projections.
- Later HHQ completions for the same household are `held_duplicate`, do not mutate projections, and create data-quality flags.
- Household replay rebuilds core HHQ projection fields from applied HHQ baseline events plus immutable form-response evidence.
- Expo HHQ local submission writes provisional baseline events into `domain_events_outbox`.

## Scheduling Rules

- Repeated scheduled series use the current due task only; do not backfill missed HRF, PFF, or NFF rounds as if they occurred on time.
- HRF is anchored to HHQ baseline completion; late HRF completion must not shift future HRF dates.
- PFF is anchored to PEF/pregnancy enrollment; late PFF completion must not shift future PFF dates.
- NFF uses protocol visit labels and calendar-month scheduling.
- VA tasks are generated 30 days after stillbirth or child death and remain disabled until VA SurveyJS JSON exists.
- Failed-attempt limits are task-type rules; after the configured number, prompt field user to close with final reason rather than auto-closing.

## Identity And Cohort Rules

- Household identity: `site_id + locality_code + structure_map_id + household_number = household_id`.
- Person identity: `household_id + member_number = household_member_id/person_id`.
- Baseline HHQ validates/enrolls households from the mapped frame. Do not create arbitrary new households.
- Future visits are only for households enrolled at baseline. Empty/vacant/not-occupied baseline households stay out.
- Household splits keep the original `household_id`; do not create split events or new analytic household numbers.
- Temporary visitors are not roster members and must not become eligible from that household.

## Key Policy Sources

- [Event architecture](event-driven-architecture-policy.md)
- [Form field event rules](superpowers/form-field-event-rules.md)
- [Offline/mobile save-sync policy](surveyjs/Mobile-save-sync-policy.md)
- [Full-stack offline architecture spec](superpowers/specs/2026-06-03-dynamic-fullstack-offline-architecture-design.md)
- [Follow-up windows](superpowers/Follow-up-windows.md)
- [Indicators](superpowers/Indicators.md)
- [Workflow flow](../Refs/FLOW.md)
- [Unique IDs](../Refs/Unique_Ids.md)
- [Site interviewers workplan indicators](../Refs/site_interviewers_workplan_indicators.md)
