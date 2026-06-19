# Coding Conventions

**Analysis Date:** 2026-06-19

## Naming Patterns

**Files:**
- Use lowercase route and library filenames for API modules, with kebab-case where the route name has multiple words: `apps/api/src/routes/area-assignments.ts`, `apps/api/src/routes/household-members.ts`, `apps/api/src/lib/syncClock.ts`.
- Use PascalCase filenames for React components and pages in the admin app: `apps/admin/src/components/ProtectedRoute.tsx`, `apps/admin/src/pages/DataQualityPage.tsx`, `apps/admin/src/pages/HouseholdMembersPage.tsx`.
- Use package-level `src/__tests__/*.test.ts` for shared package tests: `packages/shared-domain/src/__tests__/ids.test.ts`, `packages/shared-workflow/src/__tests__/task-generators.test.ts`.
- Use Expo JavaScript feature modules under `expo-prototype/src/modules/<feature>/`: `expo-prototype/src/modules/sync/syncWorkflow.js`, `expo-prototype/src/modules/questionnaires/questionnaireDraftRepository.js`, `expo-prototype/src/modules/households/householdRepository.js`.
- Keep generated or extracted SurveyJS form JSON under `expo-prototype/src/data/forms/`; questionnaire catalog wiring lives in `expo-prototype/src/data/formCatalog.js`.

**Functions:**
- Use lower camelCase for regular functions and helpers: `createApp` in `apps/api/src/app.ts`, `getPagination` in `apps/api/src/lib/pagination.ts`, `reduceHouseholdProjection` in `packages/event-core/src/household-projection.ts`.
- Use `use*` names for React hooks: `useAuth` in `apps/admin/src/lib/auth-context.tsx`.
- Use `build*`, `generate*`, `select*`, `summarize*`, and `format*` prefixes for pure transformation helpers: `buildTaskKey` in `packages/shared-domain/src/ids.ts`, `generateHrfSchedule` in `packages/shared-workflow/src/schedule-rules.ts`, `selectNextPullCursor` in `expo-prototype/src/modules/sync/syncWorkflow.js`.
- Preserve established exported names even when inconsistent, such as `buildMemberID` in `packages/shared-domain/src/ids.ts`; avoid opportunistic renames outside a focused refactor.
- Use PascalCase for React component functions: `App` in `apps/admin/src/App.tsx`, `HouseholdModule` in `expo-prototype/src/modules/households/HouseholdModule.js`, `QuestionnaireDashboard` in `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`.

**Variables:**
- Use lower camelCase for TypeScript local variables derived from request/query parameters: `siteIdStr`, `taskType`, `perPageStr` in `apps/api/src/routes/tasks.ts`.
- Preserve database, protocol, and JSON field names as snake_case at API boundaries: `household_id`, `site_id`, `locality_code`, `task_key` in `apps/api/src/db/schema/tasks.ts` and `packages/event-core/src/types.ts`.
- Use upper snake case for local constants that act as stable configuration keys: `HHQ_CODE` and `PAGE_SIZE` in `expo-prototype/src/modules/households/HouseholdModule.js`, `DRAFT_STORAGE_KEY` in `expo-prototype/src/modules/questionnaires/questionnaireDraftRepository.js`.
- Use descriptive state setter pairs in React code: `syncError` / `setSyncError` in `expo-prototype/src/modules/sync/SyncScreen.js`, `user` / `setUser` in `apps/admin/src/lib/auth-context.tsx`.

**Types:**
- Use PascalCase for interfaces, type aliases, and domain payload types: `DomainEventEnvelope`, `HouseholdProjection`, and `PregnancyProjection` in `packages/event-core/src/types.ts`.
- Prefer typed parameter objects for domain helpers with many inputs: `TaskKeyParams` in `packages/shared-domain/src/ids.ts` and `TaskDescriptor` generation params in `packages/shared-workflow/src/task-generators.ts`.
- Keep Drizzle schema exports lower camelCase and plural where they represent tables: `followUpTasks` and `taskAttempts` in `apps/api/src/db/schema/tasks.ts`.
- Use Zod schemas with lower camelCase `*Schema` names close to their route handlers: `loginSchema` and `refreshSchema` in `apps/api/src/routes/auth.ts`.

## Code Style

**Formatting:**
- Use two-space indentation, double quotes, and semicolons in TypeScript files: `apps/api/src/app.ts`, `packages/shared-workflow/src/task-generators.ts`, `apps/admin/src/lib/api.ts`.
- Use trailing commas in multiline object, array, and argument lists where the surrounding file already does: `apps/api/src/routes/households.ts`, `packages/shared-context/src/__tests__/prefill.test.ts`, `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`.
- Expo JavaScript follows the same general style, but some older modules omit trailing commas in object literals; preserve the local file style when editing `expo-prototype/src/modules/households/householdIds.js`.
- No Prettier, Biome, or ESLint config is detected in the repo root; `package.json` exposes `npm run lint` through `turbo.json`, but workspace `package.json` files such as `apps/api/package.json` and `apps/admin/package.json` do not define `lint` scripts.

