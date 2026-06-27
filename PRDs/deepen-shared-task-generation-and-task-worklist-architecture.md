# PRD: Deepen Shared Task Generation And Task Worklist Architecture

GitHub issue: https://github.com/drguptavivek/DYNAMIC/issues/1

## Problem Statement

DYNAMIC needs clean, shared code for events, Tasks, workflow, and scheduling. The current architecture and policy docs define a single event-driven path: Finalized Responses become typed events, shared reducers update cohort state, and shared workflow rules generate deterministic Tasks. The code is partly aligned, but Task generation and local Task Worklist behavior are still too shallow and scattered.

From the user's perspective, this creates risk in the most important offline-first workflow: backend and Expo can drift, protocol scheduling rules are harder to reason about, task lifecycle rules can be bypassed, and workflow behavior is difficult to verify through one high-level seam. The desired outcome is not more abstractions; it is cleaner code where events own event meaning, Task generation owns scheduling and descriptor construction, Task Worklists own local actionable work, and storage adapters only persist results.

## Solution

Create a deeper shared Task generation module as the primary seam for workflow and scheduling. It should accept accepted or provisional domain event facts plus the relevant projection snapshot and protocol configuration, then return deterministic Task descriptors and workflow decisions. Event modules should stop assembling full Task rows themselves. Backend and Expo should both consume the same Task generation output.

Support that with a Task Worklist module in Expo that owns the merged local view of backend-confirmed Tasks and Provisional Tasks. UI, questionnaire finalization, and sync should talk to Task Worklist operations rather than directly coordinating task rows, attempts, responses, provisional events, pregnancies, eligible women, and sync metadata.

Finally, route task attempts and task completion through the existing shared task lifecycle rules so local field behavior and backend sync behavior follow the same allowed transitions.

## User Stories

