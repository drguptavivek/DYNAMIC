# Codebase Concerns

**Analysis Date:** 2026-06-19

## Tech Debt

**Sync ingest is not an atomic event/projection pipeline:**
- Issue: `POST /api/v1/sync/push` stores each `form_response`, calls `processFormResponse`, then separately marks the task complete. On promotion failure it deletes the response, but domain/projection/task writes created before the failure are not wrapped in a single DB transaction.
- Files: `apps/api/src/routes/sync.ts`, `apps/api/src/services/eventProcessor.ts`, `apps/api/src/services/taskWriter.ts`, `apps/api/src/db/schema/visits.ts`, `apps/api/src/db/schema/events.ts`, `apps/api/src/db/schema/tasks.ts`
- Impact: Partial promotion can leave domain events, projections, tasks, data-quality flags, or task status inconsistent with immutable evidence. This conflicts with `docs/architecture.md` and `docs/policies/form-lifecycle-and-sync.md`, which require evidence classification, event application, workflow decisions, and DQ flags to commit atomically per accepted record.
- Fix approach: Move form-response ingest, classification, domain event append, projection updates, task generation, task lifecycle transition, sync log update, and DQ flag writes into one transaction. Keep the form response as immutable evidence and record `invalid_rejected` / `held_for_review` rather than deleting accepted input after partial work.

**Backend promotion still mixes legacy projection mutation with event-core reducers:**
- Issue: `processFormResponse` dispatches directly into large per-form mutators. Some paths use `@dynamic/event-core` reducers (`PEF`), while others mutate tables and call `@dynamic/shared-workflow` helpers directly (`HHQ`, `WQ`, `PFF`, `POF`, `BAF`, `NFF`, `CDF`). `SBF` has an empty handler.
- Files: `apps/api/src/services/eventProcessor.ts`, `packages/event-core/src/workflow-orchestration.ts`, `packages/shared-workflow/src/task-generators.ts`
- Impact: Backend behavior can diverge from the target architecture in `docs/architecture.md`: finalized evidence should classify into typed events, reduce projections, then run shared workflow generation. The mixed path makes projection rebuild equivalence and backend/Expo parity difficult to prove.
- Fix approach: Promote each form through typed event envelopes and shared reducers first. Replace direct table mutation with reducer output persistence. Remove empty form handlers by marking unsupported forms as disabled/held or implementing their event path.

**Expo local workflow forks backend/shared workflow logic:**
- Issue: Expo creates local HHQ/WQ/PEF tasks, pregnancy projections, and domain events inside `questionnaireSubmissionRepository.js` instead of using `packages/event-core` and `packages/shared-workflow`. It also has a separate older event generator in `eventGenerators.js`.
- Files: `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`, `expo-prototype/src/modules/events/eventGenerators.js`, `expo-prototype/src/modules/sync/syncWorkflow.js`, `packages/event-core/src/index.ts`, `packages/shared-workflow/src/task-generators.ts`
- Impact: Local offline task keys, event names, rules versions, and task statuses can drift from backend authority. A task-backed form can emit both a form response and an older domain event type, while backend `processFormResponse` already promotes the form response.
- Fix approach: Route Expo finalization through shared event/reducer/workflow functions for field-originated domain behavior. Delete or isolate legacy event names (`household_enrolled`, `form_submitted`, etc.) from push sync unless there is a typed backend handler.

**Task lifecycle states are translated inconsistently:**
- Issue: Backend policy uses lifecycle states such as `planned`, `due`, `completed_on_time`, `completed_late`, `closed_final_reason`, and `disabled`, while Expo local storage stores `open` / `completed`. Sync maps backend terminal states into Expo `completed`, losing detail.
- Files: `apps/api/src/routes/sync.ts`, `apps/api/src/db/schema/tasks.ts`, `expo-prototype/src/modules/tasks/taskSchema.js`, `expo-prototype/src/modules/tasks/taskRepository.js`, `packages/event-core/src/task-lifecycle.ts`
- Impact: Offline UI cannot reliably distinguish missed, cancelled, superseded, disabled, late, or closed-final-reason tasks. This weakens the task lifecycle rules in `docs/policies/workflow-and-scheduling.md`.
- Fix approach: Keep canonical lifecycle state in local SQLite and derive display labels separately. Use `packages/event-core/src/task-lifecycle.ts` for field/backend/admin transitions instead of direct status assignment.

