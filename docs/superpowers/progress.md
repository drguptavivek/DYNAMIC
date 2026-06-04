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

## Protocol Forms API Alignment (2026-06-04)

| Package/App                     | Files                                           | Status  | Notes                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` — Form catalog       | `src/lib/formCatalog.ts`, `formCatalog.test.ts` | ✅ Done | reads bundled `expo-prototype/src/data/forms` index/files, normalizes version, computes SHA-256 checksums                                             |
| `apps/api` — Protocol endpoints | `src/routes/protocol.ts`                        | ✅ Done | aligns with plan endpoints: `/protocol/forms`, `/protocol/forms/:code`, `/protocol/forms/batch`; keeps aliases                                        |
| Verification                    | root scripts + Ox tools                         | ✅ Done | `npm test`, `npm run typecheck`, `npm run build`, touched-path `oxfmt --check`, `oxlint`, and `git diff --check` pass; `oxlint` reports warnings only |
