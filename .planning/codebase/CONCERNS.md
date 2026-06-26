# Codebase Concerns

**Analysis Date:** 2026-06-19

## Remediation Status (2026-06-19)

Fixed in branch `vg-work/fix-codebase-concerns`:
- Sync push now applies each accepted `form_response`, `task_attempt`, `domain_event`, and task update through a DB transaction; promotion/task writer services use the active transaction context.
- Children locality filtering now scopes through household locality, and protected household/member/woman/pregnancy/child/task/form-response/sync routes now apply server-side area scope.
- Fractional NFF `4.5m`, `7.5m`, and `10.5m` targets now use exact 135/225/315 day offsets.
- Admin Data Quality loads flags from the API; nested SurveyJS read-only enforcement uses model lookup plus recursive traversal.
- Unsupported `SBF` evidence is explicitly held for review with a DQ flag instead of silently no-oping.
- JWT auth now requires production secrets, separates access/refresh secrets, locks HS256/type verification, rate-limits login/refresh, rotates durable hashed refresh sessions, and revokes refresh sessions on logout.
- Device self-registration rejects reassignment, and sync push rejects unregistered or mismatched devices.
- Admin corrections now write canonical `admin_correction_events` in the same transaction as the compatibility row/projection patch.
- Expo preserves canonical task lifecycle state locally and blocks field opening of stale VA tasks without explicit VA form JSON.
- Backend promotion has been split so HHQ, PEF pregnancy enrollment, projection replay, event-envelope bridge helpers, and unsupported-form review are no longer embedded in the `eventProcessor` monolith. HHQ household follow-up tasks now use the persisted HHQ domain event as their source event.

Next development steps:
- Backend promotion still needs full typed event-core reducer convergence and replay/rebuild tooling for WQ, PFF, POF, BAF, NFF, CDF, and stillbirth-specific promotion.
- Expo finalization still needs broader convergence on shared event/reducer/workflow code beyond the targeted task/read-only/opening fixes.
- Admin corrections still need approval/reject/hold and downstream recalculation workflows, not only canonical event capture.
- Sync still uses timestamp/offset paging rather than per-entity keyset cursors or a server commit sequence.
- Large module refactors, index strategy, production migration policy, and large-cache web storage replacement remain backlog.

## Tech Debt

**Sync ingest still needs cursor/replay convergence after transactional push:**
- Issue: `POST /api/v1/sync/push` now applies accepted records through a transaction, but sync ordering and replay equivalence are still not based on a shared commit-sequence/event replay contract.
- Files: `apps/api/src/routes/sync.ts`, `apps/api/src/services/eventProcessor.ts`, `apps/api/src/services/taskWriter.ts`, `apps/api/src/db/schema/visits.ts`, `apps/api/src/db/schema/events.ts`, `apps/api/src/db/schema/tasks.ts`
- Impact: The branch addresses partial promotion commits, but pull paging and future rebuild workflows can still diverge from the target architecture in `docs/architecture.md` and `docs/policies/form-lifecycle-and-sync.md`.
- Fix approach: Add per-entity keyset cursors or a server commit sequence, then validate replay/rebuild equivalence from accepted evidence/events instead of relying on timestamp/offset paging.

**Backend promotion still needs full typed reducer convergence:**
- Issue: HHQ, PEF, projection replay helpers, event-envelope bridge helpers, and unsupported-form review are split out of the former `eventProcessor` monolith, but WQ, PFF, POF, BAF, NFF, CDF, and stillbirth-specific promotion still need full typed event-core reducer convergence.
- Files: `apps/api/src/services/eventProcessor.ts`, `packages/event-core/src/workflow-orchestration.ts`, `packages/shared-workflow/src/task-generators.ts`
- Impact: Backend behavior can still diverge from the target architecture in `docs/architecture.md`: finalized evidence should classify into typed events, reduce projections, then run shared workflow generation. The remaining mixed paths make projection rebuild equivalence and backend/Expo parity difficult to prove.
- Fix approach: Promote each remaining form through typed event envelopes and shared reducers first. Replace direct table mutation with reducer output persistence, then add replay/rebuild tests.