**Admin corrections bypass the correction event model:**
- Issue: Correction routes write a simple `admin_corrections` row and directly update selected household/member fields. The richer `admin_correction_events` schema exists separately but is not used by the route.
- Files: `apps/api/src/routes/corrections.ts`, `apps/api/src/db/schema/corrections.ts`, `apps/api/src/db/schema/sync-auth.ts`, `docs/policies/admin-corrections-and-data-quality.md`
- Impact: Corrections lack review state, source references, recalculation triggers, and downstream rebuild/hold logic for identity, eligibility, outcome, and scheduling-impacting fields.
- Fix approach: Store corrections as typed admin correction events with actor, reason, old/new values, source reference, review state, and recalculation decision. Apply approved corrections through projection rebuild/recalculation rather than direct field patches.

**Large files concentrate unrelated responsibilities:**
- Issue: Several files combine UI orchestration, storage, workflow generation, sync, and validation logic in single modules.
- Files: `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`, `apps/api/src/services/eventProcessor.ts`, `expo-prototype/src/modules/households/HouseholdModule.js`, `expo-prototype/src/modules/households/householdRepository.js`, `packages/shared-workflow/src/task-generators.ts`, `apps/api/src/routes/sync.ts`
- Impact: Small changes to form finalization, promotion, sync, or task rules have broad blast radius and are hard to test surgically.
- Fix approach: Split pure mapping/rules from persistence and UI state. Keep shared study rules in packages, API transaction code in services, and React components focused on presentation and flow state.

## Known Bugs

**Children locality filter uses the wrong column:**
- Symptoms: `GET /api/v1/children?locality_code=...` filters `children.household_id` by the locality code instead of filtering through locality/site scope.
- Files: `apps/api/src/routes/children.ts`, `apps/api/src/db/schema/children.ts`, `docs/policies/app-surfaces-and-routes.md`
- Trigger: Call the children list route with a valid `locality_code`; records from that locality are omitted unless a child household ID literally equals the locality code.
- Workaround: Filter by `site_id` or search manually until the route applies locality through `children.site_id` plus household join/locality.

**Fractional NFF target dates do not match active policy:**
- Symptoms: The active policy says NFF `4.5m`, `7.5m`, and `10.5m` map to day offsets of 135, 225, and 315 days. `generateNffSchedule` passes fractional month values into `addCalendarMonths`, which truncates to whole calendar months in JavaScript date arithmetic.
- Files: `packages/shared-workflow/src/schedule-rules.ts`, `packages/shared-workflow/src/__tests__/schedule-rules.test.ts`, `docs/policies/workflow-and-scheduling.md`
- Trigger: Generate NFF schedules for a birth date; label tests pass, but target dates for fractional month visits are too early.
- Workaround: None in code. Use explicit day offsets for fractional NFF labels and add exact target-date assertions.

**Data Quality admin page does not load flags:**
- Symptoms: The page initializes `flags` as an empty array and defines review/resolve handlers, but no effect calls the API to fetch the flag list.
- Files: `apps/admin/src/pages/DataQualityPage.tsx`, `apps/api/src/routes/data-quality.ts`, `docs/policies/app-surfaces-and-routes.md`
- Trigger: Navigate to `/data-quality`; the UI can show an empty state even when `GET /api/v1/data-quality-flags` returns flags.
- Workaround: Use the API directly or inspect the DB until the page fetches and refreshes flags.

**Read-only SurveyJS enforcement misses nested questions:**
- Symptoms: `applyReadOnlyFields` only walks top-level page elements. Nested panel and matrix questions can remain editable even when policy requires read-only auto-filled lineage/core fields.
- Files: `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`, `docs/policies/questionnaire-authoring.md`
- Trigger: Open a form with `readOnlyFields` that target nested SurveyJS elements.
- Workaround: Add form-specific protections where available; the generic helper needs recursive traversal or SurveyJS model APIs such as `getQuestionByName`.

**Stillbirth form promotion is a no-op:**
- Symptoms: `FORM_PROMOTION_HANDLERS` maps `SBF` to an empty async handler.
- Files: `apps/api/src/services/eventProcessor.ts`, `packages/shared-workflow/src/task-generators.ts`, `docs/policies/workflow-and-scheduling.md`
- Trigger: Sync an `SBF` finalized response; evidence is stored, but no typed stillbirth event/projection/task effect is applied.
- Workaround: Treat SBF responses as review-needed until the handler appends typed events or explicitly returns `held_for_review`.

## Security Considerations

