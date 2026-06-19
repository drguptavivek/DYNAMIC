# Codebase Structure

**Analysis Date:** 2026-06-19

This structure map describes where implementation files live. For architecture and policy authority, use `docs/architecture.md` and active docs under `docs/policies/`.

## Directory Layout

```text
DYNAMIC/
├── apps/
│   ├── api/                 # Express/Drizzle authoritative backend
│   └── admin/               # Vite React admin UI
├── expo-prototype/          # Expo field app and offline prototype/runtime
│   ├── app/                 # Expo Router routes
│   └── src/                 # Field app modules, shell, data, sync, tests
├── packages/
│   ├── event-core/          # Shared event envelopes, reducers, orchestration
│   ├── shared-context/      # Shared context/prefill builders
│   ├── shared-domain/       # Shared IDs, schemas, domain types
│   └── shared-workflow/     # Shared schedules and task generators
├── shared/                  # Plain JS study master data
├── docs/
│   ├── architecture.md      # Single agreed architecture canon
│   ├── policies/            # Active policy docs
│   └── archive/             # Historical docs only
├── Refs/                    # Protocol/source reference material
├── deploy/nginx/            # Local edge/reverse-proxy config
├── .planning/codebase/      # Generated GSD codebase maps
├── Makefile                 # Canonical local runtime commands
├── package.json             # npm workspaces and root scripts
├── turbo.json               # Turbo task graph
├── tsconfig*.json           # Root TypeScript config
└── docker-compose.yml       # Local service topology; do not read secrets from env files
```

## Directory Purposes

**`apps/api/`:**
- Purpose: Authoritative Node/Express backend.
- Contains: route handlers, service promotion logic, Drizzle schema, migrations, auth, sync, dev seed scripts, API tests.
- Key files: `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/services/eventProcessor.ts`, `apps/api/src/db/schema/index.ts`, `apps/api/package.json`.

**`apps/api/src/routes/`:**
- Purpose: HTTP endpoint layer.
- Contains: routers for auth, devices, users, area assignments, masters, households, household members, tasks, data quality, sync logs, eligible women, pregnant women, children, sync, protocol, corrections, and form responses.
- Key files: `apps/api/src/routes/auth.ts`, `apps/api/src/routes/users.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/corrections.ts`.

**`apps/api/src/services/`:**
- Purpose: Backend domain/application services called by routes.
- Contains: form-response promotion, HHQ mapping helpers, task descriptor persistence.
- Key files: `apps/api/src/services/eventProcessor.ts`, `apps/api/src/services/hhqPromotion.ts`, `apps/api/src/services/taskWriter.ts`.

**`apps/api/src/db/schema/`:**
- Purpose: Drizzle schema by domain slice.
- Contains: masters, households, members, eligible women, pregnancies, children, visits/form responses, events, tasks, sync/auth, corrections.
- Key files: `apps/api/src/db/schema/index.ts`, `apps/api/src/db/schema/visits.ts`, `apps/api/src/db/schema/events.ts`, `apps/api/src/db/schema/tasks.ts`.

**`apps/api/src/lib/`:**
- Purpose: Backend support utilities.
- Contains: JWT helpers, password helpers, pagination, form catalog, sync clock, response helpers.
- Key files: `apps/api/src/lib/jwt.ts`, `apps/api/src/lib/password.ts`, `apps/api/src/lib/errors.ts`, `apps/api/src/lib/syncClock.ts`, `apps/api/src/lib/formCatalog.ts`.

**`apps/api/src/dev/`:**
- Purpose: Development database seed and smoke tooling.
- Contains: test database setup, dev seed, large field seed, smoke script.
- Key files: `apps/api/src/dev/ensure-test-db.ts`, `apps/api/src/dev/dev-seed.ts`, `apps/api/src/dev/large-field-seed.ts`, `apps/api/src/dev/smoke-dev.ts`.

