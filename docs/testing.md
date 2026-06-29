# DYNAMIC Testing

Use the smallest relevant verification set for the files changed. This document records the detailed command order; `AGENTS.md` only points here.

## Runtime Prerequisites

- Use root Make targets for local services. Do not hand-roll Docker or port-kill commands when a Make target exists.
- The dev DB workflow uses full schema push/reset, not migration churn.
- `make db-migrate` is legacy only.

## Dev Database Order

Use this after DB/schema/runtime changes:

```bash
make db-reset-full
make db-status
make db-smoke
```

Expected smoke result includes `ok: true`, `dev-field-worker`, one assignment, bundled forms, and pulled seed task.

## Common Test Sets

API unit and type checks:

```bash
npm --workspace @dynamic/api test
npm --workspace @dynamic/api run typecheck
```

Event-core tests:

```bash
npm --workspace @dynamic/event-core test
npm --workspace @dynamic/event-core run typecheck
```

Expo tests:

```bash
npm --workspace expo test
```

HHQ backend integration on full-push test DB:

```bash
npm --workspace @dynamic/api run db:test:push
TEST_DATABASE_URL=postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test JWT_SECRET=test_jwt_secret JWT_REFRESH_SECRET=test_refresh_secret npx tsx --test apps/api/src/hhq-offline-sync.e2e.integration.ts
```

## When To Run What

- API-only service/lib changes: API unit tests and API typecheck.
- `packages/event-core` changes: event-core tests/typecheck plus affected API/Expo tests.
- Form-submission trigger changes: event-core tests/typecheck, API tests/typecheck, and Expo tests. These changes must preserve backend/Expo parity and offline submit with zero network calls.
- Expo local workflow or questionnaire behavior changes: `npm --workspace expo test`.
- Sync, HHQ ingest/replay, or DB shape changes: dev DB order plus HHQ backend integration.
- UI-affecting changes: run the relevant tests and verify in the browser/app path.

## Known DB Push Constraint

`drizzle-kit push` using the config barrel can report success while creating no tables in this repo. Use explicit schema files and URL.

Working shape:

```bash
drizzle-kit push --dialect postgresql --schema './src/db/schema/*.ts' --url "<DATABASE_URL>"
```

Do not use:

```bash
DATABASE_URL=... command --url "$DATABASE_URL"
```

The shell expands `$DATABASE_URL` before the one-command assignment is available. Use a literal Makefile URL or `sh -c` after setting `DATABASE_URL`.
