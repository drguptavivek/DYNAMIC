## 2026-06-18 09:14 [saved]
Goal: Standardize DYNAMIC local dev runtime commands.
Decisions:
- Root Makefile owns dev startup because services need one reproducible container/HMR path.
- Host backend/admin/Expo logs stream foreground-only because PID/log files caused stale-runtime confusion.
- Container DB/edge logs use Make targets because Docker already owns those logs.
Rejected:
- Hand-rolled docker/npm startup when Make target exists.
- Host log or PID files for HMR servers.
Open:
- Keep browser verification after runtime changes.

## 2026-06-18 10:04 [saved]
Goal: Preserve event-driven foundation checkpoint before wiring.
Decisions:
- `packages/event-core` is the shared kernel foundation because backend and Expo must use identical field-originated rules.
- HHQ authoritative ingest is the next wiring slice because it proves evidence, duplicate handling, projection, and sync parity.
- Makefile remains the canonical dev runtime because tests/browser checks need repeatable DB, edge, API, admin, and Expo startup.
Rejected:
- Adding Cedar/OPA before command/event boundaries stabilize.
- Continuing procedural promotion as the long-term sync path.
Open:
- Implement backend HHQ ingest/replay slice.
- Wire Expo HHQ local provisional path.
