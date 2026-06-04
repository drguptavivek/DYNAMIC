# DYNAMIC PreTSING — Implementation Progress

_Last updated: 2026-06-03 — auto-maintained by Copilot CLI session_

---

## Phase 1 — TypeScript Foundation + Shared Domain ✅ COMPLETE

| Task                                                | Files                                                                           | Status  | Verified               |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | ------- | ---------------------- |
| Turborepo monorepo scaffold                         | `turbo.json`, `tsconfig.base.json`, root `package.json`, `packages/*`, `apps/*` | ✅ Done | 5/5 packages typecheck |
| `packages/shared-domain` — types + Zod + ID helpers | `src/types.ts`, `schemas.ts`, `ids.ts`, `dob.ts`, `__tests__/`                  | ✅ Done | 23/23 tests pass       |
| `apps/api` Drizzle Postgres schema                  | `src/db/schema/` — 11 schema files covering all Section A tables                | ✅ Done | 0 TS errors            |

---

## Phase 2 — Protocol Config + Auth + API Core 🔄 IN PROGRESS

| Task                                                                             | Files                                                                                     | Status     | Verified         |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- | ---------------- |
| `packages/shared-workflow` — protocol config + schedule rules + task generators  | `src/protocol-config.ts`, `schedule-rules.ts`, `task-generators.ts`, `__tests__/`         | ✅ Done    | 46/46 tests pass |
| `apps/api` — JWT auth middleware + login/refresh/devices routes                  | `src/middleware/auth.ts`, `src/lib/jwt.ts`, `src/routes/auth.ts`, `src/routes/devices.ts` | ✅ Done    | 0 TS errors      |
| `apps/api` — Users CRUD + area assignments                                       | `src/routes/users.ts`, `src/routes/area-assignments.ts`, `src/lib/password.ts`            | ✅ Done    | 0 TS errors      |
| `apps/api` — Masters routes (sites, localities, mapping frame + bulk/CSV import) | `src/routes/masters.ts`                                                                   | ✅ Done    | 0 TS errors      |
| `apps/api` — Households + members + tasks + data-quality + sync-logs routes      | `src/routes/households.ts`, `tasks.ts`, `data-quality.ts`, `sync-logs.ts`                 | 🔄 Running | —                |
| `apps/api` — Cohort routes (eligible women, pregnant women, children)            | `src/routes/eligible-women.ts`, `pregnant-women.ts`, `children.ts`                        | ✅ Done    | —                |
| `packages/shared-workflow` — event→task generators (workflow rules)              | `src/task-generators.ts` (expansion)                                                      | 🔄 Running | —                |

---

## Admin UI (apps/admin) 🔄 IN PROGRESS

| Page / Component                                              | Route             | Status     |
| ------------------------------------------------------------- | ----------------- | ---------- |
| App shell — layout, sidebar, auth context, protected routes   | —                 | 🔄 Running |
| Login page                                                    | `/login`          | 🔄 Running |
| Dashboard                                                     | `/`               | 🔄 Running |
| Users management (list, create, edit, deactivate)             | `/users`          | 🔄 Running |
| Study Masters (sites, localities, mapping frame + CSV import) | `/masters`        | 🔄 Running |
| Households (list + detail modal)                              | `/households`     | 🔄 Running |
| Tasks monitoring (list + detail + attempts)                   | `/tasks`          | 🔄 Running |
| Data Quality Flags (review, resolve)                          | `/data-quality`   | 🔄 Running |
| Sync Logs                                                     | `/sync-logs`      | 🔄 Running |
| Eligible Women list + detail                                  | `/eligible-women` | ✅ Done    |
| Pregnant Women list + detail                                  | `/pregnant-women` | ✅ Done    |
| Children list + detail                                        | `/children`       | ✅ Done    |

---

## API Routes Inventory

