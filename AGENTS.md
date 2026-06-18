DYNAMIC Study Data Management System

A Cohort study spanning multiple sites for detecing and following up eligible women through ther pregnancies, preganancy outcomes, and thereafter infants and children as they grow up

# Conventions
- Turborepo monorepo
- Docker based nginx, api and vite backend with makefile
- Offline first - Expo based
- Event Driven
- docs folder contain policies
- Refs folder contains workflows and project references
- Clean architecture

## Local Dev Runtime Workflow

Use the root `Makefile` for local development services. Do not hand-roll
`docker compose`, `npm --workspace ... run dev`, or ad hoc port-kill commands
unless the Makefile target is missing or broken.

Primary targets:

- `make dev-up` starts the full dev stack:
  - Postgres and Redis containers
  - API migrations
  - development seed data
  - Nginx edge container
  - backend API HMR on `3310`
  - admin Vite HMR on `5317`
  - Expo web HMR on `8088`
- `make dev-prepare` starts DB, runs migrations, seeds dev data, and starts the
  edge container without starting the host HMR processes.
- `make hmr-up` starts backend/admin/Expo HMR together in the foreground with
  live logs.
- `make backend-up`, `make app-up`, and `make expo-up` start those HMR services
  individually in the foreground.
- `make db-migrate` applies API Drizzle migrations to the dev database.
- `make db-seed` upserts the standard dev users, area assignment, and seed task.
- `make db-smoke` seeds and verifies dev login/sync against the running API;
  run it after `make backend-up` or from another terminal while `make dev-up`
  is running.
- `make edge-up` or `make edge-start` starts Nginx edge on `58080`.
- `make dev-status` checks DB, backend, admin, edge, and Expo listener state.
- `make dev-stop` stops host HMR processes, edge, Postgres, and Redis.

Logging rules:

- Container logs: use `make db-logs`, `make edge-logs`, or `make dev-logs` for
  live tails from Docker stdout/stderr.
- Host-run HMR logs: keep the Makefile target running in the terminal
  (`make hmr-up`, `make backend-up`, `make app-up`, or `make expo-up`).
- Do not create host log files or PID files for backend/admin/Expo dev servers.

Default dev credentials after `make db-seed` or `make db-smoke`:

- Field worker: `dev-field-worker` / `dev-password`
- Central admin: `dev-central-admin` / `dev-admin-password`

## DYNAMIC - PreTESTING project rules

Architecture source of truth:

- Before implementing backend schema, offline sync, Expo routing/worklists, SurveyJS prefill, follow-up scheduling, or admin correction workflows, read `docs/superpowers/specs/2026-06-03-dynamic-fullstack-offline-architecture-design.md`.
- Target stack is TypeScript/Node API with Postgres, Vite React admin app, Expo Android app with SQLite, and SurveyJS as the form renderer.
- SurveyJS JSON is the questionnaire rendering layer only. Do not use SurveyJS response JSON as the core longitudinal data model.
- Core operational state must be modeled as normalized domain records plus immutable form responses, domain events, follow-up tasks, task attempts, admin correction events, and sync/audit metadata.
- Keep workflow rules, task generation, task context builders, and SurveyJS prefill mappers in shared TypeScript packages used by both Expo and the backend.
- The Android app must support area-scoped offline search/sync by assigned village/colony/locality, not per-household assignment.
- The Android app may generate deterministic scheduled tasks and event-triggered immediate tasks offline, but forms must open only from scheduled tasks or valid contextual trigger buttons. Do not add a global open-any-form workflow.
- Repeated scheduled series use the current due task only. Do not backfill missed HRF, PFF, or NFF rounds as if they happened on time.
- HRF is anchored to each household's baseline HHQ completion date; late HRF completion must not shift future HRF dates.
- PFF is anchored to PEF completion/pregnancy enrollment date; late PFF completion must not shift future PFF dates.
- NFF uses protocol visit labels and calendar-month scheduling: 7d, 28d, 2m, 3m, 4.5m, 6m, 7.5m, 9m, 10.5m, 12m, 14m, 16m, then every 2 calendar months until study end.
- VA tasks are generated 30 days after stillbirth or child death. VA SurveyJS JSON is pending, so VA tasks must be visible but disabled in Android worklists until the JSON exists; field users must not close VA tasks while disabled.
- Task windows/deadlines are global by form/task type, versioned in protocol config, and stored on generated task records.
- Failed-attempt limits are task-type rules, not a global constant. After the configured number of failed attempts, ask the field user to close with a final reason; do not auto-close.
- Prefilled lineage/core fields must be read-only in SurveyJS forms. If a prefill is wrong, allow the field user to continue; corrections are handled later in the admin app/outside field workflow.
- Do not create an Android correction-request queue. Site Research Scientists make allowed core corrections in the Vite admin app with audit history and immediate rule recalculation.
- Offline duplicate task completions must be accepted as immutable evidence. First synced valid completion closes the task operationally; later completions are marked duplicate and create admin data-quality flags.