1. As a field worker, I want my Task Worklist to show the same current work offline and after sync, so that I can trust what work needs attention next.
2. As a field worker, I want a Finalized Response to create the correct Provisional Tasks offline, so that I can keep working without waiting for network connectivity.
3. As a field worker, I want duplicate or held submissions to avoid creating actionable workflow Tasks, so that I am not sent to do work based on evidence that has not been accepted.
4. As a field worker, I want failed attempts to follow the study's task lifecycle rules, so that final close reasons appear only when appropriate.
5. As a field worker, I want task completion to require the correct accepted response, so that accidental or duplicate submissions do not silently close protocol work.
6. As a field worker, I want protocol Tasks to keep stable labels and dates, so that I can understand what visit I am performing.
7. As a field worker, I want locally generated Tasks to reconcile cleanly with backend-confirmed Tasks, so that the same work is not shown twice after sync.
8. As a field worker, I want withdrawn or superseded provisional work to stop appearing as actionable work, so that my worklist remains clear.
9. As a field worker, I want forms opened from Tasks and forms opened from valid contextual opportunities to finalize through the same path, so that workflow behavior is predictable.
10. As a field worker, I want protocol dates to behave as calendar dates, so that scheduling does not shift because of timezone conversion.
11. As a field worker, I want event-triggered Tasks such as ultrasound, birth assessment, child death, and verbal autopsy work to appear from the same workflow rules as scheduled follow-up Tasks, so that the app behaves consistently.
12. As a field worker, I want disabled Tasks to explain why they cannot be opened, so that I know when required form definitions or context are missing.
13. As a field worker, I want repeated series to show current due or next needed work rather than a wall of future actionable Tasks, so that I can focus on today's protocol work.
14. As a Local Data Manager, I want held, duplicate, rejected, or conflicting evidence to create Issues rather than hidden sync failures, so that review work is visible.
15. As a Local Data Manager, I want Task Worklists and Issue Worklists to remain distinct, so that protocol field work is not confused with review work.
16. As a Local Data Manager, I want provisional offline work to be traceable to the Finalized Response that produced it, so that I can audit why a Task appeared.
17. As a Central Data Manager, I want accepted backend events to be authoritative after sync, so that confirmed cohort state drives workflow.
18. As a Central Data Manager, I want backend classification to decide primary, duplicate, invalid, or held status before Tasks are generated, so that workflow follows accepted evidence.
19. As a Central Data Manager, I want Approved Resolutions and Correction Events to remain backend/admin-originated, so that offline field submissions do not rewrite authoritative corrections.
20. As a developer, I want one shared Task generation module, so that adding or changing protocol scheduling rules does not require edits across multiple event modules and adapters.
21. As a developer, I want event modules to expose event meaning and projection facts rather than full Task row construction, so that event code remains focused and deeper.
22. As a developer, I want Task key construction to live in one shared place, so that backend and Expo produce identical deterministic keys.
23. As a developer, I want Task generation to own target dates, windows, deadlines, mode rules, attempt disposition, form availability, action state, and provenance, so that storage adapters do not need scheduling knowledge.
24. As a developer, I want backend and Expo tests to assert the same Task descriptors from the same event inputs, so that parity regressions are caught early.
25. As a developer, I want the Expo Task Worklist module to hide local persistence details, so that UI, sync, and questionnaire code do not coordinate row-level mutations.
26. As a developer, I want the Task Worklist module to own reconciliation of backend-confirmed Tasks and Provisional Tasks, so that sync behavior has one place to evolve.
27. As a developer, I want local SQLite and web-test storage to be adapters behind the Task Worklist module, so that tests do not force production storage shape into every caller.
28. As a developer, I want task attempts and task completion to use the shared lifecycle evaluator, so that lifecycle rules are not reimplemented in UI or repositories.
29. As a developer, I want workflow orchestration either to carry real workflow depth or to be simplified, so that the code does not have a shallow pass-through layer.
30. As a developer, I want form-specific field extraction to stay behind the shared finalized-response promotion interface, so that backend and Expo do not grow separate form event builders.
31. As a developer, I want per-form extraction adapters only when the trigger layer becomes too large, so that cleanup follows real pressure rather than speculative structure.
32. As a developer, I want tests to exercise high-level behavior rather than internal helper calls, so that future refactors can improve module shape without breaking brittle tests.
33. As a protocol owner, I want HRF, PFF, NFF, VA, and event-triggered task rules to be versioned and deterministic, so that study workflow can be audited.
34. As a protocol owner, I want late completion not to shift future anchors, so that protocol timing remains stable.
35. As a protocol owner, I want missed, cancelled, superseded, and disabled states to be explicit, so that operational reports can distinguish why work did not proceed.

## Implementation Decisions

- Build or deepen a shared Task generation module as the primary interface for events, workflow, and scheduling.
- The Task generation module will be the highest testing seam for this work. The fewer lower-level seams added, the better.
- Event modules will own event payload meaning, projection application, and event-specific domain facts. They will not own repeated descriptor assembly for Task rows.
- Task generation will own deterministic Task key construction, protocol visit labels, anchor dates, valid windows, on-time windows, target dates, deadlines, rules version, generation source, source event provenance, mode rules, failed-attempt disposition, form availability, action state, and disabled reason.
- Backend and Expo callers will adapt persistence only. They will not maintain separate scheduling rules or form-specific field-to-event builders for the same field-originated event.
- The existing finalized-response promotion interface remains the entry point for turning Finalized Responses into events, projections, Task descriptors, and data-quality outputs.
- Form-specific field extraction may move behind per-form adapters later, but the public promotion interface should remain small and shared.
- Create or deepen an Expo Task Worklist module that owns backend-confirmed Tasks, Provisional Tasks, pending Finalized Responses, Provisional Events, task attempts, and local reconciliation behavior at the worklist level.
- The Task Worklist module will expose worklist-level operations to UI, questionnaire finalization, and sync. It will hide row-level storage choreography.
- SQLite and web-test/local storage will be adapters behind the Task Worklist module.
- Task Worklist reconciliation will use stable response IDs, task keys, event IDs, server commit sequence, device sequence, and provenance. It will not use arbitrary local projection table edits as source of truth.
- Local Expo promotion may produce provisional work, but backend-confirmed state remains authoritative after sync.
- Provisional Tasks that are superseded or withdrawn after sync should leave the actionable Task Worklist but remain traceable through Form Submission, Issue, and event history.
- Task attempts and task completion will route through the shared task lifecycle evaluator.
- Completing a Task requires a primary accepted response or another explicit lifecycle transition allowed for that Task type.
- Failed attempts must increment and prompt for final close reason according to shared lifecycle rules, without UI-specific reimplementation.
- Held, duplicate, invalid, or rejected evidence must not generate workflow Tasks.
- Held, duplicate, invalid, rejected, or conflicting evidence that needs human handling should create or update Issues.
- Workflow orchestration should either become the module that turns accepted event facts into workflow decisions by calling Task generation, or be simplified if it remains a shallow pass-through.
- Protocol dates remain `YYYY-MM-DD` calendar dates and must not be converted to UTC instants for scheduling.
- No hidden wall-clock anchors should exist inside workflow generation. Device time is audit/fallback metadata, not scheduling authority.
- The work should respect the existing domain language: Task, Provisional Task, Finalized Response, Provisional Event, Task Worklist, Workflow Issue, Issue, Approved Resolution, and Correction Event.
- The work should not introduce a second active architecture or policy document. Durable rules belong in the existing architecture and policy canon if documentation updates are needed.

