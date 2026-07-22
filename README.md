# DYNAMIC

DYNAMIC is an offline-first data-management and field-workflow application for a longitudinal public-health study. It supports protocol-driven household enrollment and follow-up across women, pregnancies, births, children, and verbal autopsies.

Field workers use the mobile app to complete Case Report Forms (CRFs) and continue working when connectivity is unavailable. Finalized CRFs sync to the backend, where they are stored as immutable study evidence, classified into study events, and used to update cohort projections and generate follow-up tasks. Study managers use the admin web app to monitor operations, manage study data, and review data-quality issues and corrections.

## Application Structure

This repository is an npm workspace monorepo with one backend, two frontend applications, and shared domain packages.

```text
DYNAMIC/
├── apps/
│   ├── api/                 # Node.js/Express backend API
│   └── admin/               # React/Vite administration frontend
├── expo/                    # Expo/React Native field frontend
├── packages/
│   ├── event-core/          # Shared event and reducer rules
│   ├── shared-context/      # Shared context and prefill helpers
│   ├── shared-domain/       # Shared domain types and validation
│   └── shared-workflow/     # Shared task and workflow rules
├── shared/                  # Study master-data helpers
├── deploy/nginx/            # Local edge/reverse-proxy configuration
├── docs/                    # Architecture, policies, and testing guidance
├── Refs/                    # Protocol source material
├── docker-compose.yml       # PostgreSQL, Redis, and Nginx services
└── Makefile                 # Canonical local-development commands
```

## Backend

The backend lives in `apps/api` and is built with TypeScript, Express, Drizzle ORM, and PostgreSQL. It provides:

- authentication, registered-device handling, and role/area access control;
- storage and classification of finalized CRFs;
- authoritative study-event processing and projection updates;
- deterministic task and workflow generation;
- offline push/pull synchronization for the field app;
- APIs for the admin application, review workflows, and corrections; and
- replay of derived projections from accepted evidence and events.

PostgreSQL is the authoritative data store. Redis and the Nginx edge support the local application runtime.

## Frontend

### Field application (`expo`)

The Expo/React Native application is the offline-first interface used by field workers. It runs on Android, iOS, and the web during development. It stores tasks, form drafts, finalized CRFs, provisional study events, and sync state locally with SQLite, allowing field work to continue without a network connection.

Its main modules cover authentication, households, questionnaires, study events, task worklists, profiles, and synchronization.

See [Android build steps](DEVELOPMENT.md#build-and-run-the-android-app) to generate the native project, compile a test release APK, and install it on an emulator.

### Admin application (`apps/admin`)

The React/Vite web application is the management and review interface. It provides administrative views for study operations, users, master data, tasks, submissions, data-quality issues, and approved corrections. It uses the backend API rather than accessing the database directly.

## Data Flow

```text
Field worker completes CRF in Expo
  -> Finalized CRF is saved locally
  -> provisional events/tasks support offline work
  -> sync sends evidence to the backend
  -> backend classifies and stores authoritative events
  -> shared reducers update projections
  -> workflow rules generate deterministic tasks
  -> confirmed state returns to Expo and appears in Admin
```

The backend and Expo app share domain, event, and workflow rules from `packages/` so that offline behavior converges with authoritative backend processing after sync.

## Run Locally

Prerequisites: Node.js/npm and Docker Desktop.

```bash
npm install
make dev-up
```

`make dev-up` starts PostgreSQL and Redis, pushes the development schema, seeds development data, starts the Nginx edge, and runs the backend, admin app, and Expo web app with live logs.

Default development endpoints:

| Service | URL |
| --- | --- |
| Backend API | `http://localhost:3310` |
| Admin web app | `http://localhost:5317` |
| Expo web app | `http://localhost:8088` |
| Nginx edge | `http://localhost:58080` |

Development field-worker login:

```text
Username: dev-field-worker
Password: dev-password
```

Useful commands:

```bash
make dev-status      # Check local services
make dev-stop        # Stop the complete stack
make db-reset-full   # Recreate and reseed the development database
make db-smoke        # Smoke-test development login and sync
make help            # List all supported Make targets
```

## Documentation

Use this README as the entry point; detailed rules remain in the linked documents.

### Start here

- [Development guide](DEVELOPMENT.md) — local setup, environment files, runtime commands, database workflows, verification, and Android builds.
- [Agent and contributor instructions](AGENTS.md) — repository-specific working rules, required reading, canonical commands, and verification expectations.
- [Domain glossary](CONTEXT.md) — canonical DYNAMIC vocabulary.
- [Documentation index](docs/README.md) — compact index of the active documents under `docs/`.
- [Architecture](docs/architecture.md) — the single agreed system architecture and implementation direction.
- [Testing guide](docs/testing.md) — test selection, command order, integration checks, and database caveats.

### Active policies

These policies are current implementation rules:

- [Cohort and identity](docs/policies/cohort-and-identity.md)
- [Form lifecycle and sync](docs/policies/form-lifecycle-and-sync.md)
- [Form drafts and autosave](docs/policies/form-drafts-and-autosave.md)
- [Form preview and final submit](docs/policies/form-preview-and-final-submit.md)
- [Survey navigation and progress](docs/policies/survey-navigation-and-progress.md)
- [Workflow and scheduling](docs/policies/workflow-and-scheduling.md)
- [Questionnaire authoring](docs/policies/questionnaire-authoring.md)
- [App surfaces and routes](docs/policies/app-surfaces-and-routes.md)
- [Authentication, devices, and role scope](docs/policies/auth-device-and-role-scope.md)
- [Admin corrections and data quality](docs/policies/admin-corrections-and-data-quality.md)

### Architecture decisions

The [architecture decision records](docs/adr/) explain why important domain and correction-workflow choices were made:

- [ADR 0001: Online resolution proposals](docs/adr/0001-online-resolution-proposals.md)
- [ADR 0002: Approved resolutions preserve submissions](docs/adr/0002-approved-resolutions-preserve-submissions.md)
- [ADR 0003: Issues, resolutions, and correction events](docs/adr/0003-issues-resolutions-and-correction-events.md)
- [ADR 0004: Correction events are admin-originated](docs/adr/0004-correction-events-are-admin-originated.md)
- [ADR 0005: Study-staff identity is separate from user accounts](docs/adr/0005-study-staff-identity-is-separate-from-user-accounts.md)

The architecture is also available as a [high-level diagram](docs/architecture-high-level.png).

### Deployment and operations

- [Backend API and Admin UI build and deployment](docs/deployment/backend-api-and-admin-ui.md)
- [Same-VM Nginx edge routing](docs/deployment/same-vm-nginx.md)
- [Git branch structure](BRANCHES.md)
- [Project changelog](CHANGELOG.md)

### Protocol and historical references

Protocol source material lives in `Refs/`, including the [workflow reference](Refs/FLOW.md), [identifier reference](Refs/Unique_Ids.md), [progress parameters](Refs/progress_parameters.md), and [site-interviewer workplan indicators](Refs/site_interviewers_workplan_indicators.md). Protocol sources take precedence where the architecture defines them as authoritative.

[Archived documentation](docs/archive/README.md) is retained for traceability only. Files under `docs/archive/` are historical background and must not be treated as current implementation policy unless their rules have been promoted into the active architecture or policies above.
