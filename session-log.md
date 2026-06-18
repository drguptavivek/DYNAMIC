## 2026-06-18 09:14 [saved]
Goal: Standardize DYNAMIC local dev runtime commands.
Decisions:
- Root Makefile owns dev startup and Docker container logs.
- Host backend/admin/Expo HMR logs stay foreground-only.
Rejected:
- Hand-rolled docker/npm startup when Make targets exist.
- Host log or PID files for HMR servers.
Open:
- Keep browser verification after runtime changes.
Archive:
- `session-log-archive.md#2026-06-18-0914-runtime-standardization`

## 2026-06-18 10:04 [saved]
Goal: Preserve event-driven HHQ ingest/replay checkpoint.
Decisions:
- `packages/event-core` is the shared event/reducer kernel.
- HHQ backend ingest records applied and held-duplicate evidence.
- Expo HHQ local submit writes provisional baseline events.
- Dev DB uses full schema push/reset, not migrations.
Rejected:
- Adding Cedar/OPA before command/event boundaries stabilize.
- Continuing procedural-only HHQ promotion.
Open:
- Wire next workflow slice beyond HHQ baseline replay.
Archive:
- `session-log-archive.md#2026-06-18-1004-hhq-event-ingest-and-replay`

## 2026-06-18 10:46 [saved]
Goal: Keep agent instructions concise but replayable.
Decisions:
- `AGENTS.md` stays pointer-focused so startup/runtime rules are hard to miss.
- `docs/architecture.md` holds system design detail because agents need architecture without bloating prompts.
- `docs/testing.md` holds command order and DB caveats because verification sequences are too verbose for AGENTS.
Rejected:
- Long Makefile target lists in `AGENTS.md`.
- Detailed replay sequences in active prompt context.
Open:
- Keep new durable decisions linked from AGENTS or archive.
