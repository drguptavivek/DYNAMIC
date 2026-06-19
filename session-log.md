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

## 2026-06-18 11:22 [saved]
Goal: Start the pregnancy enrollment event-driven slice after HHQ replay.
Decisions:
- `pregnancy_enrolled` is now an event-core reducer/orchestration boundary.
- PEF backend promotion emits `pregnancy_enrolled`, replays it into the pregnancy projection, then schedules PFF/UF through event-core orchestration.
- Held duplicate/rejected pregnancy events are reducer-level no-ops.
Rejected:
- Adding Cedar/OPA before another concrete workflow slice exists.
- Moving the whole WQ/PEF/POF chain in one edit.
Open:
- Add backend duplicate PEF completion classification and data-quality flags.
- Add Expo provisional pregnancy events for offline PEF submit.

## 2026-06-18 12:08 [saved]
Goal: Complete HHQ and pregnancy enrollment end to end across Expo, sync, and backend.
Decisions:
- PEF finalization/sync/backend now completes `pregnancy_enrolled` through PFF/UF generation.
- Duplicate PEF completions are preserved as held evidence with DQ flags.
Rejected:
- Using device/server wall-clock as the primary PEF protocol anchor when `pef_enrollment_date` is present.
Open:
- Refactor Expo HHQ and PEF local task generation to import the shared TS event/workflow kernel once the Expo test/runtime can load workspace TS packages directly.

## 2026-06-18 12:42 [saved]
Goal: Extend event path through PFF evidence and POF outcome.
Decisions:
- PFF sync now records `pregnancy_followup_completed` and holds duplicate task completions.
- POF sync records `pregnancy_outcome_recorded`, outcome rows, child provenance, and BAF tasks from one event.
Rejected:
- Shifting pregnancy enrollment anchors from PFF completion dates.
Open:
- Add Expo provisional POF child/outcome tasks when offline outcome completion is needed.

## 2026-06-19 10:10 [saved]
Goal: Consolidate repo architecture and policy docs into one current canon.
Decisions:
- `docs/architecture.md` is the single agreed architecture.
- Current policy docs live only in `docs/policies/`.
- Superpower skills must not create active DYNAMIC policy docs under `docs/superpowers/`.
- Prior audits, specs, SurveyJS policy notes, and superpowers drafts are archived under `docs/archive/2026-06-19-pre-canonical/`.
- `AGENTS.md` points to the current canon and treats archived docs as historical only.
Rejected:
- Continuing multiple active docs with conflicting architecture and rule precedence.
Open:
- Keep future durable rules promoted into `docs/architecture.md` or `docs/policies/`, not new parallel drafts.

## 2026-06-19 10:35 [saved]
Goal: Promote missing code-direction policies into current canon.
Decisions:
- Preview, drafts/autosave, navigation/progress, route surfaces, and auth/device/scope now have active policies.
- Policy may lead implementation; code drift is debt against `docs/policies/`.
Rejected:
- Waiting for complete code before documenting these operating rules.
Open:
- Implement gaps against the active policy set.

## 2026-06-19 10:50 [saved]
Goal: Checkpoint all current refactor and policy-canon work in git.
Decisions:
- Commit all dirty files together because the user requested one all-file checkpoint.
- Session log records the policy canon before commit so future sessions inherit it.
Rejected:
- Splitting this checkpoint despite explicit all-files commit request.
Open:
- Implement policy/code drift gaps in later commits.
