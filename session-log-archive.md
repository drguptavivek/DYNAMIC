# Session Log Archive

Detailed replay notes live here. Keep `session-log.md` compact for session injection.

## 2026-06-18 09:14 Runtime Standardization

Goal: Standardize DYNAMIC local dev runtime commands.

Decisions:
- Root Makefile owns dev startup because services need one reproducible container/HMR path.
- Host backend/admin/Expo logs stream foreground-only because PID/log files caused stale-runtime confusion.
- Container DB/edge logs use Make targets because Docker already owns those logs.

Rejected:
- Hand-rolled docker/npm startup when Make targets exist.
- Host log or PID files for HMR servers.

Open:
- Keep browser verification after runtime changes.

Replay notes:
- Use `make dev-up` for DB, schema prep, seed, edge, and HMR startup.
- Use `make dev-prepare` when DB/schema/seed/edge are needed without HMR.
- Use `make hmr-up`, `make backend-up`, `make app-up`, or `make expo-up` for foreground HMR logs.
- Use `make db-logs`, `make edge-logs`, or `make dev-logs` for Docker-owned logs.

## 2026-06-18 10:04 HHQ Event Ingest And Replay

Goal: Preserve event-driven HHQ ingest/replay checkpoint before wiring later workflows.

Decisions:
- `packages/event-core` is the shared kernel foundation because backend and Expo must use identical field-originated rules.
- Backend HHQ ingest stores immutable form responses and domain event rows.
- First valid HHQ completion applies to household/member/eligible-woman/task projections.
- Later HHQ completions for the same household are accepted as immutable evidence, marked duplicate, emitted as `held_duplicate`, and flagged in `data_quality_flags`.
- Household replay rebuilds core HHQ projection fields from applied HHQ baseline events plus immutable form response evidence.
- Expo HHQ local submission writes provisional `household_baseline_confirmed` events into `domain_events_outbox`.
- Dev DB reset uses full schema push, not migrations.

Rejected:
- Adding Cedar/OPA before command/event boundaries stabilize.
- Continuing procedural-only HHQ promotion as the long-term sync path.
- Adding migration files for dev schema churn.

Open:
- Wire next workflow slice beyond HHQ baseline replay.
- Continue from event-core envelopes rather than adding new procedural-only promotions.

Files changed in commit `c273568 Implement HHQ event ingest and replay`:
- `Makefile`
- `apps/api/package.json`
- `package-lock.json`
- `apps/api/src/services/eventProcessor.ts`
- `apps/api/src/hhq-offline-sync.e2e.integration.ts`
- `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`
- `expo-prototype/src/modules/tasks/taskRepository.js`
- `expo-prototype/src/tests/validateQuestionnaireSubmissionWorkflow.mjs`
- `session-log.md`

Replay command order:
1. `make db-reset-full`
2. `make db-status`
3. `make db-smoke`
4. `npm --workspace @dynamic/api test`
5. `npm --workspace @dynamic/api run typecheck`
6. `npm --workspace @dynamic/event-core test`
7. `npm --workspace @dynamic/event-core run typecheck`
8. `npm --workspace expo-prototype test`
9. `npm --workspace @dynamic/api run db:test:push`
10. `TEST_DATABASE_URL=postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test JWT_SECRET=test_jwt_secret JWT_REFRESH_SECRET=test_refresh_secret npx tsx --test apps/api/src/hhq-offline-sync.e2e.integration.ts`

Observed verification:
- `make db-reset-full` succeeded after adding Docker Compose `--wait` and explicit Drizzle schema push.
- `make db-smoke` returned ok with `dev-field-worker`, 1 assignment, 11 forms, and 1 pulled task.
- API tests and typecheck passed.
- Event-core tests and typecheck passed.
- Expo prototype tests passed.
- HHQ backend integration passed against the full-push test DB.

Important root cause:
- `drizzle-kit push` using the config barrel reported success but created no tables.
- The working dev command is explicit: `drizzle-kit push --dialect postgresql --schema './src/db/schema/*.ts' --url "<DATABASE_URL>"`.
- Do not use `VAR=value command --url "$VAR"` because `$VAR` expands before the one-command assignment is in scope. Use a literal Makefile URL or `sh -c` after setting `DATABASE_URL`.