**JWT configuration is not production-hardened:**
- Risk: JWT signing falls back to a hard-coded development secret, uses one secret for both access and refresh tokens, verifies without locking algorithm/type at middleware level, and logout does not invalidate refresh capability.
- Files: `apps/api/src/lib/jwt.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/middleware/auth.ts`, `docs/policies/auth-device-and-role-scope.md`, `Makefile`
- Current mitigation: Login verifies password hashes and disabled users cannot login or refresh.
- Recommendations: Require explicit secrets outside local development, use distinct access/refresh secrets, pass allowed algorithms into `jwt.verify`, reject refresh tokens in `requireAuth`, store refresh token families or versions for revocation, and make logout revoke refresh capability.

**Login and refresh lack rate limiting:**
- Risk: Brute-force login and refresh attempts are not throttled by API middleware.
- Files: `apps/api/src/app.ts`, `apps/api/src/routes/auth.ts`, `docs/policies/auth-device-and-role-scope.md`
- Current mitigation: Generic credential errors avoid revealing whether username or password is wrong.
- Recommendations: Add environment-aware rate limiting to `/api/v1/auth/login` and `/api/v1/auth/refresh`, with deployment defaults before field use.

**Device registration permits silent reassignment:**
- Risk: Any authenticated user can call `/api/v1/devices/register` with an existing `device_id`; the route upserts `user_id` to the caller without central-admin approval or audit.
- Files: `apps/api/src/routes/devices.ts`, `apps/api/src/db/schema/sync-auth.ts`, `docs/policies/auth-device-and-role-scope.md`
- Current mitigation: Route requires authentication.
- Recommendations: Reject reassignment for existing devices unless an admin endpoint performs it with audit metadata. Enforce device ownership during sync push.

**Area scope enforcement is incomplete on protected routes:**
- Risk: Many protected API list/detail routes trust query filters and authentication but do not intersect with active server-side `user_area_assignments`. Sync push scope is resolved from client-provided payload/household ID parts when task/subject lookup is absent.
- Files: `apps/api/src/routes/households.ts`, `apps/api/src/routes/household-members.ts`, `apps/api/src/routes/tasks.ts`, `apps/api/src/routes/eligible-women.ts`, `apps/api/src/routes/pregnant-women.ts`, `apps/api/src/routes/children.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/area-assignments.ts`, `docs/policies/auth-device-and-role-scope.md`
- Current mitigation: Some admin/user routes apply site-level role checks; sync pull can filter by requested locality codes.
- Recommendations: Add shared scope helpers that load active assignments and apply them server-side for every household/member/task/form-response/sync route. Resolve push scope from server-known task/subject records whenever present and reject client-only out-of-scope claims.

**Form responses expose raw evidence without per-record scope checks:**
- Risk: Form response list/detail routes are mounted behind authentication but do not apply role or assignment constraints within the route.
- Files: `apps/api/src/routes/form-responses.ts`, `apps/api/src/app.ts`, `docs/policies/auth-device-and-role-scope.md`
- Current mitigation: `app.ts` mounts the route behind `requireAuth`.
- Recommendations: Join to task/household/site scope and enforce role/assignment visibility before returning raw `answers_json`.

## Performance Bottlenecks

**Offset pagination across multiple sync entities can degrade on large field datasets:**
- Problem: Pull sync uses one offset/page token for households, members, eligible women, pregnancies, children, tasks, and task attempts, with repeated count queries and offset scans.
- Files: `apps/api/src/routes/sync.ts`, `expo-prototype/src/modules/sync/syncService.js`
- Cause: Offset pagination becomes slower as offsets grow and can skip/duplicate rows when each entity type changes independently within the same sync window.
- Improvement path: Use per-entity cursors based on `(updated_at, stable_id)` or server commit sequence. Keep household and member batching separate, as the policy already directs.

**Admin and API list routes perform count plus page queries on every request:**
- Problem: List routes calculate `count(*)` and then fetch paginated rows, often with unbounded search filters and joins.
- Files: `apps/api/src/routes/households.ts`, `apps/api/src/routes/household-members.ts`, `apps/api/src/routes/eligible-women.ts`, `apps/api/src/routes/pregnant-women.ts`, `apps/api/src/routes/children.ts`, `apps/api/src/routes/tasks.ts`
- Cause: Generic offset pagination and `ilike` search without visible route-level index strategy.
- Improvement path: Add database indexes for common filters (`site_id`, `locality_code`, `updated_at`, task status/date, subject IDs), use keyset pagination where possible, and reserve exact counts for screens that need them.

