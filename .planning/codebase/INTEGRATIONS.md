# External Integrations

**Analysis Date:** 2026-06-19

## APIs & External Services

**Internal HTTP API:**
- Express API - Serves DYNAMIC backend routes under `/api/v1` from `apps/api/src/app.ts` with route modules in `apps/api/src/routes/`.
  - SDK/Client: Browser/native `fetch` wrappers in `apps/admin/src/lib/api.ts`, `expo-prototype/src/modules/auth/authStore.js`, and `expo-prototype/src/modules/sync/syncService.js`.
  - Auth: Bearer JWT from `apps/api/src/lib/jwt.ts`, required by `apps/api/src/middleware/auth.ts`.
- Admin app API client - Uses `VITE_API_BASE_URL` with a default same-origin `/api/v1` path in `apps/admin/src/lib/api.ts`.
  - SDK/Client: `fetch` wrapper in `apps/admin/src/lib/api.ts`.
  - Auth: `access_token` in browser `localStorage` from `apps/admin/src/lib/auth-context.tsx`.
- Expo field app API client - Uses `EXPO_PUBLIC_API_BASE_URL` with a local default API URL in `expo-prototype/src/modules/sync/apiConfig.js`.
  - SDK/Client: `fetch` calls in `expo-prototype/src/modules/auth/authStore.js` and `expo-prototype/src/modules/sync/syncService.js`.
  - Auth: `access_token` and `refresh_token` stored through SQLite `sync_meta` in `expo-prototype/src/modules/auth/authStore.js` and `expo-prototype/src/modules/tasks/taskSchema.js`.
- Sync API - Field devices call `/sync/time`, `/sync/pull`, `/sync/pull/members`, and `/sync/push` implemented in `apps/api/src/routes/sync.ts`.
  - SDK/Client: `expo-prototype/src/modules/sync/syncService.js`.
  - Auth: Bearer JWT checked by `apps/api/src/middleware/auth.ts`.
- Protocol/form API - Field app pulls form versions and form JSON through `/protocol/forms/*` routes in `apps/api/src/routes/protocol.ts`.
  - SDK/Client: `refreshProtocolForms` in `expo-prototype/src/modules/sync/syncService.js`.
  - Auth: Bearer JWT checked by `apps/api/src/middleware/auth.ts`.
- Nginx edge - Proxies `/health`, `/api/v1/`, and `/` through `deploy/nginx/default.conf`; same-VM routing is documented in `docs/deployment/same-vm-nginx.md`.
  - SDK/Client: HTTP reverse proxy, not an application SDK.
  - Auth: Pass-through to API JWT middleware in `apps/api/src/middleware/auth.ts`.

**Third-party SaaS:**
- Not detected - No Stripe, Supabase, Firebase, AWS, Twilio, SendGrid, Sentry, Datadog, PostHog, Amplitude, or Mixpanel SDK dependency is present in `package.json`, `apps/api/package.json`, `apps/admin/package.json`, or `expo-prototype/package.json`; integration search found no source imports under `apps/`, `packages/`, or `expo-prototype/`.

## Data Storage

**Databases:**
- PostgreSQL - Backend source of truth for evidence, events, projections, users, devices, area assignments, tasks, sync logs, corrections, and data-quality flags as declared in `apps/api/src/db/schema/*.ts` and described in `docs/architecture.md`.
  - Connection: `DATABASE_URL` read by `apps/api/src/db/index.ts` and `apps/api/drizzle.config.ts`.
  - Client: `drizzle-orm/node-postgres` with `pg` in `apps/api/src/db/index.ts`.
- Expo SQLite - Native offline field storage for tasks, form responses, eligible women, pregnancies, sync metadata, and domain event outbox in `expo-prototype/src/modules/tasks/taskSchema.js`.
  - Connection: Local database name `dynamic_offline.db` in `expo-prototype/src/modules/tasks/taskSchema.js`.
  - Client: `expo-sqlite` declared in `expo-prototype/package.json`.