**`apps/admin/`:**
- Purpose: Central review/admin browser app.
- Contains: Vite config, React entry, route shell, pages, auth context, API helper, CSS modules.
- Key files: `apps/admin/src/App.tsx`, `apps/admin/src/main.tsx`, `apps/admin/src/lib/api.ts`, `apps/admin/src/lib/auth-context.tsx`, `apps/admin/src/components/Layout.tsx`.

**`apps/admin/src/pages/`:**
- Purpose: Route-level admin screens.
- Contains: one page component and usually one CSS module per admin surface.
- Key files: `apps/admin/src/pages/DashboardPage.tsx`, `apps/admin/src/pages/UsersPage.tsx`, `apps/admin/src/pages/HouseholdsPage.tsx`, `apps/admin/src/pages/TasksPage.tsx`, `apps/admin/src/pages/DataQualityPage.tsx`.

**`expo-prototype/app/`:**
- Purpose: Expo Router route declarations.
- Contains: root layout, redirects, household routes, household-member routes, sync route, profile route, questionnaire dynamic route.
- Key files: `expo-prototype/app/_layout.js`, `expo-prototype/app/index.js`, `expo-prototype/app/worklist.js`, `expo-prototype/app/sync.js`, `expo-prototype/app/questionnaires/[formCode]/new.js`.

**`expo-prototype/src/shell/`:**
- Purpose: Field app context and screen shell composition.
- Contains: app provider, layout shell, questionnaire route adapter.
- Key files: `expo-prototype/src/shell/FieldAppProvider.js`, `expo-prototype/src/shell/FieldAppShell.js`, `expo-prototype/src/shell/QuestionnaireRouteScreen.js`.

**`expo-prototype/src/modules/`:**
- Purpose: Feature modules for the field app.
- Contains: auth, events, households, profile, questionnaires, sync, tasks, worklist, study masters.
- Key files: `expo-prototype/src/modules/tasks/taskSchema.js`, `expo-prototype/src/modules/tasks/taskRepository.js`, `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`, `expo-prototype/src/modules/sync/syncService.js`, `expo-prototype/src/modules/worklist/WorklistScreen.js`.

**`expo-prototype/src/data/forms/`:**
- Purpose: Bundled SurveyJS form JSON and form index.
- Contains: versioned JSON files for HHQ, WQ, PEF, PFF, UF, POF, BAF, NFF, CDF, SBF, HRF.
- Key files: `expo-prototype/src/data/forms/index.json`, `expo-prototype/src/data/formCatalog.js`.

**`expo-prototype/src/lib/`:**
- Purpose: Expo feature helpers outside route modules.
- Contains: prefill mapping, household sync, SurveyJS preparation, household master choices and behaviors.
- Key files: `expo-prototype/src/lib/prefillMapper.js`, `expo-prototype/src/lib/householdSync.js`, `expo-prototype/src/lib/prepareSurveyJson.js`.

**`expo-prototype/src/navigation/`:**
- Purpose: Field app navigation helpers.
- Contains: route constants and form/task route resolution.
- Key files: `expo-prototype/src/navigation/appNavigation.js`, `expo-prototype/src/navigation/routes.js`.

**`expo-prototype/src/tests/`:**
- Purpose: Node validation scripts for Expo data, workflow, sync, draft, submission, and navigation behavior.
- Contains: `validate*.mjs` scripts invoked by `expo-prototype/package.json`.
- Key files: `expo-prototype/src/tests/validateSyncWorkflow.mjs`, `expo-prototype/src/tests/validateQuestionnaireSubmissionWorkflow.mjs`, `expo-prototype/src/tests/validateNavigationPolicy.mjs`.

**`packages/event-core/`:**
- Purpose: Shared event/reducer kernel.
- Contains: event types, helper ordering, household projection reducer, pregnancy projection reducer, task lifecycle, workflow orchestration.
- Key files: `packages/event-core/src/index.ts`, `packages/event-core/src/types.ts`, `packages/event-core/src/household-projection.ts`, `packages/event-core/src/pregnancy-projection.ts`.

**`packages/shared-workflow/`:**
- Purpose: Shared protocol schedule and task generation rules.
- Contains: protocol config, schedule rules, task descriptor generators, tests.
- Key files: `packages/shared-workflow/src/task-generators.ts`, `packages/shared-workflow/src/schedule-rules.ts`, `packages/shared-workflow/src/protocol-config.ts`.