**Expo stores and serializes large local caches through synchronous paths:**
- Problem: Browser/web fallback uses `localStorage` and JSON blobs for submissions, SQLite state, households, members, tasks, and pregnancies.
- Files: `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`, `expo-prototype/src/modules/households/householdRepository.js`, `expo-prototype/src/shims/expo-sqlite.web.js`
- Cause: Large synced datasets are serialized/deserialized as whole arrays in web mode.
- Improvement path: Keep web shim for tests/prototypes only. For production-like web validation, use IndexedDB/SQLite-backed storage and batch writes/reads.

## Fragile Areas

**Backend promotion service is the highest-risk edit surface:**
- Files: `apps/api/src/services/eventProcessor.ts`, `apps/api/src/services/hhqPromotion.ts`, `apps/api/src/services/taskWriter.ts`, `apps/api/src/hhq-offline-sync.e2e.integration.ts`
- Why fragile: It mixes classification, duplicate detection, projection mutation, workflow generation, event writes, DQ flags, and many form-specific field mappings in one service.
- Safe modification: Add tests for the specific form path first, then extract pure mapping/event functions. Keep DB writes behind transaction-aware service methods.
- Test coverage: HHQ/PEF/PFF/POF duplicate sync paths have integration coverage in `apps/api/src/hhq-offline-sync.e2e.integration.ts`; SBF, UF, BAF, NFF, CDF, correction recalculation, and projection rebuild equivalence are not covered end-to-end.

**Sync route is a broad contract boundary:**
- Files: `apps/api/src/routes/sync.ts`, `expo-prototype/src/modules/sync/syncService.js`, `expo-prototype/src/modules/sync/syncWorkflow.js`, `expo-prototype/src/tests/validateSyncWorkflow.mjs`, `apps/api/src/smoke.integration.ts`
- Why fragile: It owns pull paging, scope filters, push ingest, idempotency, duplicate handling, server clock metadata, protocol form versions, sync logs, and task status updates.
- Safe modification: Change one record type or direction at a time. Add API integration tests for cursor behavior, server-side scope enforcement, and mixed accepted/error push batches.
- Test coverage: Clock drift and basic push/pull smoke paths are covered; assignment-intersection, registered-device enforcement, concurrent duplicate push, and per-entity cursor behavior need coverage.

**Questionnaire dashboard controls multiple critical policies:**
- Files: `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`, `expo-prototype/src/modules/questionnaires/questionnaireDraftRepository.js`, `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`, `expo-prototype/src/tests/validateQuestionnaireDraftWorkflow.mjs`, `expo-prototype/src/tests/validateQuestionnaireSubmissionWorkflow.mjs`, `expo-prototype/src/tests/validateSurveyNavigation.mjs`
- Why fragile: One component owns SurveyJS model setup, read-only fields, draft restore, autosave, HHQ member review, preview gate, final submission, local promotion, and navigation state.
- Safe modification: Extract preview/final-submit state, autosave/draft state, and SurveyJS setup helpers. Keep a small integration test for the full finalization path after each extraction.
- Test coverage: Draft, preview, submission, and navigation scripts exist; nested read-only fields, background-save failure visibility, and superseded draft behavior need targeted tests.

**Local SQLite schema diverges from backend canonical schema:**
- Files: `expo-prototype/src/modules/tasks/taskSchema.js`, `apps/api/src/db/schema/tasks.ts`, `apps/api/src/db/schema/visits.ts`, `packages/shared-domain/src/types.ts`
- Why fragile: Local tables use different column names and lifecycle/status values from backend tables. The mapping layer must remember every conversion.
- Safe modification: Treat local schema as a versioned projection contract. Add migration tests for existing local stores and explicit serializers for backend-to-Expo and Expo-to-backend records.
- Test coverage: Web shim tests validate selected flows; native SQLite migration/backward-compatibility coverage is limited.

**Generated/dist artifacts are present beside source:**
- Files: `apps/api/dist`, `apps/admin/dist`, `packages/event-core/dist`, `packages/shared-domain/dist`, `packages/shared-workflow/dist`, `expo-prototype/dist`, `expo-prototype/screenshots`
- Why fragile: Searches and test discovery can accidentally include stale compiled files or screenshots unless commands exclude generated directories.
- Safe modification: Keep mapper/test/search commands excluding `dist`, `node_modules`, `.expo`, and screenshots. Confirm `.gitignore` ownership before deleting or committing generated artifacts.
- Test coverage: Not applicable.