Before changing questionnaire JSON, Expo app routing, calculated fields, IDs, or flow logic, read and follow:

- `Refs/FLOW.md`
- `Refs/Unique_Ids.md`
- `Refs/pretsing forms/forms_summary table_v2026.05.17.pdf`
- the specific source questionnaire PDF in `Refs/pretsing forms/`

### Key constraints:

- The forms summary table is the operational reference for form order, respondent, timing, mode, purpose, and downstream flow.
- The PDF `Variable ID` is the canonical question code. Preserve it in `sourceCode`; use form-prefixed analysis-safe codes only where globally unique answer keys are needed.
- Sites first map the area and list all structures/households. Baseline HHQ validates and enrolls households from that mapped frame; it must not create arbitrary new households.
- Future visits are allowed only for households enrolled at baseline. A household empty/vacant/not occupied at baseline remains out even if later occupied.
- If an enrolled household splits, keep the original household number and `household_id`. Do not create a new household number and do not create a split event. Use non-analytic household/individual notes only if field context is needed.
- Core person linkage is: `site_id + locality_code + structure_map_id + household_number = household_id`; `household_id + member_number = household_member_id/person_id`.
- Household member number is read-only auto-increment within the household listing.
- Eligibility is derived from household member data and valid later member additions: Woman questionnaire, pregnancy tracking, pregnancy events, outcome events, and child follow-up all link back to the household member/person.
- Households are closed after baseline, but existing enrolled households may gain usual-resident members through valid in-migration, marriage-in, or birth. Recalculate eligibility after valid additions.
- Temporary visitors are not captured as household members in the current PDFs. Women temporarily visiting a natal/maternal household for pregnancy care, delivery, or postpartum stay must not be added to the roster or made eligible from that household.
- Notes fields are free-text field context only. Do not use notes for analysis, skip logic, eligibility, routing, or cohort definition.
- Stillbirth and child death trigger verbal autopsy 30 days after the stillbirth/death event.
- Planned household survey start is 1 September 2026. Enrollment is planned for 2.5 years, followed by 1.5 years of outcome follow-up.

## Questionnaire editing rules:

- Do a question-by-question PDF comparison for each form before changing JSON.
- Do not mix labels, instructions, hints, validation, and choices.
- Question labels should contain only the question text.
- Instructions, probes, skip notes, auto-fill notes, and measurement hints belong in `description`, metadata, validation, or app logic, not in `choices`.
- Numeric boxes in the PDF should be numeric/text inputs, not radio choices.
- `RECORD ALL` / `ANSWER UP TO` fields should be checkboxes unless the PDF defines a single coded response.
- Auto-filled fields should be read-only and have explicit calculation/source metadata.
- After JSON changes, copy the maintained JSON into `expo-prototype/src/data/forms/`, rebuild `outputs/pretsing-form-json/all_forms.json`, run `npm test` in `expo-prototype`, and use the in-app browser to verify visible rendering when the change affects UI.


For Python scripts that create or edit `.docx`/OOXML files, Excel workbooks, PDFs, ODF files, RTF/HTML/Markdown text, YAML/TOML, JSON files, or PowerPoint files, use:

```bash
/Users/vivekgupta/.codex/.venv/bin/python
```

This environment has `python-docx`, `docx2txt`, `openpyxl`, `lxml`, ODF tooling (`odfpy`, `odfdo`), PDF tooling (`pypdf`, `pdfplumber`, `pdfminer.six`, `PyMuPDF`), HTML/text tooling (`beautifulsoup4`, `html2text`, `markdownify`, `striprtf`), YAML/TOML tooling (`PyYAML`, `ruamel.yaml`, `tomlkit`, `tomli-w`), JSON support from the standard library, and `python-pptx` installed.

External document tools available on PATH include `pandoc`, `soffice`, Poppler tools (`pdfinfo`, `pdftotext`, `pdftoppm`), `exiftool`, `textutil`, `unzip`, and `file`.