- Web SQLite shim / localStorage - Web builds store local offline state through `expo-prototype/src/shims/expo-sqlite.web.js`, `expo-prototype/src/modules/households/householdRepository.js`, and `expo-prototype/src/modules/questionnaires/questionnaireSubmissionRepository.js`.
  - Connection: Browser `window.localStorage` keys in `expo-prototype/src/shims/expo-sqlite.web.js` and repository modules.
  - Client: Local shim configured by `expo-prototype/metro.config.cjs`.
- Candidate viewer SQLite - Separate CV viewer uses `better-sqlite3` from `CVs/candidate-viewer/package.json` and marks it external in `CVs/candidate-viewer/next.config.js`.
  - Connection: Local SQLite file usage is implied by `better-sqlite3` in `CVs/candidate-viewer/package.json`.
  - Client: `better-sqlite3` in `CVs/candidate-viewer/package.json`.

**File Storage:**
- Local questionnaire/source files - SurveyJS JSON lives under `expo-prototype/src/data/forms/`, with extraction and update rules documented in `docs/policies/questionnaire-authoring.md`.
- Mapping-frame CSV import - API uses in-memory upload handling through `multer.memoryStorage()` and `upload.single("file")` in `apps/api/src/routes/masters.ts`.
- External object storage: Not detected in `package.json`, `apps/api/package.json`, `apps/admin/package.json`, `expo-prototype/package.json`, or source imports under `apps/`, `packages/`, and `expo-prototype/`.

**Caching:**
- Redis service - Declared as local infrastructure in `docker-compose.yml`, managed by `Makefile`, and listed in `docs/architecture.md`; no Redis client package or source usage is detected in application manifests or source imports.
- Expo local caches - Household/member caches and protocol form caches are persisted in SQLite/localStorage via `expo-prototype/src/modules/households/householdRepository.js` and `expo-prototype/src/modules/sync/syncService.js`.
- Turbo cache - Build/task cache is configured by `turbo.json` and stored under `.turbo/`.

## Authentication & Identity

