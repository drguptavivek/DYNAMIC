# Handoff: Offline Events, Issues, And Architecture Review

## Next Session Focus

Continue from the architecture review of DYNAMIC's offline data collection, event-driven workflow, Task Worklist, Issue Worklist, and correction/revisit model. The likely next step is to pick one deepening candidate from the report and grill/design it before implementation.

## Current State

- Domain glossary was added at `CONTEXT.md`.
- ADRs were added under `docs/adr/` for online Resolution Proposals, preserving Form Submissions, Issue resolution/Correction Events, and admin-originated Correction Events.
- Active policy updates were made in:
  - `docs/policies/admin-corrections-and-data-quality.md`
  - `docs/policies/form-lifecycle-and-sync.md`
  - `docs/policies/workflow-and-scheduling.md`
- Architecture review report was copied into the repo at:
  - `.planning/codebase/architecture-review-20260627-013725.html`

Do not treat `.planning/codebase/architecture-review-20260627-013725.html` as canonical architecture. It is a review artifact. Canon remains `docs/architecture.md` plus active policy docs in `docs/policies/`.

## Architecture Review Summary

The report proposes six deepening candidates:

1. Deepen accepted event application.
2. Make the Expo Task store a real adapter seam.
3. Deepen backend Finalized Response ingest.
4. Add an Issue resolution module.
5. Deepen Task generation rules.
6. Collapse the duplicate workflow orchestration seam.

Top recommendation in the report is candidate 1: deepen accepted event application. Rationale: it concentrates Form Submission promotion, event persistence, projection replay, Task generation, and Workflow Issue pressure into one module seam.

## Key Constraints

- `docs/architecture.md` is the single agreed architecture.
- Active policy docs belong in `docs/policies/`.
- Do not create new active policy docs under `docs/superpowers/`.
- Offline field app can originate ordinary Provisional Events, but Correction Events are admin/backend-originated only.
- Issues are not Tasks, though Issue Views may appear beside Task Worklists.
- Resolution Proposals are online/admin-originated and edited by Local Data Managers only.
- Central Data Managers approve, reject, or return proposals to Local Data Managers; they do not edit proposals.
- Manager comments are hidden from field staff; field staff see status, their own comments, system/status messages, relevant field-action history, and decision outcomes affecting their work.

## Suggested Skills

- `improve-codebase-architecture`: if continuing from the HTML report and choosing a deepening candidate.
- `grilling`: for one-question-at-a-time design of the chosen candidate.
- `domain-modeling`: if new domain terms or durable decisions emerge.
- `codebase-design`: if designing the interface for a deepened module.
- `implement`: only after the chosen module interface and sequencing are settled.

## Verification Already Done

- `git diff --check` passed after the policy/glossary/ADR edits.
- Stale wording scan was run for terms like `sent back`, `modify proposed`, and blocking config language.
- No app tests were run because the completed work was documentation and architecture review.

## Open Work

- Choose which architecture-review candidate to explore.
- If candidate 1 is selected, start by comparing current backend promotion modules, projection replay, task writing, and event-core promotion output.
- Keep any implementation plan grounded in the report and current code, not only the new policies.
