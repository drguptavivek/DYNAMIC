# 2026-10-16: Integrate boss BHQ/HDSS branch

Goal: Merge vg-work/bhq-household-individual-ids into fix/offline-bwq-pef-task-flow without losing existing production fixes.

Decisions:
- Merge boss commit f039f73 with current branch bc33a74; preserve both parents in Git history.
- Retain attachment-first image upload/retry, immutable BHQ task provenance, conflict reconciliation, zero-household assignment visibility, existing PEF/PFF skip rules and task schedules.
- Keep boss's optional Ballabhgarh HDSS lookup, village-scoped paged cache, admin CSV upload and logout/session cache safety.
- Exempt only registry metadata from mandatory BHQ validation; normal interview answers remain compulsory.
- Keep village-wide lookup as explicitly approved by the boss/user; it does not replace assigned-household worklist scope.
- Preserve unrelated local AGENTS.md/session-log.md edits and other user artifacts outside the merge.

Verification:
- Passed API/Admin typechecks, all 45 API tests, all 49 event-core tests, full Expo suite, focused HDSS optional-link/cache tests and admin error/TOTP regressions.
- Node-only Expo tests emit existing caught React Native Flow-parser warnings; physical native behavior is not established by those checks.
- No database reset, seed, schema push, source import or production operation authorized by this merge task.

Pending:
- Ballabhgarh Household Survey Dashboard reminder delivered at merge start: today's form counts, villages covered, WQ-eligible women, PEF completions, and staff-wise forms. Additional metrics to be supplied by the user.
- Physical-device/offline end-to-end checks, database integration checks, push, APK rebuild/install and AWS deployment require separate follow-up authorization.

Earlier implementation details are retained in Git history and the two merge parents.