## Scaling Limits

**Sync cursor is timestamp-based rather than commit-sequence based:**
- Current capacity: Pull handles paged household batches with page size capped at 1000 and Expo requests 500.
- Limit: Concurrent writes with the same or older `updated_at` can be missed or reordered; page offsets are shared across independent tables.
- Scaling path: Add monotonically increasing `server_commit_sequence` to accepted evidence/events/projections and use it for pull cursors. Keep timestamp as metadata only.
- Files: `apps/api/src/routes/sync.ts`, `apps/api/src/db/schema/events.ts`, `apps/api/src/db/schema/visits.ts`, `packages/event-core/src/types.ts`, `docs/policies/form-lifecycle-and-sync.md`

**Workflow generation can create large future task sets immediately:**
- Current capacity: `onHouseholdEnrolled`, `onPregnancyEnrolled`, and `onBirthAssessmentCompleted` generate full schedules through `study_end_date`.
- Limit: Large baseline imports can create many planned rows up front, increasing sync payloads and local task table size. Active policy says actionable work should be current due/next protocol-needed work, and future tasks should be controlled.
- Scaling path: Store deterministic schedule rules and materialize current/near-future tasks, or mark distant tasks planned and exclude them from field pulls until needed.
- Files: `packages/shared-workflow/src/task-generators.ts`, `packages/shared-workflow/src/protocol-config.ts`, `apps/api/src/services/taskWriter.ts`, `docs/policies/workflow-and-scheduling.md`

**Large-field seed and DB reset assume disposable dev data:**
- Current capacity: Dev workflow uses full DB push/reset and deterministic seed scripts.
- Limit: The repo explicitly treats migration churn as legacy; this is fine for dev but not a production data upgrade path.
- Scaling path: Preserve the dev reset path while defining production migrations, backup/restore, and replay validation before live data exists.
- Files: `Makefile`, `apps/api/src/dev/large-field-seed.ts`, `apps/api/src/dev/dev-seed.ts`, `docs/testing.md`

## Dependencies at Risk

**Drizzle schema push requires a narrow invocation shape:**
- Risk: The documented push constraint says the config barrel can report success while creating no tables; the working path requires explicit schema globs and URL handling.
- Impact: Developers can think a schema change applied when the database is empty or stale.
- Migration plan: Keep `make db-push` and `apps/api/package.json` scripts using explicit schema files. Avoid using `apps/api/drizzle.config.ts` as the only schema source until the push issue is resolved and tested.
- Files: `docs/testing.md`, `Makefile`, `apps/api/package.json`, `apps/api/drizzle.config.ts`

**SurveyJS model behavior is central and version-sensitive:**
- Risk: Navigation, read-only behavior, preview display values, and nested panel handling depend on SurveyJS APIs.
- Impact: Questionnaire UI can silently violate preview/read-only/navigation policies if SurveyJS APIs change or local helpers only handle top-level elements.
- Migration plan: Keep SurveyJS-specific behavior behind helpers with tests using real `Model` instances.
- Files: `expo-prototype/package.json`, `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`, `expo-prototype/src/modules/questionnaires/surveyNavigation.js`, `expo-prototype/src/tests/validateSurveyNavigation.mjs`

## Missing Critical Features

**Production-grade auth/session controls:**
- Problem: Refresh rotation/revocation, logout invalidation, JWT algorithm constraints, non-dev secret enforcement, and rate limiting are required by active policy.
- Blocks: Field deployment with durable device sessions and safe credential handling.
- Files: `apps/api/src/lib/jwt.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/app.ts`, `docs/policies/auth-device-and-role-scope.md`

**Registered-device enforcement during sync:**
- Problem: Sync push accepts any `device_id` string and Expo falls back to `unregistered-device` when no local device ID is stored.
- Blocks: Device audit, device reassignment controls, and reliable per-device sync provenance.
- Files: `apps/api/src/routes/sync.ts`, `apps/api/src/routes/devices.ts`, `expo-prototype/src/modules/sync/syncService.js`, `docs/policies/auth-device-and-role-scope.md`

**Projection replay and rebuild tooling:**
- Problem: `rebuildHhqHouseholdProjection` exists for one narrow HHQ path, but there is no general replay command that rebuilds households, members, women, pregnancies, outcomes, children, and tasks from accepted evidence/events.
- Blocks: Correction recalculation, projection rebuild equivalence verification, and recovery after rule changes.
- Files: `apps/api/src/services/eventProcessor.ts`, `packages/event-core/src/household-projection.ts`, `packages/event-core/src/pregnancy-projection.ts`, `docs/architecture.md`