| Method | Route                                      | Auth          | Done       |
| ------ | ------------------------------------------ | ------------- | ---------- |
| POST   | `/api/v1/auth/login`                       | public        | ✅         |
| POST   | `/api/v1/auth/refresh`                     | public        | ✅         |
| POST   | `/api/v1/auth/logout`                      | bearer        | ✅         |
| POST   | `/api/v1/devices/register`                 | bearer        | ✅         |
| POST   | `/api/v1/devices`                          | central_admin | ✅         |
| GET    | `/api/v1/users/me`                         | bearer        | ✅         |
| GET    | `/api/v1/users`                            | bearer        | ✅         |
| POST   | `/api/v1/users`                            | admin/srs     | ✅         |
| GET    | `/api/v1/users/:id`                        | bearer        | ✅         |
| PATCH  | `/api/v1/users/:id`                        | admin/srs     | ✅         |
| DELETE | `/api/v1/users/:id`                        | admin/srs     | ✅         |
| GET    | `/api/v1/users/:id/area-assignments`       | bearer        | ✅         |
| POST   | `/api/v1/users/:id/area-assignments`       | admin/srs     | ✅         |
| DELETE | `/api/v1/users/:id/area-assignments/:aid`  | admin/srs     | ✅         |
| GET    | `/api/v1/masters/sites`                    | bearer        | ✅         |
| POST   | `/api/v1/masters/sites`                    | central_admin | ✅         |
| GET    | `/api/v1/masters/localities`               | bearer        | ✅         |
| POST   | `/api/v1/masters/localities`               | central_admin | ✅         |
| GET    | `/api/v1/masters/mapping-frame`            | bearer        | ✅         |
| GET    | `/api/v1/masters/mapping-frame/:id`        | bearer        | ✅         |
| POST   | `/api/v1/masters/mapping-frame`            | central_admin | ✅         |
| POST   | `/api/v1/masters/mapping-frame/bulk`       | central_admin | ✅         |
| POST   | `/api/v1/masters/mapping-frame/import-csv` | central_admin | ✅         |
| PATCH  | `/api/v1/masters/mapping-frame/:id`        | central_admin | ✅         |
| GET    | `/api/v1/households`                       | bearer        | ✅         |
| GET    | `/api/v1/households/:id`                   | bearer        | ✅         |
| GET    | `/api/v1/households/:id/members`           | bearer        | ✅         |
| GET    | `/api/v1/households/:id/tasks`             | bearer        | ✅         |
| GET    | `/api/v1/households/:id/events`            | bearer        | ✅         |
| GET    | `/api/v1/tasks`                            | bearer        | ✅         |
| GET    | `/api/v1/tasks/:id`                        | bearer        | ✅         |
| GET    | `/api/v1/tasks/:id/attempts`               | bearer        | ✅         |
| GET    | `/api/v1/data-quality-flags`               | bearer        | ✅         |
| GET    | `/api/v1/data-quality-flags/:id`           | bearer        | ✅         |
| PATCH  | `/api/v1/data-quality-flags/:id`           | admin/srs     | ✅         |
| GET    | `/api/v1/sync-logs`                        | bearer        | ✅         |
| GET    | `/api/v1/sync-logs/:id`                    | bearer        | ✅         |
| GET    | `/api/v1/eligible-women`                   | bearer        | ✅         |
| GET    | `/api/v1/eligible-women/:id`               | bearer        | ✅         |
| GET    | `/api/v1/eligible-women/:id/pregnancies`   | bearer        | ✅         |
| GET    | `/api/v1/eligible-women/:id/tasks`         | bearer        | ✅         |
| GET    | `/api/v1/pregnant-women`                   | bearer        | ✅         |
| GET    | `/api/v1/pregnant-women/:pregnancy_id`     | bearer        | ✅         |
| GET    | `/api/v1/children`                         | bearer        | ✅         |
| GET    | `/api/v1/children/:id`                     | bearer        | ✅         |
| POST   | `/api/v1/sync/push`                        | bearer        | ⏳ Phase 3 |
| GET    | `/api/v1/sync/pull`                        | bearer        | ⏳ Phase 3 |
| GET    | `/api/v1/protocol-config`                  | bearer        | ⏳ Phase 3 |
| GET    | `/api/v1/forms/:code/latest`               | bearer        | ⏳ Phase 3 |

---

## Packages Status

| Package                    | Purpose                                          | Tests    | Status     |
| -------------------------- | ------------------------------------------------ | -------- | ---------- |
| `@dynamic/shared-domain`   | TS types, Zod schemas, ID helpers, DOB inference | 23 pass  | ✅ Done    |
| `@dynamic/shared-workflow` | Protocol config, schedule rules, task generators | 46 pass  | ✅ Done    |
| `@dynamic/shared-context`  | Context builders + prefill mappers               | skeleton | ⏳ Phase 3 |

---

## Phases Remaining