## Testing Decisions

- Tests should assert external behavior: given accepted or provisional event facts, projection snapshot, and protocol configuration, the shared workflow path returns the expected Task descriptors and lifecycle decisions.
- Tests should avoid asserting internal helper calls or storage implementation details.
- The primary test seam is shared Task generation. It should prove deterministic Task keys, dates, windows, rules version, form availability, action state, and provenance for representative event types.
- Existing event-core reducer and orchestration tests are prior art for shared kernel behavior.
- Existing shared workflow schedule-rule tests are prior art for protocol labels and date calculations.
- Existing Expo questionnaire and sync workflow tests are prior art for offline finalization, provisional events, pending push records, and reconciliation summaries.
- Add parity tests showing backend and Expo callers receive the same Task generation output from the same event facts and projection snapshot.
- Add task lifecycle tests or integration coverage showing field attempts, final close reason prompting, task opening, primary completion, duplicate completion rejection, disabled tasks, and terminal task handling.
- Add Expo Task Worklist tests at the worklist operation seam, not by asserting individual row writes across multiple local tables.
- Add sync reconciliation tests showing confirmed backend Tasks collapse matching Provisional Tasks and leave no duplicate actionable work.
- Add tests showing held, duplicate, invalid, or rejected Finalized Responses do not generate actionable Tasks and do create or preserve review visibility through Issues when needed.
- Add date tests that use calendar dates and cover fractional NFF labels, PFF monthly labels, VA target behavior, and non-shifting anchors after late completion.
- Run the smallest relevant package checks while implementing, then run the existing event-core, API, and Expo regression set before calling the PRD complete.

## Out of Scope

- New clinical protocol decisions or changes to the actual study schedule unless required to preserve existing policy.
- New admin Issue resolution UX beyond preserving and routing Workflow Issues correctly.
- New Correction Event policy. Correction Events remain backend/admin-originated.
- Rewriting all form extraction at once. Per-form adapters are allowed when needed, but the first goal is Task generation and Task Worklist depth.
- Broad database migration churn unless schema changes are strictly required.
- Creating new active policy documents outside the existing architecture and policy canon.
- Replacing the entire sync system. This PRD narrows sync work to Task Worklist reconciliation and lifecycle-consistent push/pull behavior.
- Styling or redesigning the field UI except where needed to consume the Task Worklist module.

## Further Notes

- This PRD is derived from the architecture review focused on events, tasks, workflow, and scheduling.
- The strongest implementation order is: shared Task generation first, Expo Task Worklist second, task lifecycle routing third, then form trigger extraction cleanup only if pressure remains.
- The main architectural goal is depth: one small interface should hide scheduling, descriptor construction, task lifecycle decisions, and reconciliation complexity from callers.
- The project has no production data constraint noted in prior architecture discussions, so compatibility should not override making the event/workflow path clean and canonical.
