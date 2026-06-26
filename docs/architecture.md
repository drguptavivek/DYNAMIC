# DYNAMIC Architecture

This is the single agreed architecture for DYNAMIC. It reflects the current code direction: an offline-first Expo field app, an authoritative Node/Postgres backend, a Vite admin app, and shared TypeScript workflow/event packages.

Older architecture drafts, audits, and working notes are archived under `docs/archive/`. They are evidence of prior thinking, not current rules. Do not create active DYNAMIC policy docs under `docs/superpowers/`; use `docs/policies/` or this file.

## Rule Precedence

When documents overlap, use this order:

1. Protocol source material in `Refs/`: source questionnaire PDFs, the forms summary table, `Refs/FLOW.md`, and `Refs/Unique_Ids.md`.
2. This architecture document.
3. Active policy docs in `docs/policies/`.
4. Current code and tests when documenting implemented behavior.
5. Archived docs only as background.

If code and this document disagree, do not silently follow either. Treat it as architecture drift: inspect the code path, decide whether code or docs should move, and update the relevant active doc with the fix.

## System Surfaces

| Surface | Role |
| --- | --- |
| `expo-prototype` | Offline-first field app. Stores local tasks, drafts, finalized form responses, provisional events/projections, and sync state. |
| `apps/api` | Authoritative backend. Authenticates users, enforces area scope, ingests finalized evidence, classifies events, updates projections, writes tasks, and serves sync/admin APIs. |
| `apps/admin` | Central review/admin UI for tasks, data quality, corrections, users, masters, and operational monitoring. |
| `packages/event-core` | Shared event/reducer kernel. Backend and Expo should converge here for field-originated domain behavior. |
| `packages/shared-workflow` and other `packages/shared-*` | Shared workflow, task, ID, and domain helpers. Do not fork equivalent backend and Expo rules. |
| Postgres | Backend source of truth for evidence, events, projections, users, tasks, sync logs, and admin review. |
| Redis / Nginx edge | Local runtime support for the API/admin/Expo development surface. |

The high-level diagram is visual support only: `docs/architecture-high-level.drawio` and exported PNGs. The diagram must not introduce rules that are absent from this document or `docs/policies/`.

## Core Model

DYNAMIC uses immutable evidence plus derived operational projections.

Authoritative evidence and events:

- finalized form responses
- domain events derived from accepted evidence
- task lifecycle and attempt events
- workflow decision events
- admin correction events
- data-quality flags
- sync ingest records

Derived projections:

- households
- household members
- eligible women
- pregnancies
- ultrasound records
- pregnancy outcomes
- birth outcomes and children
- follow-up tasks and current task state
- household-level projection/replay state

Rules:

- SurveyJS JSON is a rendering layer and raw evidence payload, not the longitudinal data model.
- `answers_json` can be stored as immutable evidence, but workflow, routing, reporting, scheduling, and analysis values must be promoted into typed state.
- Projection tables are query/worklist models. They must be rebuildable from accepted evidence/events and current rules.
- No new code should directly treat `form_response -> mutate many unrelated tables -> mark task completed` as the architecture. Promotion must move toward classification, events, reducers, workflow decisions, and projections.

## Event And Workflow Direction

The target path for field-originated work is:

```text
finalized evidence
  -> classify primary / duplicate / invalid / held
  -> append typed domain or task event
  -> apply shared reducer to projection
  -> run shared workflow generator
  -> write deterministic tasks and data-quality flags
  -> sync/admin review surfaces
```

Backend and Expo use the same event semantics for field-originated study events. Expo may apply provisional local state for offline continuity; the backend is authoritative after sync.

Shared code must stay pure where it encodes study rules. Runtime-specific code supplies storage, auth/scope, transactions, clocks, IDs, HTTP, and UI state around the shared kernel.

Finalized field submissions trigger cohort events through `@dynamic/event-core`, not through backend-only or Expo-only form handlers. The shared trigger contract is:

```text
finalized form response + cohort/task context
  -> shared form-submission trigger
  -> canonical domain event
  -> event-owned projection/workflow outputs
```

Current field-originated trigger ownership:

| Form | Canonical event |
| --- | --- |
| HHQ | `household_baseline_confirmed` |
| WQ | `wq_completed` |
| PEF | `pregnancy_enrolled` |
| PFF | `pregnancy_followup_completed` |
| POF | `pregnancy_outcome_recorded` |
| BAF | `birth_assessment_completed` |
| CDF | `child_death_recorded` |
| VA | `verbal_autopsy_completed` |

Form schemas may keep evolving while source PDFs are finalized. That does not change the cohort event boundary. Field-name extraction for event payloads belongs in the shared trigger layer; backend and Expo callers provide finalized evidence plus known cohort context and then store the returned event, projection, task descriptors, and flags through their own adapters.

## Form Lifecycle

Drafts are local recovery state. Finalized responses are evidence.