| Phase       | Description                                                           | Depends On |
| ----------- | --------------------------------------------------------------------- | ---------- |
| **Phase 3** | Context builders + prefill mappers (HHQ, WQ, HRF, PEF stubs for rest) | Phase 2 ✅ |
| **Phase 4** | Expo Android — SQLite schema + Drizzle + domain store                 | Phase 1 ✅ |
| **Phase 5** | Expo task-based UI — worklist, form opening, task attempts            | Phase 4    |
| **Phase 6** | Offline sync — outbox push, pull merge, conflict handling             | Phase 5    |
| **Phase 7** | Admin app — correction workflow, data quality resolution              | Phase 2    |
| **Phase 8** | Integration testing + production readiness                            | All phases |

---

## Tech Stack

| Layer           | Choice                  |
| --------------- | ----------------------- |
| Monorepo        | Turborepo               |
| Shared packages | TypeScript + Zod        |
| Backend API     | Node.js + Express       |
| Backend ORM     | Drizzle ORM + Postgres  |
| Admin app       | Vite + React 18         |
| Expo ORM        | Drizzle ORM + op-sqlite |
| Form renderer   | SurveyJS                |

---

## Key Architecture Decisions

- SurveyJS JSON = rendering layer only. Domain model is normalized Postgres/SQLite tables.
- WQ reproductive history captured in `answers_json` only — no prior pregnancy records.
- VA tasks generated immediately on death/stillbirth but `form_availability='disabled'` until VA JSON ready (~4 weeks from 2026-06-03).
- JWT: 2-day access token, 30-day refresh token.
- Offline sync: outbox pattern. First synced completion wins; duplicates flagged.
- Task keys are deterministic for offline/backend dedup.
- Schedule anchors never shift on late completion (HRF, PFF, NFF).

## Phase 4 — Expo Android App

| Package/App                           | Files                                     | Status  | Notes                                                     |
| ------------------------------------- | ----------------------------------------- | ------- | --------------------------------------------------------- |
| `expo-prototype` — Task SQLite schema | `src/modules/tasks/taskSchema.js`         | ✅ Done | follow_up_tasks, task_attempts, form_responses, sync_meta |
| `expo-prototype` — Auth store         | `src/modules/auth/authStore.js`           | ✅ Done | JWT in SQLite sync_meta                                   |
| `expo-prototype` — Sync service       | `src/modules/sync/syncService.js`         | ✅ Done | pull/push + SyncScreen                                    |
| `expo-prototype` — Task repo          | `src/modules/tasks/taskRepository.js`     | ✅ Done | list/save/complete/attempts                               |
| `expo-prototype` — Worklist screens   | `WorklistScreen.js`, `TaskDetailModal.js` | ✅ Done | Overdue/Today/Upcoming grouping                           |

## Phase 3 — Sync API + Shared Context (launched 2026-06-04)

| Package/App                           | Files                                                   | Status  | Notes                                                  |
| ------------------------------------- | ------------------------------------------------------- | ------- | ------------------------------------------------------ |
| `apps/api` — Sync API                 | `src/routes/sync.ts` (push + pull)                      | ✅ Done | locality-scoped, cursor pagination, 0 TS errors        |
| `apps/api` — Protocol/Forms endpoints | `src/routes/protocol.ts`                                | ✅ Done | GET /protocol/config, GET /protocol/forms/:code/latest |
| `packages/shared-context`             | builders.ts, prefill.ts, types.ts                       | ✅ Done | 8/8 tests, 0 TS errors                                 |
| `apps/api` — DB migrations            | `drizzle/migrations/0000_sparkling_golden_guardian.sql` | ✅ Done | 23 tables, docker-compose.yml at root                  |

## Phase 4 — Admin Corrections + Form Responses (2026-06-04)

| Package/App                         | Files                                                                                 | Status  | Notes                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| `apps/api` — Admin corrections      | `src/routes/corrections.ts`, `src/db/schema/corrections.ts`                           | ✅ Done | POST/GET household+member corrections, audit trail, role-guarded |
| `apps/api` — Form responses         | `src/routes/form-responses.ts`                                                        | ✅ Done | list + detail with answers_json, prefill_snapshot                |
| `expo-prototype` — Prefill + events | `src/lib/prefillMapper.js`, `src/modules/events/eventOutbox.js`, `eventGenerators.js` | ✅ Done | 3/3 tests pass                                                   |