**`packages/shared-domain/`:**
- Purpose: Shared domain identifiers, schemas, DOB helpers, and types.
- Contains: ID builders, zod schemas, domain types, DOB calculations, tests.
- Key files: `packages/shared-domain/src/ids.ts`, `packages/shared-domain/src/schemas.ts`, `packages/shared-domain/src/types.ts`, `packages/shared-domain/src/dob.ts`.

**`packages/shared-context/`:**
- Purpose: Shared prefill/context builders.
- Contains: context builder types and prefill helpers.
- Key files: `packages/shared-context/src/index.ts`, `packages/shared-context/src/builders.ts`, `packages/shared-context/src/prefill.ts`.

**`shared/`:**
- Purpose: Legacy/plain JavaScript shared study master values.
- Contains: package marker and study master constants consumed by Expo.
- Key files: `shared/studyMasters.js`, `shared/package.json`.

**`docs/`:**
- Purpose: Active architecture, policy, testing, and deployment documentation.
- Contains: canonical architecture, active policy docs, testing docs, deployment docs, archived historical docs.
- Key files: `docs/architecture.md`, `docs/testing.md`, `docs/policies/`, `docs/deployment/`.

**`Refs/`:**
- Purpose: Protocol source material and reference inputs.
- Contains: questionnaire/reference files used to validate form content and policy.
- Key files: `Refs/FLOW.md`, `Refs/Unique_Ids.md`.

**`.planning/codebase/`:**
- Purpose: Generated codebase maps consumed by GSD planning/execution commands.
- Contains: `ARCHITECTURE.md`, `STRUCTURE.md`, and other focus-specific maps when generated.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `apps/api/src/index.ts`: backend server entrypoint.
- `apps/api/src/app.ts`: Express app factory and route mount point.
- `expo-prototype/app/_layout.js`: Expo Router root layout and provider wrapper.
- `expo-prototype/app/index.js`: field app redirect to `/worklist`.
- `apps/admin/src/main.tsx`: admin React mount point.
- `apps/admin/src/App.tsx`: admin route map.

**Configuration:**
- `package.json`: npm workspaces and root scripts.
- `turbo.json`: build/test/lint/typecheck task graph.
- `tsconfig.json`: root TypeScript project config.
- `tsconfig.base.json`: shared TypeScript options.
- `Makefile`: canonical local runtime and database commands.
- `apps/api/drizzle.config.ts`: Drizzle configuration.
- `apps/api/package.json`: backend scripts and dependencies.
- `apps/admin/package.json`: admin scripts and dependencies.
- `expo-prototype/package.json`: Expo scripts, dependencies, and validation command chain.
- `expo-prototype/app.json`: Expo app config.

**Core Logic:**
- `docs/architecture.md`: single agreed architecture.
- `docs/policies/`: active policies.
- `apps/api/src/routes/sync.ts`: backend sync pull/push flow.
- `apps/api/src/services/eventProcessor.ts`: backend form promotion flow.
- `packages/event-core/src/`: shared event/reducer kernel.
- `packages/shared-workflow/src/`: shared task generation and scheduling.
- `packages/shared-domain/src/`: shared IDs, schemas, and domain helpers.
- `packages/shared-context/src/`: shared prefill/context logic.
- `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`: local finalized response persistence and provisional promotion.
- `expo-prototype/src/modules/sync/syncService.js`: Expo push/pull orchestration.
- `apps/admin/src/lib/api.ts`: admin API client.

**Testing:**
- `docs/testing.md`: verification command order and caveats.
- `apps/api/src/*.test.ts`: backend unit tests.
- `apps/api/src/*.integration.ts`: backend integration tests.
- `packages/event-core/src/__tests__/`: event-core tests.
- `packages/shared-workflow/src/__tests__/`: shared workflow tests.
- `packages/shared-domain/src/__tests__/`: shared domain tests.
- `packages/shared-context/src/__tests__/`: shared context tests.
- `expo-prototype/src/tests/`: Expo validation scripts.

