<!-- refreshed: 2026-06-19 -->
# Architecture

**Analysis Date:** 2026-06-19

This is a codebase-map snapshot of observed implementation structure and data flow. It is not a competing architecture canon. The single agreed architecture is `docs/architecture.md`; active policy lives under `docs/policies/`; `docs/archive/` is historical background only.

When this snapshot describes drift, treat it as code-vs-canon evidence to inspect and resolve against `docs/architecture.md`, not as permission to preserve the drift.

## System Overview

```text
-----------------------------------------------------------------
|                         User Surfaces                          |
+----------------------+---------------------+--------------------+
| Expo field app       | Vite admin app      | API clients        |
| `expo-prototype/`    | `apps/admin/`       | `/api/v1/*`        |
`----------+-----------+----------+----------+---------+----------'
           |                      |                    |
           v                      v                    v
-----------------------------------------------------------------
|                      Express API Backend                       |
| `apps/api/src/app.ts`, `apps/api/src/routes/*`                 |
`----------+----------------------+-------------------+----------'
           |                      |                   |
           v                      v                   v
---------------------  ----------------------  ------------------
| Promotion/services |  | Shared rule kernel |  | Admin CRUD/API |
| `apps/api/src/`    |  | `packages/*/src`   |  | `apps/api/src/routes/*` |
`----------+----------  `----------+-----------  `--------+-------'
           |                       |                     |
           v                       v                     v
-----------------------------------------------------------------
|                         Storage Models                         |
| Postgres via Drizzle: `apps/api/src/db/schema/*`               |
| Local SQLite/Web cache: `expo-prototype/src/modules/tasks/*`,  |
| `expo-prototype/src/modules/households/*`                      |
-----------------------------------------------------------------
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Canonical architecture | Defines agreed DYNAMIC architecture, rule precedence, event/workflow direction, and verification gates | `docs/architecture.md` |
| Active policies | Define active field/admin/API behavior rules by topic | `docs/policies/` |
| API app factory | Builds Express app, CORS, JSON parsing, health check, and route mounting | `apps/api/src/app.ts` |
| API entrypoint | Loads environment and starts the Express server | `apps/api/src/index.ts` |
| Sync API | Pulls projection/read models and pushes form responses, local events, task attempts, and task status changes | `apps/api/src/routes/sync.ts` |
| Form promotion service | Converts accepted form responses into domain event rows, projection tables, data-quality flags, and tasks | `apps/api/src/services/eventProcessor.ts` |
| HHQ promotion helpers | Maps HHQ answers into household and member projection values | `apps/api/src/services/hhqPromotion.ts` |
| Task writer | Persists shared task descriptors into `follow_up_tasks` | `apps/api/src/services/taskWriter.ts` |
| Drizzle schema | Defines Postgres tables for evidence, projections, tasks, auth, sync, and corrections | `apps/api/src/db/schema/` |
| Shared event core | Owns pure event envelope types and projection reducers | `packages/event-core/src/` |
| Shared workflow | Owns deterministic scheduling rules and task descriptor generators | `packages/shared-workflow/src/` |
| Shared domain | Owns domain schemas and ID/task-key helpers | `packages/shared-domain/src/` |
| Shared context | Owns prefill/context builders for form rendering | `packages/shared-context/src/` |
| Expo shell | Provides field app context, auth/session state, selected task context, prefill state, and route navigation | `expo-prototype/src/shell/FieldAppProvider.js` |
| Expo questionnaire routing | Blocks non-HHQ new form entry without valid task context | `expo-prototype/src/shell/QuestionnaireRouteScreen.js` |
| Expo local task DB | Creates local SQLite tables for tasks, attempts, responses, eligible women, pregnancies, sync metadata, and event outbox | `expo-prototype/src/modules/tasks/taskSchema.js` |
| Expo submission repository | Saves finalized local responses and provisional HHQ/PEF local workflow state | `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js` |
| Expo sync service | Refreshes assignments, pushes pending records/events, pulls server state, and refreshes protocol forms | `expo-prototype/src/modules/sync/syncService.js` |
| Admin app | Protected React UI for dashboard, users, masters, households, tasks, data quality, sync logs, women, pregnancies, and children | `apps/admin/src/App.tsx` |
| Admin API client | Adds bearer token and normalizes API responses for admin pages | `apps/admin/src/lib/api.ts` |

## Pattern Overview

**Overall:** npm workspace monorepo with three runtime surfaces and shared TypeScript rule packages.

**Canonical target:** `docs/architecture.md` defines immutable finalized evidence, typed domain/task events, shared reducers, deterministic workflow generation, Postgres projections, and offline Expo provisional state.

**Observed implementation:**
- API routes in `apps/api/src/routes/` expose authenticated CRUD/read-model endpoints plus sync endpoints.
- Postgres table definitions are grouped by domain slice in `apps/api/src/db/schema/` and re-exported from `apps/api/src/db/schema/index.ts`.
- Shared pure rules live under `packages/event-core/src/`, `packages/shared-workflow/src/`, `packages/shared-domain/src/`, and `packages/shared-context/src/`.
- Expo app routes live under `expo-prototype/app/`; reusable field app modules live under `expo-prototype/src/modules/`, `expo-prototype/src/shell/`, `expo-prototype/src/lib/`, and `expo-prototype/src/navigation/`.
- Admin app pages are route-level React screens under `apps/admin/src/pages/`; shared admin layout/auth/API helpers live under `apps/admin/src/components/` and `apps/admin/src/lib/`.

**Observed code-vs-canon drift:**
- `apps/api/src/routes/sync.ts` stores pushed `form_response` records and then calls `processFormResponse`, while `apps/api/src/services/eventProcessor.ts` mutates projection tables and writes tasks directly in many handlers. New domain behavior should move toward the canonical `finalized evidence -> classify -> append event -> reducer -> workflow -> projection/tasks` path in `docs/architecture.md`.
- `apps/api/src/services/eventProcessor.ts` uses `@dynamic/event-core` and `@dynamic/shared-workflow` for parts of HHQ/PEF processing, but handlers for WQ, UF, POF, BAF, NFF, CDF, and SBF are not uniformly reducer-driven. New promotion code should prefer `packages/event-core/src/` and `packages/shared-workflow/src/` over route-local or service-local rules.
- `apps/api/src/db/schema/events.ts` persists domain event metadata without event payload, event version, or rules version columns. Rebuild helpers such as `rebuildHhqHouseholdProjection` in `apps/api/src/services/eventProcessor.ts` reconstruct payload from `form_responses`; new event persistence should align with the typed event envelope shape in `packages/event-core/src/types.ts`.
- `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js` locally builds WQ/PFF/UF tasks and pregnancy projections instead of calling `@dynamic/shared-workflow` and `@dynamic/event-core`. New Expo provisional workflow should converge on shared packages.
- `apps/api/src/routes/sync.ts` scopes pull by client-supplied query locality filters and resolves pushed record scope from record data. New sync scope enforcement should use server-known user assignments from `apps/api/src/routes/users.ts`, `apps/api/src/routes/area-assignments.ts`, and `apps/api/src/db/schema/sync-auth.ts`.
- `apps/api/src/routes/corrections.ts` writes an audit row and directly patches household/member fields. New correction behavior should follow `docs/policies/admin-corrections-and-data-quality.md`: correction event, typed projected-state update, and downstream recalculation where required.

## Layers

**Documentation Canon:**
- Purpose: Establish active architecture and policy precedence.
- Location: `docs/architecture.md`, `docs/policies/`
- Contains: architecture, route policy, form lifecycle policy, questionnaire policy, auth/scope policy, workflow policy, correction policy, testing policy.
- Depends on: protocol source material in `Refs/`.
- Used by: all implementation and planning work.

**Runtime Orchestration:**
- Purpose: Start and compose the backend, admin, Expo, database, and edge local runtime.
- Location: `Makefile`, `package.json`, `turbo.json`, `deploy/nginx/`
- Contains: root workspace scripts, Turbo tasks, local development Make targets, Nginx edge config.
- Depends on: npm workspaces in `apps/*`, `packages/*`, `expo-prototype`, and `shared`.
- Used by: local development and verification.

**Backend HTTP Layer:**
- Purpose: Authenticate requests and expose API endpoints.
- Location: `apps/api/src/app.ts`, `apps/api/src/routes/`, `apps/api/src/middleware/auth.ts`
- Contains: Express routers, route validation, role checks, pagination, sync endpoints, admin correction endpoints.
- Depends on: `apps/api/src/db/`, `apps/api/src/lib/`, `apps/api/src/services/`.
- Used by: `apps/admin/`, `expo-prototype/`, and external API clients.

**Backend Domain Services:**
- Purpose: Promote finalized evidence into events, projections, tasks, and flags.
- Location: `apps/api/src/services/`
- Contains: `processFormResponse`, HHQ promotion builders, task descriptor persistence.
- Depends on: `apps/api/src/db/schema/`, `@dynamic/event-core`, `@dynamic/shared-workflow`.
- Used by: `apps/api/src/routes/sync.ts`.

**Postgres Data Layer:**
- Purpose: Store evidence, event metadata, projections, users/devices, tasks, sync logs, and admin corrections.
- Location: `apps/api/src/db/schema/`, `apps/api/drizzle/`, `apps/api/drizzle.config.ts`
- Contains: Drizzle schemas and migrations.
- Depends on: `drizzle-orm`, Postgres.
- Used by: backend routes, services, tests, and dev seed scripts.

**Shared Rule Kernel:**
- Purpose: Keep study/domain rules pure and reusable across backend and Expo.
- Location: `packages/event-core/src/`, `packages/shared-workflow/src/`, `packages/shared-domain/src/`, `packages/shared-context/src/`
- Contains: event types, projection reducers, workflow orchestration, task generators, schedule rules, IDs, schemas, prefill builders.
- Depends on: minimal TypeScript dependencies and `zod` where schema validation is required.
- Used by: `apps/api/`; partially used or mirrored by `expo-prototype/`.

**Expo Field App:**
- Purpose: Offline-first field workflow for login, worklist, household/member browsing, questionnaire entry, local response persistence, provisional state, and sync.
- Location: `expo-prototype/app/`, `expo-prototype/src/`
- Contains: Expo Router routes, React Native screens, local SQLite/Web persistence, SurveyJS transforms, form JSON, sync workflow.
- Depends on: `expo-router`, `expo-sqlite`, `survey-core`, `survey-react-ui`, `shared/studyMasters.js`, local modules.
- Used by: field workers.

**Admin App:**
- Purpose: Central browser UI for operational review and management.
- Location: `apps/admin/src/`
- Contains: React Router pages, protected layout, auth context, API helper, CSS modules.
- Depends on: `react`, `react-router-dom`, Vite, backend `/api/v1`.
- Used by: admin and supervisory users.

## Data Flow

### Primary Field Sync Push Path

1. Expo final submission calls `saveQuestionnaireSubmission` and stores a local `form_responses` row (`expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js:686`).
2. Expo optionally promotes HHQ/PEF locally into provisional household, eligible-woman, pregnancy, task, and event-outbox state (`expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js:632`, `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js:668`).
3. `syncAll` refreshes clock and assignments, then calls `pushSync` (`expo-prototype/src/modules/sync/syncService.js:543`).
4. `pushSync` gathers pending responses and domain events, then posts records to `/api/v1/sync/push` (`expo-prototype/src/modules/sync/syncService.js:472`).
5. API `POST /api/v1/sync/push` inserts form responses into `form_responses`, calls `processFormResponse`, accepts or records duplicates/errors, and writes a sync log (`apps/api/src/routes/sync.ts:408`).
6. `processFormResponse` dispatches by `form_code` to handlers in `FORM_PROMOTION_HANDLERS` (`apps/api/src/services/eventProcessor.ts:156`, `apps/api/src/services/eventProcessor.ts:235`).
7. Promotion handlers write domain event metadata, projection rows, follow-up tasks, and data-quality flags (`apps/api/src/services/eventProcessor.ts:268`, `apps/api/src/services/eventProcessor.ts:565`, `apps/api/src/services/eventProcessor.ts:862`).

### Primary Pull/Reconciliation Path

1. Expo `pullSync` builds a cursor/locality-filtered request and calls `GET /api/v1/sync/pull` (`expo-prototype/src/modules/sync/syncService.js:264`).
2. API `GET /api/v1/sync/pull` queries changed households, members, eligible women, pregnancies, children, tasks, task attempts, and form version metadata (`apps/api/src/routes/sync.ts:125`).
3. Expo stores households/members via `saveSyncedHouseholdsAndMembers`, tasks via `saveTaskBatch`, eligible women via `saveEligibleWomenBatch`, pregnancies via `savePregnancyBatch`, and changed protocol forms in `sync_meta` (`expo-prototype/src/modules/sync/syncService.js:366`).
4. Expo advances `last_sync_at` using the server `sync_cursor` (`expo-prototype/src/modules/sync/syncService.js:434`).

### Admin Read/Correction Path

1. Admin routes are declared under `BrowserRouter` and protected by `ProtectedRoute` (`apps/admin/src/App.tsx:18`).
2. Admin pages call `apiFetch`/`apiFetchPage`, which attach `Authorization: Bearer <token>` and unwrap `json.data` (`apps/admin/src/lib/api.ts:7`).
3. Backend routes mounted in `apps/api/src/app.ts` serve read models such as households, members, tasks, data quality, sync logs, eligible women, pregnant women, and children.
4. Corrections are posted to `/api/v1/households/:id/corrections` or `/api/v1/members/:id/corrections`, record `admin_corrections`, and directly update selected fields (`apps/api/src/routes/corrections.ts:13`, `apps/api/src/routes/corrections.ts:104`).

**State Management:**
- Backend authoritative state is Postgres tables under `apps/api/src/db/schema/`.
- Expo offline state is `dynamic_offline.db` tables created in `expo-prototype/src/modules/tasks/taskSchema.js` plus web fallback caches in localStorage helpers under `expo-prototype/src/modules/households/householdRepository.js` and `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`.
- Admin session state is browser `localStorage` plus React context in `apps/admin/src/lib/auth-context.tsx`.
- Root runtime state is orchestrated by Make targets in `Makefile`; do not add host PID/log files for dev servers.

## Key Abstractions

**DomainEventEnvelope:**
- Purpose: Canonical typed event shape for reducers and workflow orchestration.
- Examples: `packages/event-core/src/types.ts`, `apps/api/src/services/eventProcessor.ts`, `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`
- Pattern: pure event data passed into reducers; persisted backend representation is not fully envelope-shaped in `apps/api/src/db/schema/events.ts`.

**Projection Reducers:**
- Purpose: Rebuild derived state from applied events.
- Examples: `packages/event-core/src/household-projection.ts`, `packages/event-core/src/pregnancy-projection.ts`
- Pattern: sort by event order, ignore non-`applied` events, return immutable projection objects.

**TaskDescriptor:**
- Purpose: Shared deterministic task generation contract.
- Examples: `packages/shared-workflow/src/task-generators.ts`, `apps/api/src/services/taskWriter.ts`
- Pattern: generate descriptors in pure code, persist through a runtime writer.

**Canonical IDs and Task Keys:**
- Purpose: Stable household/member/child/task identity.
- Examples: `packages/shared-domain/src/ids.ts`, `apps/api/src/services/hhqPromotion.ts`, `expo-prototype/src/modules/households/householdIds.js`
- Pattern: household IDs use site, locality, structure map ID, and household number; member IDs append a padded member number; task keys use household, subject, task type, protocol visit label, target date, and rules version.

**Sync Cursor:**
- Purpose: Bound pull windows and support paginated offline sync.
- Examples: `apps/api/src/routes/sync.ts`, `expo-prototype/src/modules/sync/syncService.js`
- Pattern: server supplies `sync_cursor` and `next_page_token`; client stores `last_sync_at` after all pages.

**Form Catalog and Protocol Forms:**
- Purpose: Serve bundled form JSON and version/checksum metadata to the field app.
- Examples: `expo-prototype/src/data/forms/`, `apps/api/src/lib/formCatalog.ts`, `apps/api/src/routes/protocol.ts`
- Pattern: Expo uses bundled forms and refreshes changed forms through protocol endpoints during sync.

## Entry Points

**Backend API:**
- Location: `apps/api/src/index.ts`
- Triggers: `npm --workspace @dynamic/api run dev`, root Make targets.
- Responsibilities: load environment, create Express app, listen on `PORT`.

**Backend App Factory:**
- Location: `apps/api/src/app.ts`
- Triggers: backend entrypoint and tests.
- Responsibilities: CORS, JSON parser, health endpoint, authenticated route mounting.

**Expo Router:**
- Location: `expo-prototype/app/_layout.js`, `expo-prototype/app/index.js`
- Triggers: `npm --workspace expo-prototype run start` or `web`.
- Responsibilities: wrap routes in `FieldAppProvider` and redirect `/` to `/worklist`.

**Admin React App:**
- Location: `apps/admin/src/main.tsx`, `apps/admin/src/App.tsx`
- Triggers: `npm --workspace @dynamic/admin run dev`.
- Responsibilities: mount React, configure protected admin routes.

**Shared Packages:**
- Location: `packages/event-core/src/index.ts`, `packages/shared-workflow/src/index.ts`, `packages/shared-domain/src/index.ts`, `packages/shared-context/src/index.ts`
- Triggers: package imports from apps and tests.
- Responsibilities: export pure shared contracts and helpers.

## Architectural Constraints

- **Canon precedence:** Treat `docs/architecture.md` as the single architecture authority and `docs/policies/` as active policy. Do not create active policy under `docs/superpowers/`; do not use `docs/archive/` as current rules.
- **Threading:** Backend and admin run on the JavaScript event loop. Expo uses React Native/Expo runtime plus synchronous local SQLite calls in `expo-prototype/src/modules/tasks/taskSchema.js` and `expo-prototype/src/modules/tasks/taskRepository.js`.
- **Global state:** Expo holds module-level database and navigation singletons in `expo-prototype/src/modules/tasks/taskSchema.js` and `expo-prototype/src/navigation/routes.js`; shared modules imported by Expo should avoid hidden mutable state.
- **Backend global state:** `apps/api/src/app.ts` constructs a fresh app per call; database access is module-level through `apps/api/src/db/index.ts`.
- **Circular imports:** No circular chain was identified in the files inspected; preserve package direction from apps to packages and avoid packages importing app code.
- **Archived docs:** `docs/archive/` is historical only. Do not cite archived rules as active implementation requirements unless promoted into `docs/architecture.md` or `docs/policies/`.
- **Secrets:** Do not read `.env`, `.env.*`, `.npmrc`, credential, key, or secret files. Use env var names and documented config only.

## Anti-Patterns

### Creating A Parallel Architecture Canon

**What happens:** New durable architecture or policy rules are added outside `docs/architecture.md` and `docs/policies/`.
**Why it's wrong:** `docs/architecture.md` declares itself the single agreed architecture and sets rule precedence.
**Do this instead:** Update `docs/architecture.md` for architecture rules and the relevant file under `docs/policies/` for policy rules.

### Adding Backend Rules Only Inside Routes

**What happens:** Route handlers in `apps/api/src/routes/` implement domain classification, promotion, or workflow rules directly.
**Why it's wrong:** Rules become unavailable to Expo and tests and diverge from shared packages.
**Do this instead:** Put pure rules in `packages/event-core/src/`, `packages/shared-workflow/src/`, `packages/shared-domain/src/`, or `packages/shared-context/src/`; call them from `apps/api/src/services/` or route handlers.

### Forking Expo Workflow Rules

**What happens:** Expo creates local task keys, schedules, projections, or events with code that duplicates `packages/shared-workflow/src/` or `packages/event-core/src/`.
**Why it's wrong:** Offline provisional behavior drifts from backend authoritative behavior.
**Do this instead:** Import or adapt shared rules for Expo-compatible use; keep runtime persistence in `expo-prototype/src/modules/*`.

### Treating `answers_json` As The Longitudinal Model

**What happens:** Workflow, reports, routing, or task generation query raw SurveyJS answers directly as the source of truth.
**Why it's wrong:** `docs/architecture.md` says `answers_json` is immutable evidence/rendering payload; typed projections drive operations.
**Do this instead:** Promote accepted evidence into typed events/projections under `apps/api/src/services/` and `apps/api/src/db/schema/`.

## Error Handling

**Strategy:** API routes return structured `sendError`/`sendSuccess` responses; route-level handlers catch exceptions and log with `console.error`. Expo repositories and sync services catch local persistence/network errors, log with `console.error`, and rethrow when the caller must show failure state.

**Patterns:**
- API validation errors use `zod` in routes such as `apps/api/src/routes/auth.ts` and `apps/api/src/routes/users.ts`.
- Authentication failures pass through `requireAuth` and `sendError` in `apps/api/src/middleware/auth.ts`.
- Sync records are processed independently; per-record failures are accumulated in the `errors` array in `apps/api/src/routes/sync.ts`.
- Expo sync errors propagate from `expo-prototype/src/modules/sync/syncService.js` to the UI after logging.

## Cross-Cutting Concerns

**Logging:** Use `console.error` for backend and Expo failure paths in `apps/api/src/routes/*`, `apps/api/src/services/*`, and `expo-prototype/src/modules/*`. No dedicated observability framework is present in the inspected code.

**Validation:** Use `zod` in backend request routes such as `apps/api/src/routes/auth.ts` and `apps/api/src/routes/users.ts`; use local assertions/helpers for Expo questionnaire and repository validation under `expo-prototype/src/modules/*` and `expo-prototype/src/tests/`.

**Authentication:** Backend JWT signing and verification live in `apps/api/src/lib/jwt.ts`; `requireAuth` and `requireRole` live in `apps/api/src/middleware/auth.ts`; Expo auth storage lives in `expo-prototype/src/modules/auth/authStore.js`; admin auth context lives in `apps/admin/src/lib/auth-context.tsx`.

**Area Scope:** User assignments are exposed by `GET /api/v1/users/me` in `apps/api/src/routes/users.ts`; assignment CRUD lives in `apps/api/src/routes/area-assignments.ts`; Expo stores assigned localities in sync metadata through `expo-prototype/src/modules/sync/syncService.js`. Backend sync endpoints need server-side assignment enforcement when resolving code-vs-canon drift.

**Testing:** Architecture-sensitive behavior is covered by package tests in `packages/event-core/src/__tests__/`, `packages/shared-workflow/src/__tests__/`, `packages/shared-domain/src/__tests__/`, API tests under `apps/api/src/*.test.ts` and `apps/api/src/*.integration.ts`, and Expo validation scripts under `expo-prototype/src/tests/`. Use `docs/testing.md` for command order.

---

*Architecture analysis: 2026-06-19*
