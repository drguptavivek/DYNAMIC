# DYNAMIC Agent Instructions

Keep this file high-signal. Architecture and policy detail lives in `docs/`.
Replay detail lives in `session-log-archive.md`.

## Session Logs

- `session-log.md` is the compact active context. Keep entries short: `Goal`, `Decisions`, `Rejected`, `Open`, and optional `Archive`.
- `session-log-archive.md` is for replayable detail: command order, root causes, verification output, changed files, and commit ids.
- When a saved `session-log.md` entry grows beyond compact context, move detail to `session-log-archive.md` and link it from `Archive`.

## Current Canon

Before backend schema, sync, event/replay, Expo offline workflow, task scheduling, questionnaire routing, or admin correction changes, read:

- [Domain glossary](CONTEXT.md) - canonical DYNAMIC vocabulary. Keep it as glossary only; implementation rules belong in architecture/policy docs.
- [Architecture decisions](docs/adr/) - short decision records explaining why key domain and architecture choices were made.
- [Architecture](docs/architecture.md) - single agreed system architecture; start with [Core Model](docs/architecture.md#core-model), [Event And Workflow Direction](docs/architecture.md#event-and-workflow-direction), and [Tasks And Scheduling](docs/architecture.md#tasks-and-scheduling) for domain architecture.
- [Cohort and identity policy](docs/policies/cohort-and-identity.md).
- [Form lifecycle and sync policy](docs/policies/form-lifecycle-and-sync.md).
- [Form drafts and autosave policy](docs/policies/form-drafts-and-autosave.md).
- [Form preview and final-submit policy](docs/policies/form-preview-and-final-submit.md).
- [Survey navigation and progress policy](docs/policies/survey-navigation-and-progress.md).
- [Workflow and scheduling policy](docs/policies/workflow-and-scheduling.md).
- [Questionnaire authoring policy](docs/policies/questionnaire-authoring.md).
- [App surfaces and routes policy](docs/policies/app-surfaces-and-routes.md).
- [Auth, device, and role-scope policy](docs/policies/auth-device-and-role-scope.md).
- [Admin corrections and data-quality policy](docs/policies/admin-corrections-and-data-quality.md).
- [Testing](docs/testing.md).

Archived docs under `docs/archive/` are historical background only. Do not treat them as current rules unless their content has been promoted into the active architecture or policy docs above.

Do not create new active policy docs under `docs/superpowers/`. If a Superpower skill suggests that location, put durable DYNAMIC rules in `docs/architecture.md` or `docs/policies/` instead.

## Exploration Tooling

- `rtk` is installed at `/opt/homebrew/bin/rtk`; use it for token-optimized exploration and noisy command output.
- Prefer `rtk tree`, `rtk read`, `rtk grep`, `rtk diff`, `rtk git`, `rtk test`, `rtk tsc`, and `rtk npm` when summarized output is enough.
- Use raw commands when exact output is required, when `rtk` hides needed detail, or when running canonical Make targets.

## Runtime And App Startup

- Start from the repo root. Use root Make targets; do not hand-roll Docker, workspace dev commands, or port kills when a Make target exists.
- Full app: `make dev-up` starts Docker DB/Redis, pushes schema, seeds, starts edge, then runs backend/admin/Expo HMR in the foreground.
- Prepared services only: `make dev-prepare`; HMR only after prepare: `make hmr-up`.
- Individual HMR when needed: `make backend-up`, `make app-up`, `make expo-up`.
- Stop/check: `make dev-stop`, `make dev-status`.
- Container logs: `make db-logs`, `make edge-logs`, `make dev-logs`; host HMR logs stream in the foreground Make target.
- Do not create host log files or PID files for backend/admin/Expo dev servers.

## Dev Database

- This is a dev repo: use full DB reset/push, not migration churn, unless explicitly asked.
- Main entry points: `make db-reset-full`, `make db-push`, `make db-status`, `make db-smoke`.
- `make db-migrate` is legacy only.
- Dev credentials after seed: `dev-field-worker` / `dev-password`; `dev-central-admin` / `dev-admin-password`.

## Verification

- Run the smallest relevant test/typecheck set for the files changed.
- Use `make db-reset-full && make db-smoke` after DB/schema/runtime changes.
- Common checks: `npm --workspace @dynamic/api test`, `npm --workspace @dynamic/api run typecheck`, `npm --workspace @dynamic/event-core test`, `npm --workspace expo test`.
- Detailed command sets and DB push caveats live in [Testing](docs/testing.md).

## Document Tooling

For Python scripts that create or edit `.docx`/OOXML, Excel, PDF, ODF, RTF/HTML/Markdown, YAML/TOML/JSON, or PowerPoint files, use:

```bash
/Users/vivekgupta/.codex/.venv/bin/python
```

External tools available on PATH include `pandoc`, `soffice`, Poppler tools, `exiftool`, `textutil`, `unzip`, and `file`.