## Phase 5 — Form→Entity Promotion (2026-06-04)

| Package/App                  | Files                            | Status  | Notes                                                         |
| ---------------------------- | -------------------------------- | ------- | ------------------------------------------------------------- |
| `apps/api` — Event processor | `src/services/eventProcessor.ts` | ✅ Done | 0 TS errors, all 8 form types, field names verified from JSON |
| `apps/api` — Task writer     | `src/services/taskWriter.ts`     | ✅ Done | ON CONFLICT DO NOTHING dedup                                  |

## Phase 6 — Offline Sync Contract Alignment (2026-06-04)

| Package/App                                | Files                                                                    | Status  | Notes                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `expo-prototype` — Sync workflow helpers   | `src/modules/sync/syncWorkflow.js`, `src/tests/validateSyncWorkflow.mjs` | ✅ Done | active area locality extraction + unified push records                                                                 |
| `expo-prototype` — API contract wiring     | `src/modules/auth/authStore.js`, `src/modules/sync/syncService.js`       | ✅ Done | unwrap `{data, meta}` API responses; sync order is assignment refresh → push → pull; push sends `{device_id, records}` |
| `apps/api` — Current user sync assignments | `src/routes/users.ts`                                                    | ✅ Done | `/api/v1/users/me` now includes `area_assignments` for Expo sync                                                       |
| Workspace verification                     | root scripts                                                             | ✅ Done | `npm test`, `npm run build`, `npm run typecheck` pass on 2026-06-04                                                    |

## Review Fixes — Sync Contract Hardening (2026-06-04)

| Finding                                                      | Files                                                                         | Status  | Notes                                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Pull filters used household columns for non-household tables | `apps/api/src/routes/sync.ts`                                                 | ✅ Done | per-table site/locality filters; children locality scope resolved through scoped household IDs                        |
| Backend task payload did not match Expo local task schema    | `apps/api/src/routes/sync.ts`                                                 | ✅ Done | backend task rows mapped to Expo DTO fields: `id`, `window_end`, `assigned_locality_code`, visible local status       |
| Push cleared records despite per-record API errors           | `expo-prototype/src/modules/sync/syncService.js`, `syncWorkflow.js`           | ✅ Done | clear only accepted/duplicate response/event IDs; surface per-record server errors                                    |
| Domain event wrapper did not match backend ingest shape      | `expo-prototype/src/modules/sync/syncWorkflow.js`, `validateSyncWorkflow.mjs` | ✅ Done | flatten outbox payload into pushed domain event records                                                               |
| Verification after review fixes                              | root scripts                                                                  | ✅ Done | `npm test`, `npm run build`, `npm run typecheck`, and `git diff --check` pass after review fixes                      |
| Ad hoc lint/format                                           | `npx oxlint@latest`, `npx oxfmt@latest`                                       | ✅ Done | `oxlint` exits 0 with warnings; staged implementation paths pass `oxfmt --check`; unrelated Refs/forms churn reverted |

## Commit Log (2026-06-04)

| Commit    | Summary                           | Notes                                                                                             |
| --------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `5e8e100` | Fullstack offline sync foundation | API/admin/shared package scaffold, Expo worklist/sync wiring, legacy `backend/` workspace removed |
| `753ec6c` | Align protocol forms API with plan | protocol forms list/detail/batch endpoints with bundled form catalog |
| `2225673` | Use bundled form checksums in sync pull | sync pull protocol payload now uses the same bundled form catalog checksums |
| `d396d16` | Refresh Expo form cache from protocol checksums | Expo sync stores protocol form cache metadata from backend pull |
| `8ca380f` | Add custom dev ports and Nginx HMR edge | custom Postgres/API/admin/Expo/Nginx ports; Nginx dev routing with Vite HMR; API dev without watcher |
| `f846be7` | Add API integration smoke tests | `dynamic_test` setup on Postgres port 55432 plus API smoke integration coverage |
| `ee00a6f` | Cover admin user APIs with integration tests | user CRUD and area-assignment integration coverage; route mounting fixed |
| `6020b4f` | Cover masters APIs with integration tests | masters + mapping-frame integration coverage; root `npm test` now includes API integration tests |
| `f6cd0e8` | Surface sync and promotion failures | swallowed sync/promotion errors now fail loudly instead of looking like empty queues |
| `1b394b7` | Replace shared prefill placeholders | UF/PFF/POF/BAF/SBF/NFF/CDF/VA shared-context prefill builders return read-only lineage fields |
| `8fd6e67` | Cover admin correction workflows | data-quality review, form-response detail, correction audit/update coverage; admin corrections migration added |