- Drafts stay local, are overwriteable, and never promote domain state.
- Final confirmation creates one immutable local response with sync metadata.
- Expo can locally promote finalized evidence into provisional household/task/workflow state so field work continues offline.
- Sync pushes finalized evidence and provisional events, not arbitrary projection-table edits as the source of truth.
- Backend stores immutable evidence first, classifies it, then applies authoritative event/projection/workflow logic.
- Pull reconciliation uses stable response IDs, task keys, server commit sequence, and provenance. Pull must not overwrite newer unsynced local evidence.

See [Form lifecycle and sync policy](policies/form-lifecycle-and-sync.md).

Detailed form UX policies:

- [Form drafts and autosave](policies/form-drafts-and-autosave.md)
- [Form preview and final submit](policies/form-preview-and-final-submit.md)
- [Survey navigation and progress](policies/survey-navigation-and-progress.md)

## Identity And Cohort

Canonical identity:

```text
household_id = site_id-locality_code-structure_map_id-household_number
person_id / household_member_id = household_id-member_number
```

Current format:

```text
1-02-0042-03
1-02-0042-03-01
```

Rules:

- Baseline HHQ validates/enrolls households from the mapped frame.
- Do not create arbitrary households outside assigned mapped areas.
- Future visits are only for households enrolled at baseline.
- Empty, vacant, or not-occupied baseline households remain outside follow-up.
- Household splits keep the original `household_id`; no split event or new analytic household number.
- Temporary visitors are not roster members and must not become eligible from that household.
- Notes are field context only. Do not use notes for analysis, routing, eligibility, skip logic, or cohort definition.

See [Cohort and identity policy](policies/cohort-and-identity.md).

## Tasks And Scheduling

Forms open from scheduled tasks or valid contextual trigger buttons. There is no global open-any-form workflow.

Rules:

- Workflow generation must be deterministic.
- Task keys include household, subject, task type, protocol visit label, target date, and rules version.
- HRF anchors to HHQ baseline completion.
- PFF anchors to PEF completion or accepted pregnancy enrollment date.
- NFF anchors to birth date or accepted birth outcome date.
- VA anchors to stillbirth or child death date plus 30 days.
- Late completion does not shift future anchors.
- Repeated scheduled series complete the current due task only; missed old rounds are not backfilled as if they happened on time.
- VA tasks can be generated and visible, but field opening remains disabled until VA SurveyJS JSON exists.
- Failed-attempt limits are task-type rules. After the limit, ask for final close reason; do not auto-close.

See [Workflow and scheduling policy](policies/workflow-and-scheduling.md).

## Questionnaire Rules

Source questionnaire PDFs and the forms summary table control questionnaire content. Implementation docs control architecture and storage.

Rules:

- Do question-by-question PDF comparison before questionnaire JSON changes.
- Preserve PDF `Variable ID` in SurveyJS `sourceCode`.
- Use form-prefixed analysis-safe keys only where global answer-key uniqueness is needed.
- Labels contain question text only. Put instructions, probes, skip notes, hints, and auto-fill notes in metadata, description, validation, or app logic.
- Numeric boxes are numeric/text inputs, not radio choices.
- `RECORD ALL` / `ANSWER UP TO` fields are checkboxes unless the PDF defines one coded response.
- Auto-filled lineage/core fields are read-only with explicit source metadata.

See [Questionnaire authoring policy](policies/questionnaire-authoring.md).

See [App surfaces and routes policy](policies/app-surfaces-and-routes.md) for field/admin/API route contracts.

## Admin Corrections And Data Quality

Admin corrections are backend/admin events. Expo does not originate correction, approval, central arbitration, user-management, role-management, or master-data mutation events.

Rules:

- Corrections never edit raw submitted evidence.
- Approved corrections update typed projected state and may recalculate future uncompleted tasks.
- Identity, eligibility, outcome, death, stillbirth, and scheduling-impacting corrections require downstream recalculation or central review.
- Duplicate offline task completions are valid evidence. The first valid completion closes operational state; later completions are duplicate evidence and data-quality flags.
- Backend area scope is enforced from server-known user assignments and stored subject/task records, not from client-controlled `answers_json` alone.

See [Admin corrections and data-quality policy](policies/admin-corrections-and-data-quality.md).

See [Auth, device, and role-scope policy](policies/auth-device-and-role-scope.md) for login, token, device, and role boundaries.

## Verification Gates

The architecture is not stable until tests cover:

- duplicate offline completion: one primary, one duplicate evidence, one DQ flag, one projection promotion
- idempotent retry of the same response
- area-scoped pull and push
- HHQ baseline response through household/member/WQ/HRF task generation
- WQ -> PEF -> PFF -> POF -> BAF -> NFF/CDF/VA workflow anchors and deterministic task keys
- fractional NFF labels: 4.5m, 7.5m, 10.5m
- VA disabled enforcement
- failed-attempt final-close flow
- admin correction recalculation
- projection rebuild equivalence
- backend and Expo shared fixture parity for event/reducer/workflow behavior

Use [Testing](testing.md) for command order and DB caveats.
