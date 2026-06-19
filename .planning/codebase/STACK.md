# Technology Stack

**Analysis Date:** 2026-06-19

## Languages

**Primary:**
- TypeScript 5.4.5 - Backend API, admin app, and shared packages use TypeScript through `apps/api/package.json`, `apps/admin/package.json`, `packages/event-core/package.json`, `packages/shared-domain/package.json`, `packages/shared-workflow/package.json`, and `packages/shared-context/package.json`.
- JavaScript / JSX - The Expo field prototype is implemented mostly in JavaScript under `expo-prototype/app/` and `expo-prototype/src/`, with dependencies declared in `expo-prototype/package.json`.

**Secondary:**
- JSON / SurveyJS schema - Questionnaire definitions and Expo app metadata live under `expo-prototype/src/data/forms/` and `expo-prototype/app.json`; extraction/update rules are governed by `docs/policies/questionnaire-authoring.md`.
- SQL schema via TypeScript DSL - Database tables are declared with Drizzle in `apps/api/src/db/schema/*.ts`; migrations are configured by `apps/api/drizzle.config.ts`.
- Markdown - Current architecture, policy, deployment, and testing canon lives in `docs/architecture.md`, `docs/policies/`, `docs/deployment/same-vm-nginx.md`, and `docs/testing.md`.

## Runtime

**Environment:**
- Node.js - Workspace scripts run Node tooling through `package.json`, `apps/api/package.json`, `apps/admin/package.json`, and `turbo.json`; no `.nvmrc` or `.node-version` is detected in the repo root.
- Express runtime - The API starts from `apps/api/src/index.ts`, creates the app in `apps/api/src/app.ts`, and listens on `PORT` with default port `3310`.
- Expo runtime - The field app targets web, iOS, and Android through `expo-prototype/app.json`, `expo-prototype/index.js`, `expo-prototype/app/_layout.js`, and `expo-prototype/package.json`.
- Docker Compose services - Local infrastructure is Postgres, Redis, and Nginx as shown by `docker-compose.yml`, `deploy/nginx/default.conf`, `Makefile`, and `docs/deployment/same-vm-nginx.md`.

**Package Manager:**
- npm 10.0.0 - Declared in root `package.json` under `packageManager`.
- Lockfile: present - Root workspace lockfile is `package-lock.json`; nested lockfiles also exist at `expo-prototype/package-lock.json` and `CVs/candidate-viewer/package-lock.json`.

## Frameworks

**Core:**
- Express 4.19.2 - API routing and middleware are wired in `apps/api/src/app.ts`, with routes in `apps/api/src/routes/` and dependencies in `apps/api/package.json`.
- Drizzle ORM 0.31.2 + `pg` 8.11.5 - Postgres access is configured in `apps/api/src/db/index.ts`, schemas live in `apps/api/src/db/schema/*.ts`, and CLI config is in `apps/api/drizzle.config.ts`.
- React 19.1.0 - Shared UI runtime for the Vite admin app in `apps/admin/package.json` and the Expo app in `expo-prototype/package.json`.
- Vite 5.2.0 - Admin dev/build runtime is declared in `apps/admin/package.json`; the dev server uses port `5317`.
- Expo 54.0.35 / React Native 0.81.5 - Field app runtime is declared in `expo-prototype/package.json`, configured by `expo-prototype/app.json`, `expo-prototype/babel.config.js`, and `expo-prototype/metro.config.cjs`.
- Expo Router 6.0.24 - File-based field routes live in `expo-prototype/app/` and are enabled by `expo-prototype/app.json`.
- SurveyJS (`survey-core`, `survey-react-ui`) - Questionnaire rendering is used by `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js` and declared in `expo-prototype/package.json`.
- Next.js 15.3.3 - Separate CV candidate viewer under `CVs/candidate-viewer/` uses `CVs/candidate-viewer/package.json` and `CVs/candidate-viewer/next.config.js`; this is not part of the DYNAMIC study runtime described in `docs/architecture.md`.