## API Integration Coverage (2026-06-04)

| Area                   | Files                                      | Status  | Notes                                                                                 |
| ---------------------- | ------------------------------------------ | ------- | ------------------------------------------------------------------------------------- |
| API app test factory   | `apps/api/src/app.ts`, `index.ts`          | ✅ Done | tests create an in-process server; dev/prod entrypoint listens separately             |
| Dev/test DB seed       | `apps/api/src/dev/dev-seed.ts`             | ✅ Done | shared field worker + central admin seed data for smoke/integration tests             |
| Smoke sync/API         | `apps/api/src/smoke.integration.ts`        | ✅ Done | auth, current user assignments, protocol config/forms, pull/push smoke path           |
| Admin users            | `apps/api/src/admin-users.integration.ts`  | ✅ Done | central admin create/patch/deactivate user and area-assignment lifecycle              |
| Masters/mapping frame  | `apps/api/src/masters.integration.ts`      | ✅ Done | central admin sites, localities, mapping-frame create/read/patch/bulk/conflict coverage |
| Admin correction/review workflows | `apps/api/src/admin-workflows.integration.ts`, `drizzle/migrations/0001_admin_corrections.sql` | ✅ Done | data-quality review, form-response detail, correction audit/update coverage; missing admin corrections migration fixed |

## Review Fixes — Error Visibility + Test Edge (2026-06-04)

| Finding                                      | Files                                                                                                      | Status     | Notes                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| Persistent test DB coverage could be skipped | `package.json`, `apps/api/src/masters.integration.ts`                                                      | ✅ Done    | root `npm test` now runs API integration tests; masters test uses high-range random IDs |
| Admin app bypassed Nginx edge by default     | `apps/admin/src/lib/api.ts`                                                                                | ✅ Done    | default API base is relative `/api/v1`; explicit `VITE_API_BASE_URL` still supported  |
| Swallowed promotion/sync errors              | `eventProcessor.ts`, `taskWriter.ts`, Expo task/event/submission repositories                              | ✅ Done    | sync/promotion failures now surface instead of looking like empty queues or success   |
| Shared-context placeholder prefill builders  | `packages/shared-context/src/prefill.ts`, `types.ts`, `builders.ts`, `__tests__/prefill.test.ts`           | ✅ Done    | UF/PFF/POF/BAF/SBF/NFF/CDF/VA builders now return read-only lineage prefill fields    |
| Nested workspace `node_modules` audit        | workspace filesystem                                                                                       | ✅ Done    | nested installs are currently needed for workspace-local bins such as Vite; root `npm install --cache /private/tmp/dynamic-npm-cache` restored them |
| Nginx dev edge smoke                         | `http://127.0.0.1:58080`                                                                                   | ✅ Done    | `/` serves Vite with `/@vite/client`; `/health` proxies to API; protected `/api/v1/*` routes traverse Nginx |
| Sync cursor persistence                      | `expo-prototype/src/modules/sync/syncService.js`, `syncWorkflow.js`, `validateSyncWorkflow.mjs`            | ✅ Done    | Expo pull now persists backend `sync_cursor` instead of local client time |
| Promotion failure propagation                | `apps/api/src/services/eventProcessor.ts`                                                                  | ✅ Done    | WQ/PEF/UF/POF/BAF/NFF/CDF promotion errors now rethrow so sync push cannot mark failed promotion as accepted |
| SRS correction site scope                    | `apps/api/src/routes/corrections.ts`, `admin-workflows.integration.ts`                                     | ✅ Done    | Site Research Scientist correction writes are denied outside the user's site |

## Protocol Forms API Alignment (2026-06-04)