## Naming Conventions

**Files:**
- Backend TypeScript modules use kebab-case for multi-word filenames: `apps/api/src/routes/area-assignments.ts`, `apps/api/src/lib/syncClock.ts`.
- Backend route files map to URL resources: `apps/api/src/routes/households.ts`, `apps/api/src/routes/form-responses.ts`.
- Backend tests use `.test.ts` and `.integration.ts`: `apps/api/src/app.test.ts`, `apps/api/src/hhq-offline-sync.e2e.integration.ts`.
- Admin React components/pages use PascalCase `.tsx`: `apps/admin/src/pages/HouseholdsPage.tsx`, `apps/admin/src/components/Layout.tsx`.
- Admin styles use co-located CSS modules: `apps/admin/src/pages/HouseholdsPage.module.css`, `apps/admin/src/components/Layout.module.css`.
- Expo route files follow Expo Router conventions: `expo-prototype/app/questionnaires/[formCode]/new.js`, `expo-prototype/app/household-members/[householdId].js`.
- Expo modules use descriptive camelCase/PascalCase `.js`: `expo-prototype/src/modules/sync/syncService.js`, `expo-prototype/src/modules/worklist/WorklistScreen.js`.
- Shared package source uses kebab-case for domain modules: `packages/event-core/src/household-projection.ts`, `packages/shared-workflow/src/schedule-rules.ts`.

**Directories:**
- Runtime apps live under `apps/*` except the field app, which lives under `expo-prototype/`.
- Shared TypeScript packages live under `packages/*`.
- Expo feature code lives under `expo-prototype/src/modules/<feature>/`.
- Expo route declarations live under `expo-prototype/app/`.
- Backend schema slices live under `apps/api/src/db/schema/`.
- Active docs live under `docs/` and `docs/policies/`; archived material lives under `docs/archive/`.

## Where to Add New Code

**New Canon Rule Or Policy:**
- Architecture rule: update `docs/architecture.md`.
- Topic policy: update an existing file under `docs/policies/`.
- Do not add active policy docs under `docs/superpowers/`.
- Treat `docs/archive/` as historical only.

**New Backend API Resource:**
- Route: add `apps/api/src/routes/<resource>.ts`.
- Mount: update `apps/api/src/app.ts`.
- Schema: add or extend `apps/api/src/db/schema/<slice>.ts` and export from `apps/api/src/db/schema/index.ts`.
- Service/domain logic: put non-trivial application logic in `apps/api/src/services/`.
- Tests: add `apps/api/src/<feature>.test.ts` or `apps/api/src/<feature>.integration.ts`.

**New Backend Domain Event Or Projection Rule:**
- Pure event/reducer logic: add to `packages/event-core/src/`.
- Backend persistence or transaction wrapper: add to `apps/api/src/services/`.
- Postgres table/column shape: add to `apps/api/src/db/schema/`.
- Tests: add shared reducer tests under `packages/event-core/src/__tests__/` and backend integration tests under `apps/api/src/`.

**New Task/Scheduling Rule:**
- Shared generator or schedule helper: add to `packages/shared-workflow/src/task-generators.ts` or `packages/shared-workflow/src/schedule-rules.ts`.
- Protocol constants/config: update `packages/shared-workflow/src/protocol-config.ts`.
- Backend persistence: use `apps/api/src/services/taskWriter.ts`.
- Tests: add `packages/shared-workflow/src/__tests__/*.test.ts`.

**New ID, Schema, Or Domain Helper:**
- Shared implementation: add to `packages/shared-domain/src/`.
- Export surface: update `packages/shared-domain/src/index.ts`.
- Tests: add `packages/shared-domain/src/__tests__/*.test.ts`.

**New Prefill Or Context Builder:**
- Shared implementation: add to `packages/shared-context/src/`.
- Expo adapter usage: call from `expo-prototype/src/lib/` or `expo-prototype/src/shell/`.
- Tests: add `packages/shared-context/src/__tests__/*.test.ts` and Expo validation where UI behavior changes.