**Testing:**
- Node built-in test runner - API tests use `tsx --test` from `apps/api/package.json`, with tests such as `apps/api/src/app.test.ts`, `apps/api/src/smoke.integration.ts`, and `apps/api/src/hhq-offline-sync.e2e.integration.ts`.
- Jest 29.7.0 + ts-jest - Shared packages use Jest configs in `packages/event-core/jest.config.js`, `packages/shared-domain/jest.config.js`, and `packages/shared-workflow/jest.config.js`.
- Expo validation scripts - The field app uses Node `.mjs` test scripts under `expo-prototype/src/tests/` and the `expo-prototype/package.json` `test` command.

**Build/Dev:**
- Turbo 2.9.16 - Root workspace build, dev, lint, test, and typecheck orchestration is declared in `package.json` and `turbo.json`.
- tsx 4.11.0 - API dev server, DB tooling, smoke scripts, and tests run TypeScript directly through `apps/api/package.json`.
- TypeScript compiler - Build/typecheck scripts are declared in `apps/api/package.json`, `apps/admin/package.json`, and each `packages/*/package.json`.
- Metro - Expo bundling and workspace module resolution are configured in `expo-prototype/metro.config.cjs`.
- Make - Canonical local runtime entry points are `Makefile` targets including `dev-up`, `dev-prepare`, `hmr-up`, `backend-up`, `app-up`, `expo-up`, `db-reset-full`, `db-push`, and `db-smoke`.

## Key Dependencies

**Critical:**
- `drizzle-orm` / `drizzle-kit` - Defines and pushes the Postgres schema through `apps/api/src/db/schema/*.ts`, `apps/api/src/db/index.ts`, `apps/api/drizzle.config.ts`, and `apps/api/package.json`.
- `express` - Owns the HTTP API surface in `apps/api/src/app.ts` and route modules under `apps/api/src/routes/`.
- `jsonwebtoken` - Signs and verifies access and refresh tokens in `apps/api/src/lib/jwt.ts`; the active token policy is documented in `docs/policies/auth-device-and-role-scope.md`.
- `bcryptjs` - Password hashing and verification are implemented in `apps/api/src/lib/password.ts` and `apps/api/src/routes/auth.ts`.
- `zod` - Request and shared domain validation is used in `apps/api/src/routes/auth.ts`, `apps/api/src/routes/users.ts`, `apps/api/src/routes/devices.ts`, `apps/api/src/routes/area-assignments.ts`, `apps/api/src/routes/data-quality.ts`, `packages/shared-domain/src/schemas.ts`, and `packages/shared-workflow/src/protocol-config.ts`.
- `expo-sqlite` - Offline field storage is implemented in `expo-prototype/src/modules/tasks/taskSchema.js`, `expo-prototype/src/modules/households/householdRepository.js`, and the web shim `expo-prototype/src/shims/expo-sqlite.web.js`.
- `survey-core` / `survey-react-ui` - Questionnaire model/rendering dependencies are declared in `expo-prototype/package.json` and used by `expo-prototype/src/modules/questionnaires/QuestionnaireDashboard.js`.
- `@dynamic/event-core`, `@dynamic/shared-workflow`, `@dynamic/shared-domain`, `@dynamic/shared-context` - Shared study logic packages live under `packages/` and are used by `apps/api/src/services/eventProcessor.ts`, `apps/api/src/services/taskWriter.ts`, and Expo-side workflow code in `expo-prototype/src/modules/`.