| Package/App                     | Files                                           | Status  | Notes                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` — Form catalog       | `src/lib/formCatalog.ts`, `formCatalog.test.ts` | ✅ Done | reads bundled `expo-prototype/src/data/forms` index/files, normalizes version, computes SHA-256 checksums                                             |
| `apps/api` — Protocol endpoints | `src/routes/protocol.ts`                        | ✅ Done | aligns with plan endpoints: `/protocol/forms`, `/protocol/forms/:code`, `/protocol/forms/batch`; keeps aliases                                        |
| Verification                    | root scripts + Ox tools                         | ✅ Done | `npm test`, `npm run typecheck`, `npm run build`, touched-path `oxfmt --check`, `oxlint`, and `git diff --check` pass; `oxlint` reports warnings only |

## Sync Form Version Manifest (2026-06-04)

| Package/App                     | Files                                          | Status  | Notes                                                                               |
| ------------------------------- | ---------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `apps/api` — Sync form manifest | `src/routes/sync.ts`, `src/lib/formCatalog.ts` | ✅ Done | `/sync/pull` form_versions now come from the bundled catalog with SHA-256 checksums |
| Verification                    | API tests + API typecheck                      | ✅ Done | 6/6 API form-catalog tests pass; API typecheck passes                               |

## Expo Form Cache Refresh (2026-06-04)

| Package/App                         | Files                                                | Status  | Notes                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `expo-prototype` — Form cache sync  | `src/modules/sync/syncService.js`, `syncWorkflow.js` | ✅ Done | compares pull `form_versions` checksums, downloads changed forms from `/protocol/forms/batch`, stores JSON in `sync_meta` |
| `expo-prototype` — Sync UI feedback | `SyncScreen.js` via `formatSyncCompletionMessage`    | ✅ Done | sync completion message now reports updated form count                                                                    |
| Verification                        | prototype tests + root typecheck                     | ✅ Done | sync workflow helper tests pass; root typecheck passes                                                                    |

## Custom Dev Ports + Live API Smoke (2026-06-04)

| Area                    | Files / Commands                                                                         | Status  | Notes                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| Custom local ports      | `docker-compose.yml`, API/admin/Expo scripts and API config                              | ✅ Done | Postgres `55432`, Redis `56379`, API `3310`, admin dev `5317`, admin preview `5318`, Expo `8088`       |
| Shared Postgres test DB | `apps/api/src/dev/ensure-test-db.ts`, `npm --workspace @dynamic/api run db:test:migrate` | ✅ Done | creates/migrates `dynamic_test` inside the same Postgres container and host port as `dynamic_dev`      |
| Live API smoke          | `apps/api/src/dev/smoke-dev.ts`, `npm --workspace @dynamic/api run smoke:dev`            | ✅ Done | seeded dev user/data, then verified login, `/users/me`, protocol forms, sync pull, and empty sync push |
| Runtime hygiene         | API process on port `3310`                                                               | ✅ Done | stopped after smoke; port `3310` verified free                                                         |

## Same-VM Edge Routing (2026-06-04)

| Area                 | Files                                             | Status  | Notes                                                                                                     |
| -------------------- | ------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| Nginx edge container | `docker-compose.yml`, `deploy/nginx/default.conf` | ✅ Done | proxies admin Vite dev server with HMR and proxies `/api/v1/*` plus `/health` to API port `3310`; local edge port `58080` |
| Deployment note      | `docs/deployment/same-vm-nginx.md`                | ✅ Done | recommends Nginx for same-VM admin/API routing; HAProxy reserved for later multi-node load balancing      |
| Dev proxy verification | curl + API smoke through `http://localhost:58080` | ✅ Done | verified admin HTML, Vite client, `/health`, and full API smoke through Nginx                             |

## API Integration Test Harness (2026-06-04)

| Area                      | Files / Commands                                              | Status  | Notes                                                                                               |
| ------------------------- | ------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Express app factory       | `apps/api/src/app.ts`, `apps/api/src/app.test.ts`             | ✅ Done | route setup can be tested in-process without binding API port `3310`                                |
| Reusable dev/test seed    | `apps/api/src/dev/dev-seed.ts`, `smoke-dev.ts`                | ✅ Done | smoke script and integration tests share deterministic seed data                                    |
| Test DB integration smoke | `apps/api/src/smoke.integration.ts`, `npm --workspace @dynamic/api run test:integration` | ✅ Done | migrates `dynamic_test`, then verifies login, `/users/me`, protocol forms, sync pull, and sync push |
| Admin user integration    | `apps/api/src/admin-users.integration.ts`, `apps/api/src/app.ts` | ✅ Done | covers central-admin user create/patch/deactivate and area assignment create/list/delete; fixed area-assignment router mount |