**Linting:**
- Treat TypeScript strictness as the primary quality gate for API and shared packages: `tsconfig.base.json` sets `strict: true`, and `apps/api/package.json`, `packages/event-core/package.json`, `packages/shared-domain/package.json`, and `packages/shared-workflow/package.json` define `typecheck`.
- The admin app explicitly relaxes TypeScript strictness with `"strict": false` in `apps/admin/tsconfig.json`; avoid spreading admin-only looseness into `apps/api` or `packages/*`.
- Expo inherits Expo defaults via `expo-prototype/tsconfig.json`, while implementation files are JavaScript under `expo-prototype/src/modules/` and route files are JavaScript under `expo-prototype/app/`.
- Use the active verification guidance in `docs/testing.md` and `AGENTS.md`; run the smallest relevant command instead of relying on `npm run lint`.

## Import Organization

**Order:**
1. External packages and Node built-ins first, as in `apps/api/src/routes/auth.ts` and `apps/api/src/app.test.ts`.
2. Workspace package imports next where applicable, as in `apps/api/src/services/eventProcessor.ts` importing `@dynamic/event-core` and `@dynamic/shared-workflow`.
3. Relative local modules after external imports, as in `apps/admin/src/App.tsx`, `packages/shared-workflow/src/task-generators.ts`, and `expo-prototype/src/modules/households/HouseholdModule.js`.
4. Keep type imports with the related value imports unless a file already separates them; `apps/api/src/routes/auth.ts` imports `Router`, `Request`, and `Response` together from `express`.

**Path Aliases:**
- No TypeScript path aliases are configured in `tsconfig.base.json`; use workspace package names for package boundaries, such as `@dynamic/event-core` in `apps/api/package.json`.
- Use relative imports inside each package: `../db`, `../lib/errors`, and `../middleware/auth` in `apps/api/src/routes/auth.ts`.
- Expo JavaScript modules use explicit `.js` extensions when importing across module files: `expo-prototype/src/modules/sync/syncService.js` imports `../tasks/taskRepository.js` and `./syncWorkflow.js`.
- Cross-boundary Expo-to-shared imports currently use relative paths, such as `../../../../shared/studyMasters.js` in `expo-prototype/src/modules/households/householdIds.js`; do not add aliases without updating bundler and tests.

## Error Handling

**Patterns:**
- API routes wrap asynchronous handlers in `try` / `catch`, log operational failures with `console.error`, and respond with `sendError` / `sendSuccess` from `apps/api/src/lib/errors.ts`.
- API validation uses Zod schemas near the route code and returns `VALIDATION_ERROR` details, as in `apps/api/src/routes/auth.ts` and `apps/api/src/routes/masters.ts`.
- Authentication middleware returns early after failures and attaches `req.user` only after token verification in `apps/api/src/middleware/auth.ts`.
- Admin API calls normalize server failures by throwing `Error(json?.error?.message ?? ...)` in `apps/admin/src/lib/api.ts`; page components catch and set UI error state, as in `apps/admin/src/pages/TasksPage.tsx`.
- Expo storage and sync code catches local parse/storage failures, logs with `console.error`, and falls back to empty structures where that is the established behavior: `expo-prototype/src/modules/sync/syncWorkflow.js`, `expo-prototype/src/modules/questionnaires/questionnaireDraftRepository.js`, `expo-prototype/src/modules/sync/syncService.js`.
- Shared reducer and workflow packages should stay pure and deterministic; return typed results for normal rule outcomes and throw only for programmer errors or impossible input, as in `packages/event-core/src/household-projection.ts` and `packages/shared-domain/src/ids.ts`.

## Logging

**Framework:** console

**Patterns:**
- Use `console.error` for caught operational failures in API routes and services: `apps/api/src/routes/tasks.ts`, `apps/api/src/routes/households.ts`, `apps/api/src/services/eventProcessor.ts`.
- Use `console.error` in Expo modules when local storage, SQLite, or sync actions fail: `expo-prototype/src/modules/sync/SyncScreen.js`, `expo-prototype/src/modules/events/eventOutbox.js`, `expo-prototype/src/modules/households/householdRepository.js`.
- Validation scripts may print one success line at the end, as in `expo-prototype/src/tests/validateSyncWorkflow.mjs` and `expo-prototype/src/tests/validateSurveyNavigation.mjs`.
- Do not add broad `console.log` debugging to app paths; prefer tests or targeted status state in `apps/admin/src/pages/*` and `expo-prototype/src/modules/*`.