**Expo local workflow forks backend/shared workflow logic:**
- Issue: Expo creates local HHQ/WQ/PEF tasks, pregnancy projections, and domain events inside `questionnaireSubmissionRepository.js` instead of using `packages/event-core` and `packages/shared-workflow`. It also has a separate older event generator in `eventGenerators.js`.
- Files: `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`, `expo-prototype/src/modules/events/eventGenerators.js`, `expo-prototype/src/modules/sync/syncWorkflow.js`, `packages/event-core/src/index.ts`, `packages/shared-workflow/src/task-generators.ts`
- Impact: Local offline task keys, event names, rules versions, and task statuses can drift from backend authority. A task-backed form can emit both a form response and an older domain event type, while backend `processFormResponse` already promotes the form response.
- Fix approach: Route Expo finalization through shared event/reducer/workflow functions for field-originated domain behavior. Delete or isolate legacy event names (`household_enrolled`, `form_submitted`, etc.) from push sync unless there is a typed backend handler.

**Task lifecycle convergence is partial:**
- Issue: Expo now preserves canonical lifecycle state locally, but field/backend/admin transitions still need broader convergence on `packages/event-core/src/task-lifecycle.ts` rather than direct status assignment in each surface.
- Files: `apps/api/src/routes/sync.ts`, `apps/api/src/db/schema/tasks.ts`, `expo-prototype/src/modules/tasks/taskSchema.js`, `expo-prototype/src/modules/tasks/taskRepository.js`, `packages/event-core/src/task-lifecycle.ts`
- Impact: Offline UI has the canonical state available, but state transition behavior can still drift if each surface assigns lifecycle values independently.
- Fix approach: Use `packages/event-core/src/task-lifecycle.ts` for field/backend/admin transitions and derive display labels separately.

**Admin correction review/recalculation workflow remains incomplete:**
- Issue: Correction routes now write canonical `admin_correction_events`, but approval/reject/hold states and downstream recalculation workflows are not complete.
- Files: `apps/api/src/routes/corrections.ts`, `apps/api/src/db/schema/corrections.ts`, `apps/api/src/db/schema/sync-auth.ts`, `docs/policies/admin-corrections-and-data-quality.md`
- Impact: Corrections have a canonical capture path, but identity, eligibility, outcome, and scheduling-impacting fields still need safe review/rebuild behavior before operational use.
- Fix approach: Apply approved corrections through projection rebuild/recalculation, with hold/reject decisions and downstream DQ/task impacts recorded explicitly.

**Large files concentrate unrelated responsibilities:**
- Issue: Several files combine UI orchestration, storage, workflow generation, sync, and validation logic in single modules.
- Files: `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`, `apps/api/src/services/eventProcessor.ts`, `expo-prototype/src/modules/households/HouseholdModule.js`, `expo-prototype/src/modules/households/householdRepository.js`, `packages/shared-workflow/src/task-generators.ts`, `apps/api/src/routes/sync.ts`
- Impact: Small changes to form finalization, promotion, sync, or task rules have broad blast radius and are hard to test surgically.
- Fix approach: Split pure mapping/rules from persistence and UI state. Keep shared study rules in packages, API transaction code in services, and React components focused on presentation and flow state.

## Recently Fixed Bugs

The 2026-06-19 remediation branch fixes the original children locality filter, fractional NFF target dates, Data Quality flag loading, nested SurveyJS read-only traversal, and unsupported SBF no-op behavior. Keep this section empty unless a currently reproducible bug remains after those fixes.

## Security Considerations

**Auth/session hardening still needs deployment policy and regression coverage:**
- Risk: The branch adds production-secret enforcement, separate access/refresh secrets, HS256/type verification, refresh-session rotation/revocation, logout invalidation, and login/refresh rate limiting. These controls still need deployment defaults and regression coverage before field use.
- Files: `apps/api/src/lib/jwt.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/middleware/auth.ts`, `docs/policies/auth-device-and-role-scope.md`, `Makefile`
- Current mitigation: Login verifies password hashes, disabled users cannot login or refresh, refresh sessions are durable/hashed, and auth endpoints are rate-limited.
- Recommendations: Keep non-dev secret checks in deployment startup, run auth regression tests in CI, and document operational rotation/revocation handling.