**Auth Provider:**
- Custom username/password auth - Implemented in `apps/api/src/routes/auth.ts` with password verification through `bcryptjs`.
  - Implementation: `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, and `POST /api/v1/auth/logout` in `apps/api/src/routes/auth.ts`.
  - Token signing: `jsonwebtoken` in `apps/api/src/lib/jwt.ts`.
  - Token enforcement: Bearer middleware in `apps/api/src/middleware/auth.ts`.
  - Admin storage: Browser `localStorage` in `apps/admin/src/lib/auth-context.tsx` and `apps/admin/src/lib/api.ts`.
  - Expo storage: SQLite `sync_meta` in `expo-prototype/src/modules/auth/authStore.js` and `expo-prototype/src/modules/tasks/taskSchema.js`.
- Device registration - Field and admin device registration routes live in `apps/api/src/routes/devices.ts`, with schema storage in `apps/api/src/db/schema/sync-auth.ts`.
  - Implementation: `POST /api/v1/devices/register` for field registration and `POST /api/v1/devices` for central admin bulk registration in `apps/api/src/routes/devices.ts`.
- Role/scope policy - Canonical roles and area-scope rules live in `docs/policies/auth-device-and-role-scope.md`, with user/assignment storage in `apps/api/src/db/schema/sync-auth.ts` and routes in `apps/api/src/routes/users.ts` plus `apps/api/src/routes/area-assignments.ts`.

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, Datadog, OpenTelemetry, Honeycomb, PostHog, or similar package appears in `package.json`, `apps/api/package.json`, `apps/admin/package.json`, or `expo-prototype/package.json`.

**Logs:**
- Console logging - API route errors use `console.error` in route modules such as `apps/api/src/routes/auth.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/users.ts`, and `apps/api/src/routes/masters.ts`.
- Sync audit logs - Push sync writes `sync_logs` rows in `apps/api/src/routes/sync.ts`, with table definition in `apps/api/src/db/schema/sync-auth.ts` and admin route in `apps/api/src/routes/sync-logs.ts`.
- Container logs - Local log commands are provided by `Makefile` targets including `db-logs`, `edge-logs`, and `dev-logs`; details are referenced in `AGENTS.md`.
- Health check - API `/health` is implemented in `apps/api/src/app.ts` and proxied by `deploy/nginx/default.conf`.

## CI/CD & Deployment

**Hosting:**
- Same-VM Nginx deployment - Current documented hosting shape is `docs/deployment/same-vm-nginx.md`, with Nginx config in `deploy/nginx/default.conf` and service definitions in `docker-compose.yml`.
- Local development stack - `Makefile` starts Docker Postgres/Redis/Nginx and host HMR processes for API, admin, and Expo through targets such as `dev-up`, `dev-prepare`, `hmr-up`, `backend-up`, `app-up`, and `expo-up`.
- Expo platforms - Field app targets web, iOS, and Android in `expo-prototype/app.json`; local Expo web/dev server is declared in `expo-prototype/package.json`.

**CI Pipeline:**
- None detected - No workflow files are present under `.github/`, and no Netlify, Vercel, Fly, Render, or Railway deployment config is detected in the repo root; current automation is `Makefile`, `package.json`, and `turbo.json`.

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - Backend Postgres connection used by `apps/api/src/db/index.ts` and `apps/api/drizzle.config.ts`.
- `JWT_SECRET` - JWT signing secret used by `apps/api/src/lib/jwt.ts`; active policy in `docs/policies/auth-device-and-role-scope.md` says production must require real non-dev secrets.
- `JWT_REFRESH_SECRET` - Required by tests and policy references in `apps/api/package.json`, `docs/testing.md`, and `docs/policies/auth-device-and-role-scope.md`; current JWT implementation in `apps/api/src/lib/jwt.ts` uses one signing secret for both token types.
- `PORT` - API listen port read by `apps/api/src/index.ts`.
- `TEST_DATABASE_URL` - Integration-test database selector used by `apps/api/src/*.integration.ts` and `apps/api/src/dev/ensure-test-db.ts`.
- `API_BASE_URL` - Dev smoke client base URL in `apps/api/src/dev/smoke-dev.ts`.
- `EXPO_PUBLIC_API_BASE_URL` - Field app API base URL in `expo-prototype/src/modules/sync/apiConfig.js`.
- `VITE_API_BASE_URL` - Admin app API base URL in `apps/admin/src/lib/api.ts`.
- `DYNAMIC_POSTGRES_PORT`, `DYNAMIC_REDIS_PORT`, `DYNAMIC_NGINX_PORT` - Docker/Make service port variables used in `Makefile` and `docker-compose.yml`.

**Secrets location:**
- `.env` files must not be committed or read; `.env`-style configuration is indicated by `apps/api/.env.example`, `apps/api/drizzle.config.ts`, and `turbo.json` global dependency pattern `**/.env.*local`.
- Use local environment, ignored `.env` files, or deployment secret management for actual values; do not put secret values into `.planning/codebase/` docs.

## Webhooks & Callbacks

**Incoming:**
- No external webhook endpoints detected - Route search under `apps/api/src/routes/` found application/admin/sync endpoints but no webhook-specific route names.
- Internal incoming API route groups are registered in `apps/api/src/app.ts`: `/api/v1/auth`, `/api/v1/users`, `/api/v1/area-assignments`, `/api/v1/devices`, `/api/v1/masters`, `/api/v1/households`, `/api/v1/household-members`, `/api/v1/tasks`, `/api/v1/sync`, `/api/v1/data-quality-flags`, `/api/v1/sync-logs`, `/api/v1/eligible-women`, `/api/v1/pregnant-women`, `/api/v1/children`, `/api/v1/protocol`, `/api/v1/corrections`, and `/api/v1/form-responses`.

**Outgoing:**
- No server-side outgoing third-party API integrations detected in `apps/api/src/`, `packages/`, or root manifests.
- Client outgoing calls are to the DYNAMIC API from `apps/admin/src/lib/api.ts`, `expo-prototype/src/modules/auth/authStore.js`, and `expo-prototype/src/modules/sync/syncService.js`.

---

*Integration audit: 2026-06-19*