## Comments

**When to Comment:**
- Use short route contract comments above Express handlers when they clarify API purpose: `apps/api/src/routes/tasks.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/routes/households.ts`.
- Use comments for non-obvious policy or runtime constraints, such as the Drizzle schema barrel note in `apps/api/src/db/schema/index.ts` and the Expo-import `@ts-ignore` explanation in `apps/api/src/hhq-offline-sync.e2e.integration.ts`.
- Avoid comments that restate simple assignments; helper names in `packages/shared-workflow/src/task-generators.ts` and `expo-prototype/src/modules/sync/syncWorkflow.js` should carry the meaning.

**JSDoc/TSDoc:**
- JSDoc-style blocks are used for middleware and API route intent in `apps/api/src/middleware/auth.ts` and `apps/api/src/routes/auth.ts`.
- Expo JavaScript modules use occasional JSDoc-style comments for storage/outbox operations in `expo-prototype/src/modules/events/eventOutbox.js`.
- Public shared package exports should be understandable from names and types first; add TSDoc only when the behavior encodes protocol nuance in `packages/event-core/src/types.ts` or `packages/shared-workflow/src/schedule-rules.ts`.

## Function Design

**Size:** Keep shared functions focused and side-effect free where they encode study rules. Examples: `reduceHouseholdProjection` in `packages/event-core/src/household-projection.ts`, `buildTaskKey` in `packages/shared-domain/src/ids.ts`, and `calculateSurveyProgress` in `expo-prototype/src/modules/questionnaires/surveyNavigation.js`.

**Parameters:** Use object parameters for domain operations with multiple fields, as in `buildDraftKey` in `expo-prototype/src/modules/questionnaires/questionnaireDraftRepository.js` and `onEligibleWomanIdentified` in `packages/shared-workflow/src/task-generators.ts`.

**Return Values:** Return explicit data objects for API responses and pure helpers. API handlers use `{ data, meta }` envelopes through `sendSuccess` in `apps/api/src/lib/errors.ts`; sync helpers return normalized records and summaries in `expo-prototype/src/modules/sync/syncWorkflow.js`.

**Time and Dates:** Follow `docs/architecture.md` and `docs/policies/form-lifecycle-and-sync.md`: protocol dates are `YYYY-MM-DD` calendar dates. Prefer passing dates into testable helpers, as `collectAssignedLocalityCodes(user, today)` does in `expo-prototype/src/modules/sync/syncWorkflow.js`, and avoid hidden clock anchors in shared workflow logic under `packages/shared-workflow/src/`.

**State Boundaries:** Do not promote workflow, routing, reporting, scheduling, or analysis values only through raw `answers_json`; promote typed state per `docs/architecture.md`, `docs/policies/questionnaire-authoring.md`, and existing promotion code in `apps/api/src/services/hhqPromotion.ts`.

## Module Design

**Exports:**
- API route modules default-export an Express router: `apps/api/src/routes/auth.ts`, `apps/api/src/routes/tasks.ts`, `apps/api/src/routes/households.ts`.
- Shared packages use named exports from focused modules and index barrels: `packages/event-core/src/index.ts`, `packages/shared-domain/src/index.ts`, `packages/shared-workflow/src/index.ts`.
- Admin components and pages commonly default-export React components: `apps/admin/src/App.tsx`, `apps/admin/src/pages/LoginPage.tsx`.
- Expo feature modules use named exports for helpers and screen components: `expo-prototype/src/modules/sync/syncWorkflow.js`, `expo-prototype/src/modules/questionnaires/surveyNavigation.js`, `expo-prototype/src/modules/households/HouseholdModule.js`.

**Barrel Files:**
- Use package barrels for shared exports: `packages/event-core/src/index.ts`, `packages/shared-domain/src/index.ts`, `packages/shared-context/src/index.ts`, `packages/shared-workflow/src/index.ts`.
- Use the Drizzle schema barrel for database schema aggregation: `apps/api/src/db/schema/index.ts`.
- Avoid new broad barrels inside feature folders unless they simplify an established import boundary; current API routes import direct files from `apps/api/src/routes/`, and Expo modules import direct files under `expo-prototype/src/modules/`.

**Policy Constraints:**
- Treat `AGENTS.md`, `docs/testing.md`, `docs/architecture.md`, and `docs/policies/*.md` as active guidance.
- Treat `docs/archive/` as historical only; do not cite it as the source of coding rules.
- Do not create active policy docs under `docs/superpowers/`; durable DYNAMIC rules belong in `docs/architecture.md` or `docs/policies/`.

---

*Convention analysis: 2026-06-19*