**Admin correction review/recalculation workflow:**
- Problem: Admin corrections can be created and listed, but there is no approval/hold/reject flow that recalculates downstream state or central-review cases.
- Blocks: Safe correction of identity, eligibility, outcome, death, stillbirth, and schedule anchors.
- Files: `apps/api/src/routes/corrections.ts`, `apps/admin/src/pages/HouseholdsPage.tsx`, `apps/admin/src/pages/HouseholdMembersPage.tsx`, `docs/policies/admin-corrections-and-data-quality.md`

**VA field-opening enforcement beyond generated task metadata:**
- Problem: Shared workflow marks VA tasks disabled, but route/UI enforcement should prevent field opening even if a stale/local task is manipulated.
- Blocks: Policy guarantee that VA tasks are visible but cannot be opened until VA JSON exists.
- Files: `packages/shared-workflow/src/task-generators.ts`, `expo-prototype/src/modules/worklist/TaskDetailModal.js`, `expo-prototype/src/modules/tasks/taskRepository.js`, `docs/policies/workflow-and-scheduling.md`

## Test Coverage Gaps

**Auth, tokens, and device security:**
- What's not tested: Rate limiting, refresh-token revocation/rotation, logout invalidation, algorithm locking, production secret enforcement, registered-device sync checks, and device reassignment audit.
- Files: `apps/api/src/routes/auth.ts`, `apps/api/src/lib/jwt.ts`, `apps/api/src/routes/devices.ts`, `apps/api/src/routes/sync.ts`
- Risk: Security regressions reach deployment despite basic login tests.
- Priority: High

**Server-side area scope:**
- What's not tested: Assignment intersection for household/member/task/children/form-response routes, pull scope, push scope, and out-of-scope field worker access.
- Files: `apps/api/src/routes/households.ts`, `apps/api/src/routes/household-members.ts`, `apps/api/src/routes/tasks.ts`, `apps/api/src/routes/children.ts`, `apps/api/src/routes/form-responses.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/area-assignments.ts`
- Risk: Field users can read or write records outside assigned locality/site scope.
- Priority: High

**Exact workflow date anchors and task keys:**
- What's not tested: Exact fractional NFF date offsets, WQ->PEF detected-date anchors without wall-clock defaults, failed-attempt final-close flow, current-due repeated-series behavior, and no backfill wall of actionable tasks.
- Files: `packages/shared-workflow/src/schedule-rules.ts`, `packages/shared-workflow/src/task-generators.ts`, `packages/shared-workflow/src/__tests__/schedule-rules.test.ts`, `packages/shared-workflow/src/__tests__/task-generators.test.ts`
- Risk: Generated worklists drift from protocol windows while broad tests still pass.
- Priority: High

**End-to-end form promotion parity:**
- What's not tested: Backend and Expo producing the same typed events, projections, DQ flags, and task descriptors from the same fixtures across HHQ, WQ, PEF, PFF, POF, BAF, NFF, CDF, SBF, and VA-disabled cases.
- Files: `apps/api/src/services/eventProcessor.ts`, `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`, `packages/event-core/src/__tests__/index.test.ts`, `expo-prototype/src/tests/validateQuestionnaireSubmissionWorkflow.mjs`, `apps/api/src/hhq-offline-sync.e2e.integration.ts`
- Risk: Offline behavior appears correct locally but sync reconciliation changes tasks/projections.
- Priority: High

**Admin correction recalculation:**
- What's not tested: Approved corrections rebuilding dependent IDs, eligibility, pregnancies, children, future tasks, and data-quality flags without editing raw evidence.
- Files: `apps/api/src/routes/corrections.ts`, `apps/api/src/admin-workflows.integration.ts`, `docs/policies/admin-corrections-and-data-quality.md`
- Risk: Admin fixes create inconsistent projections or orphan dependent rows.
- Priority: Medium

**Admin UI data loading:**
- What's not tested: Data-quality flag fetch/empty state, sync log filters, children locality filters, and backend-driven list refresh behavior.
- Files: `apps/admin/src/pages/DataQualityPage.tsx`, `apps/admin/src/pages/SyncLogsPage.tsx`, `apps/admin/src/pages/ChildrenPage.tsx`, `apps/api/src/routes/children.ts`
- Risk: Admin screens silently show stale or empty operational data.
- Priority: Medium

---

*Concerns audit: 2026-06-19*