**New Expo Route:**
- Route file: add under `expo-prototype/app/`.
- Shared shell/context: use `expo-prototype/src/shell/FieldAppShell.js` and `expo-prototype/src/shell/FieldAppProvider.js`.
- Navigation helper: update `expo-prototype/src/navigation/appNavigation.js` or `expo-prototype/src/navigation/routes.js`.
- Feature implementation: add under `expo-prototype/src/modules/<feature>/`.

**New Expo Offline Data Table Or Repository Method:**
- SQLite schema: update `expo-prototype/src/modules/tasks/taskSchema.js` or the feature repository that owns the table.
- Repository method: add to `expo-prototype/src/modules/tasks/taskRepository.js` or `expo-prototype/src/modules/households/householdRepository.js`.
- Sync push/pull mapping: update `expo-prototype/src/modules/sync/syncWorkflow.js` and `expo-prototype/src/modules/sync/syncService.js`.
- Tests: add or extend `expo-prototype/src/tests/validate*.mjs`.

**New Questionnaire Form Or SurveyJS Transform:**
- Form JSON: add under `expo-prototype/src/data/forms/`.
- Form index/catalog: update `expo-prototype/src/data/forms/index.json` and `expo-prototype/src/data/formCatalog.js`.
- Transform/behavior logic: update `expo-prototype/src/modules/questionnaires/` or `expo-prototype/src/lib/`.
- Source verification: follow `docs/policies/questionnaire-authoring.md` and source files under `Refs/`.

**New Admin Page:**
- Page component: add `apps/admin/src/pages/<Name>Page.tsx`.
- Styles: add `apps/admin/src/pages/<Name>Page.module.css`.
- Route: update `apps/admin/src/App.tsx`.
- API calls: use `apps/admin/src/lib/api.ts`.
- Shared layout/auth: use `apps/admin/src/components/Layout.tsx` and `apps/admin/src/components/ProtectedRoute.tsx`.

**Utilities:**
- Backend utilities: `apps/api/src/lib/`.
- Expo utilities: `expo-prototype/src/lib/`.
- Cross-runtime pure utilities: `packages/shared-domain/src/`, `packages/shared-workflow/src/`, `packages/event-core/src/`, or `packages/shared-context/src/`.

## Special Directories

**`docs/archive/`:**
- Purpose: Historical drafts, audits, and prior working notes.
- Generated: No.
- Committed: Yes.
- Rule: Do not treat as active canon.

**`docs/policies/`:**
- Purpose: Active policy docs referenced by `docs/architecture.md`.
- Generated: No.
- Committed: Yes.
- Rule: Use for durable policy updates by topic.

**`apps/api/drizzle/migrations/`:**
- Purpose: Drizzle migration snapshots and SQL.
- Generated: Yes.
- Committed: Yes.
- Rule: Dev repo guidance in `AGENTS.md` prefers DB reset/push over migration churn unless explicitly requested.

**`dist/` under apps/packages:**
- Purpose: TypeScript/Vite build outputs.
- Generated: Yes.
- Committed: No for normal source work.

**`node_modules/` under root/apps/packages:**
- Purpose: npm dependency installs.
- Generated: Yes.
- Committed: No.

**`.turbo/`:**
- Purpose: Turbo cache.
- Generated: Yes.
- Committed: No.

**`.expo/` and `expo-prototype/.expo/`:**
- Purpose: Expo local metadata and devices.
- Generated: Yes.
- Committed: Usually no, except existing tracked metadata should not be changed unless the task requires it.

**`CVs/`:**
- Purpose: Candidate/CV artifacts and a candidate viewer subtree.
- Generated: Mixed.
- Committed: Mixed.
- Rule: Do not touch for DYNAMIC runtime architecture work unless explicitly scoped.

**`.planning/codebase/`:**
- Purpose: Generated codebase maps for GSD agents.
- Generated: Yes.
- Committed: Project-dependent.
- Rule: Update only the requested map files for mapping tasks.

---

*Structure analysis: 2026-06-19*