**Device lifecycle still needs admin reassignment workflow:**
- Risk: Device self-registration now rejects silent reassignment, but there is no admin reassignment workflow with audit metadata for legitimate replacement/reassignment cases.
- Files: `apps/api/src/routes/devices.ts`, `apps/api/src/db/schema/sync-auth.ts`, `docs/policies/auth-device-and-role-scope.md`
- Current mitigation: Route requires authentication, rejects reassignment, and sync push rejects unregistered or mismatched devices.
- Recommendations: Add an admin-only reassignment/revocation endpoint with audit metadata before field deployment.

**Area scope enforcement needs regression coverage and edge-case review:**
- Risk: Protected household/member/woman/pregnancy/child/task/form-response/sync routes now apply server-side area scope, but scope behavior still needs broader regression tests for route edge cases and mixed-role users.
- Files: `apps/api/src/routes/households.ts`, `apps/api/src/routes/household-members.ts`, `apps/api/src/routes/tasks.ts`, `apps/api/src/routes/eligible-women.ts`, `apps/api/src/routes/pregnant-women.ts`, `apps/api/src/routes/children.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/area-assignments.ts`, `docs/policies/auth-device-and-role-scope.md`
- Current mitigation: Shared scope helpers load active assignments and apply server-side filters to protected routes.
- Recommendations: Add assignment-intersection tests for every protected list/detail route and sync push/pull path, including raw `answers_json` visibility.

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

**Projection replay and rebuild tooling:**
- Problem: `rebuildHhqHouseholdProjection` exists for one narrow HHQ path, but there is no general replay command that rebuilds households, members, women, pregnancies, outcomes, children, and tasks from accepted evidence/events.
- Blocks: Correction recalculation, projection rebuild equivalence verification, and recovery after rule changes.
- Files: `apps/api/src/services/eventProcessor.ts`, `packages/event-core/src/household-projection.ts`, `packages/event-core/src/pregnancy-projection.ts`, `docs/architecture.md`

**Admin correction review/recalculation workflow:**
- Problem: Admin corrections can be created and listed, but there is no approval/hold/reject flow that recalculates downstream state or central-review cases.
- Blocks: Safe correction of identity, eligibility, outcome, death, stillbirth, and schedule anchors.
- Files: `apps/api/src/routes/corrections.ts`, `apps/admin/src/pages/HouseholdsPage.tsx`, `apps/admin/src/pages/HouseholdMembersPage.tsx`, `docs/policies/admin-corrections-and-data-quality.md`

## Test Coverage Gaps

**Auth, tokens, and device security:**
- What's not tested broadly enough: Rate limiting, refresh-token revocation/rotation, logout invalidation, algorithm locking, production secret enforcement, registered-device sync checks, and device reassignment audit across CI and deployment-like settings.
- Files: `apps/api/src/routes/auth.ts`, `apps/api/src/lib/jwt.ts`, `apps/api/src/routes/devices.ts`, `apps/api/src/routes/sync.ts`
- Risk: Security regressions reach deployment despite basic login tests.
- Priority: High

**Server-side area scope:**
- What's not tested broadly enough: Assignment intersection for household/member/task/children/form-response routes, pull scope, push scope, and out-of-scope field worker access.
- Files: `apps/api/src/routes/households.ts`, `apps/api/src/routes/household-members.ts`, `apps/api/src/routes/tasks.ts`, `apps/api/src/routes/children.ts`, `apps/api/src/routes/form-responses.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/area-assignments.ts`
- Risk: Field users can read or write records outside assigned locality/site scope.
- Priority: High

**Exact workflow date anchors and task keys:**
- What's not tested broadly enough: Exact fractional NFF date offsets, WQ->PEF detected-date anchors without wall-clock defaults, failed-attempt final-close flow, current-due repeated-series behavior, and no backfill wall of actionable tasks.
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
- What's not tested broadly enough: Data-quality flag fetch/empty state, sync log filters, children locality filters, and backend-driven list refresh behavior.
- Files: `apps/admin/src/pages/DataQualityPage.tsx`, `apps/admin/src/pages/SyncLogsPage.tsx`, `apps/admin/src/pages/ChildrenPage.tsx`, `apps/api/src/routes/children.ts`
- Risk: Admin screens silently show stale or empty operational data.
- Priority: Medium

---

*Concerns audit: 2026-06-19*
