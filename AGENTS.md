# DYNAMIC Agent Instructions

Keep this file high-signal. Put detailed replay history in `session-log-archive.md`, not here.

## Session Logs

- `session-log.md` is the compact active context. Keep entries short: `Goal`, `Decisions`, `Rejected`, `Open`, and optional `Archive`.
- `session-log-archive.md` is for replayable detail: command order, root causes, verification output, changed files, and commit ids.
- When a saved `session-log.md` entry grows beyond compact context, move detail to `session-log-archive.md` and link it from `Archive`.

## Runtime

- Use root Make targets for local services. Do not hand-roll `docker compose`, workspace dev commands, or port-kill commands when a Make target exists.
- `make dev-up`: full dev stack with Docker DB/Redis/edge plus backend/admin/Expo HMR.
- `make dev-prepare`: Docker DB/Redis, full schema push, seed, and edge without HMR.
- `make hmr-up`, `make backend-up`, `make app-up`, `make expo-up`: foreground HMR logs.
- `make dev-stop`: stop HMR, edge, Postgres, and Redis.
- Container logs: `make db-logs`, `make edge-logs`, `make dev-logs`.
- Do not create host log files or PID files for backend/admin/Expo dev servers.

## Dev Database

- This is a dev repo: use full DB reset/push, not migration churn, unless explicitly asked.
- `make db-reset-full`: destroy local DB/Redis volumes, recreate containers, push full schema, and seed.
- `make db-push`: full Drizzle schema push using explicit schema files.
- `make db-status`: verify containers and localhost port bindings.
- `make db-smoke`: verify dev login/sync after backend is running.
- `make db-migrate` is legacy only.
- Dev credentials after seed: `dev-field-worker` / `dev-password`; `dev-central-admin` / `dev-admin-password`.

## Verification Order

Use the smallest relevant subset, but this is the full local order:

```bash
make db-reset-full
make db-status
make db-smoke
npm --workspace @dynamic/api test
npm --workspace @dynamic/api run typecheck
npm --workspace @dynamic/event-core test
npm --workspace @dynamic/event-core run typecheck
npm --workspace expo-prototype test
npm --workspace @dynamic/api run db:test:push
TEST_DATABASE_URL=postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_test JWT_SECRET=test_jwt_secret JWT_REFRESH_SECRET=test_refresh_secret npx tsx --test apps/api/src/hhq-offline-sync.e2e.integration.ts
```

## Event/Sync Constraints

- `packages/event-core` is the shared event/reducer kernel for backend and Expo parity.
- SurveyJS JSON is a rendering layer, not the longitudinal data model.
- Core state must be normalized domain records plus immutable form responses, domain events, tasks/attempts, corrections, and sync/audit metadata.
- Offline duplicate task completions are valid evidence. First valid completion closes operational state; later completions are duplicate evidence and data-quality flags.
- Do not add a global open-any-form workflow. Forms open from scheduled tasks or valid contextual trigger buttons.
- Do not create an Android correction-request queue. Core corrections happen in the admin app with audit history and rule recalculation.

## Questionnaire/ID Constraints

Before changing questionnaire JSON, Expo routing, calculated fields, IDs, or flow logic, read:

- `Refs/FLOW.md`
- `Refs/Unique_Ids.md`
- `Refs/pretsing forms/forms_summary table_v2026.05.17.pdf`
- the specific source questionnaire PDF in `Refs/pretsing forms/`

Rules:
- Do question-by-question PDF comparison before questionnaire JSON changes.
- Preserve PDF `Variable ID` in `sourceCode`; use form-prefixed analysis-safe keys only where global answer-key uniqueness is needed.
- Labels contain only question text. Put instructions, probes, skip notes, hints, and auto-fill notes in metadata/description/validation/app logic.
- Numeric boxes are numeric/text inputs, not radio choices.
- `RECORD ALL` / `ANSWER UP TO` fields are checkboxes unless the PDF defines one coded response.
- Auto-filled lineage/core fields are read-only with explicit source metadata.
- After JSON changes, update `expo-prototype/src/data/forms/`, rebuild `outputs/pretsing-form-json/all_forms.json`, run `npm --workspace expo-prototype test`, and browser-check UI-affecting changes.

## Cohort Rules That Affect Code

- Household identity: `site_id + locality_code + structure_map_id + household_number = household_id`.
- Person identity: `household_id + member_number = household_member_id/person_id`.
- Baseline HHQ validates/enrolls households from the mapped frame; do not create arbitrary new households.
- Future visits are only for households enrolled at baseline. Empty/vacant/not-occupied households at baseline stay out.
- Household splits keep the original `household_id`; do not create split events or new analytic household numbers.
- Temporary visitors are not roster members and must not become eligible from that household.
- Notes are field context only; do not use notes for analysis, routing, eligibility, skip logic, or cohort definition.
- HRF is anchored to HHQ baseline completion; PFF is anchored to PEF/pregnancy enrollment; late completion must not shift future scheduled dates.
- VA tasks are 30 days after stillbirth or child death; disabled until VA SurveyJS JSON exists.

## Document Tooling

For Python scripts that create or edit `.docx`/OOXML, Excel, PDF, ODF, RTF/HTML/Markdown, YAML/TOML/JSON, or PowerPoint files, use:

```bash
/Users/vivekgupta/.codex/.venv/bin/python
```

External tools available on PATH include `pandoc`, `soffice`, Poppler tools, `exiftool`, `textutil`, `unzip`, and `file`.