**Infrastructure:**
- PostgreSQL 16 - Local database service is declared in `docker-compose.yml`; Drizzle connects with `DATABASE_URL` in `apps/api/src/db/index.ts`.
- Redis 7 - Local runtime service is declared in `docker-compose.yml` and managed by `Makefile`; no app-level Redis client dependency is detected in `package.json`, `apps/api/package.json`, or `expo-prototype/package.json`.
- Nginx 1.27 - Local same-VM edge proxy is declared in `docker-compose.yml`, configured by `deploy/nginx/default.conf`, and documented in `docs/deployment/same-vm-nginx.md`.
- `multer` 2.1.1 - In-memory CSV upload handling for mapping-frame import is configured in `apps/api/src/routes/masters.ts`.
- `better-sqlite3` 12.11.1 - Used only by the separate candidate viewer under `CVs/candidate-viewer/package.json` and externalized by `CVs/candidate-viewer/next.config.js`.

## Configuration

**Environment:**
- API env vars are read from `process.env` in `apps/api/src/index.ts`, `apps/api/src/db/index.ts`, `apps/api/drizzle.config.ts`, `apps/api/src/lib/jwt.ts`, `apps/api/src/dev/smoke-dev.ts`, and integration tests under `apps/api/src/*.integration.ts`.
- Required API env names include `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` by policy, `PORT`, `TEST_DATABASE_URL`, and `API_BASE_URL`; keep values outside committed docs and use `apps/api/.env.example` only as an existence marker.
- Expo API base URL is configured by `EXPO_PUBLIC_API_BASE_URL` in `expo-prototype/src/modules/sync/apiConfig.js`.
- Admin API base URL is configured by `VITE_API_BASE_URL` in `apps/admin/src/lib/api.ts`.
- Local runtime port overrides are Make/Docker variables in `Makefile`, including `API_PORT`, `ADMIN_PORT`, `EXPO_PORT`, `EDGE_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `DYNAMIC_POSTGRES_PORT`, `DYNAMIC_REDIS_PORT`, and `DYNAMIC_NGINX_PORT`.
- Current canon says non-dev auth secrets must be required in deployed environments in `docs/policies/auth-device-and-role-scope.md`; implementation still has a dev fallback in `apps/api/src/lib/jwt.ts`.

**Build:**
- Workspace build graph: `turbo.json`.
- Root workspace manifest: `package.json`.
- TypeScript base config: `tsconfig.base.json`.
- API TS config: `apps/api/tsconfig.json`.
- Admin TS config: `apps/admin/tsconfig.json`.
- Expo TS config and Metro/Babel config: `expo-prototype/tsconfig.json`, `expo-prototype/metro.config.cjs`, and `expo-prototype/babel.config.js`.
- Drizzle config: `apps/api/drizzle.config.ts`.
- Nginx edge config: `deploy/nginx/default.conf`.
- Docker Compose config: `docker-compose.yml`.

## Platform Requirements

**Development:**
- Use the repo root and `Makefile` targets rather than hand-rolled services; current project instructions in `AGENTS.md` and `docs/testing.md` call out `make dev-up`, `make dev-prepare`, `make hmr-up`, `make dev-stop`, and `make dev-status`.
- Docker Compose must be available for Postgres, Redis, and Nginx services declared in `docker-compose.yml` and managed through `Makefile`.
- Node/npm workspace support is required for `package.json` workspaces: `expo-prototype`, `shared`, `packages/*`, and `apps/*`.
- Use `make db-reset-full`, `make db-push`, and `make db-smoke` after DB/schema/runtime changes as documented in `AGENTS.md` and `docs/testing.md`.

**Production:**
- Current deployment intent is same-VM Nginx at the edge with API behind it, described in `docs/deployment/same-vm-nginx.md` and configured locally by `deploy/nginx/default.conf`.
- Production should serve `apps/admin/dist` instead of proxying the Vite dev server, per `docs/deployment/same-vm-nginx.md`.
- TLS/certificates are not configured in repo; `docs/deployment/same-vm-nginx.md` says TLS should terminate at Nginx when certificates are configured.
- No hosted-platform config is detected under `.github/`, Netlify/Vercel/Fly/Render files, or root deployment manifests; use `docs/deployment/same-vm-nginx.md`, `docker-compose.yml`, and `Makefile` as the current deployment references.

---

*Stack analysis: 2026-06-19*
